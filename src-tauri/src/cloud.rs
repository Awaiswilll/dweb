use crate::config::AppConfig;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Serialize, Deserialize)]
pub struct DeploymentResult {
    pub provider: String,
    pub url: String,
    pub success: bool,
    pub message: String,
}

pub async fn deploy(provider: &str, domain: &str) -> Result<String, Box<dyn std::error::Error>> {
    match provider {
        "aws" => deploy_aws(domain).await,
        "netlify" => deploy_netlify(domain).await,
        "vercel" => deploy_vercel(domain).await,
        _ => Err(format!("Unknown provider: {}", provider).into()),
    }
}

// ─── HMAC-SHA256 helpers (used by AWS SigV4) ──────────────────────────────────

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    const BLOCK_SIZE: usize = 64;
    let mut k = key.to_vec();
    if k.len() > BLOCK_SIZE {
        k = Sha256::digest(&k).to_vec();
    }
    k.resize(BLOCK_SIZE, 0);
    let mut ipad = vec![0x36u8; BLOCK_SIZE];
    let mut opad = vec![0x5cu8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let inner = Sha256::digest(&[ipad, data.to_vec()].concat());
    Sha256::digest(&[opad, inner.to_vec()].concat()).to_vec()
}

fn get_signature_key(key: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{}", key).as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

// ─── AWS S3 ───────────────────────────────────────────────────────────────────

async fn deploy_aws(domain: &str) -> Result<String, Box<dyn std::error::Error>> {
    let config = AppConfig::load();
    let region = config
        .cloud_providers
        .aws_region
        .or_else(|| std::env::var("AWS_REGION").ok())
        .unwrap_or_else(|| "us-east-1".to_string());
    let access_key = config
        .cloud_providers
        .aws_access_key
        .or_else(|| std::env::var("AWS_ACCESS_KEY_ID").ok())
        .ok_or_else(|| "AWS Access Key not configured".to_string())?;
    let secret_key = config
        .cloud_providers
        .aws_secret_key
        .or_else(|| std::env::var("AWS_SECRET_ACCESS_KEY").ok())
        .ok_or_else(|| "AWS Secret Key not configured".to_string())?;

    let host = format!("s3.{}.amazonaws.com", region);
    let url = format!("https://{}/{}", host, domain);
    let service = "s3";

    let now = chrono::Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let body = if region == "us-east-1" {
        String::new()
    } else {
        format!(
            r#"<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <LocationConstraint>{}</LocationConstraint>
</CreateBucketConfiguration>"#,
            region
        )
    };

    let payload_hash = hex::encode(Sha256::digest(body.as_bytes()));

    let canonical_uri = format!("/{}", domain);
    let canonical_querystring = "";
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_hash, amz_date
    );
    let canonical_request = format!(
        "PUT\n{}\n{}\n{}\n{}\n{}",
        canonical_uri,
        canonical_querystring,
        canonical_headers,
        signed_headers,
        payload_hash
    );

    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        algorithm,
        amz_date,
        credential_scope,
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );

    let signing_key = get_signature_key(&secret_key, &date_stamp, &region, service);
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    let authorization = format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        algorithm, access_key, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::new();
    let mut req = client
        .put(&url)
        .header("Host", &host)
        .header("x-amz-content-sha256", &payload_hash)
        .header("x-amz-date", &amz_date)
        .header("Authorization", &authorization);

    if !body.is_empty() {
        req = req
            .header("Content-Type", "application/xml")
            .body(body);
    }

    let response = req.send().await?;

    if response.status().is_success() {
        let result = DeploymentResult {
            provider: "AWS S3".to_string(),
            url: format!("https://{}.s3.amazonaws.com", domain),
            success: true,
            message: "S3 bucket created. Configure it for static website hosting.".to_string(),
        };
        Ok(serde_json::to_string(&result)?)
    } else {
        let status = response.status();
        let body_text = response.text().await?;
        let result = DeploymentResult {
            provider: "AWS S3".to_string(),
            url: String::new(),
            success: false,
            message: format!("AWS error ({}): {}", status, body_text),
        };
        Ok(serde_json::to_string(&result)?)
    }
}

// ─── Netlify ──────────────────────────────────────────────────────────────────

async fn deploy_netlify(domain: &str) -> Result<String, Box<dyn std::error::Error>> {
    let config = AppConfig::load();
    let token = config
        .cloud_providers
        .netlify_token
        .ok_or_else(|| "Netlify token not configured".to_string())?;

    let client = reqwest::Client::new();
    let body = serde_json::json!({ "name": domain });

    let response = client
        .post("https://api.netlify.com/api/v1/sites")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await?;
        let site_url = data["ssl_url"]
            .as_str()
            .or_else(|| data["url"].as_str())
            .unwrap_or(&format!("https://{}.netlify.app", domain));

        let result = DeploymentResult {
            provider: "Netlify".to_string(),
            url: site_url.to_string(),
            success: true,
            message: "Site deployed to Netlify.".to_string(),
        };
        Ok(serde_json::to_string(&result)?)
    } else {
        let status = response.status();
        let body_text = response.text().await?;
        let result = DeploymentResult {
            provider: "Netlify".to_string(),
            url: String::new(),
            success: false,
            message: format!("Netlify error ({}): {}", status, body_text),
        };
        Ok(serde_json::to_string(&result)?)
    }
}

// ─── Vercel ───────────────────────────────────────────────────────────────────

async fn deploy_vercel(domain: &str) -> Result<String, Box<dyn std::error::Error>> {
    let config = AppConfig::load();
    let token = config
        .cloud_providers
        .vercel_token
        .ok_or_else(|| "Vercel token not configured".to_string())?;

    let client = reqwest::Client::new();
    let body = serde_json::json!({ "name": domain });

    let response = client
        .post("https://api.vercel.com/v9/projects")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await?;
        let project_name = data["name"].as_str().unwrap_or(domain);
        let project_url = format!("https://{}.vercel.app", project_name);

        let result = DeploymentResult {
            provider: "Vercel".to_string(),
            url: project_url,
            success: true,
            message: "Vercel project created. Deploy via `vercel` CLI or git push.".to_string(),
        };
        Ok(serde_json::to_string(&result)?)
    } else {
        let status = response.status();
        let body_text = response.text().await?;
        let result = DeploymentResult {
            provider: "Vercel".to_string(),
            url: String::new(),
            success: false,
            message: format!("Vercel error ({}): {}", status, body_text),
        };
        Ok(serde_json::to_string(&result)?)
    }
}
