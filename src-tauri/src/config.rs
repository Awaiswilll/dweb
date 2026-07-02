// Dependencies needed in Cargo.toml:
//
// Under [features], add:
//   encryption = ["aes-gcm"]
//
// Under [dependencies], add:
//   aes-gcm = { version = "0.7", optional = true }
//
// base64 = "0.22" and sha2 = "0.10" are already present.

use crate::ai::ProviderConfig;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::path::PathBuf;

// ─── Encryption helpers ─────────────────────────────────────────────────────

fn derive_encryption_key() -> [u8; 32] {
    let seed = format!("{}-dweb-secret-v1", std::env::consts::ARCH);
    let hash = sha2::Sha256::digest(seed.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash);
    key
}

#[cfg(feature = "encryption")]
fn encrypt_value(plaintext: &str) -> Option<String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
    use rand::RngCore;

    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&derive_encryption_key());
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).ok()?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Some(BASE64.encode(&combined))
}

#[cfg(feature = "encryption")]
fn decrypt_value(ciphertext_b64: &str) -> Option<String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

    let combined = BASE64.decode(ciphertext_b64.as_bytes()).ok()?;
    if combined.len() < 12 {
        return None;
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&derive_encryption_key());
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(plaintext).ok()
}

#[cfg(not(feature = "encryption"))]
fn encrypt_value(plaintext: &str) -> Option<String> {
    log::warn!("[dweb] encryption disabled: storing sensitive credentials in plaintext");
    Some(plaintext.to_string())
}

#[cfg(not(feature = "encryption"))]
fn decrypt_value(ciphertext_b64: &str) -> Option<String> {
    Some(ciphertext_b64.to_string())
}

// ─── Structs ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub data_dir: PathBuf,
    pub p2p_port: u16,
    pub relay_enabled: bool,
    pub relay_server: Option<String>,
    pub cloud_providers: CloudProviders,
    pub ai_providers: Vec<ProviderConfig>,
    pub active_ai_provider: String,
    pub active_ai_model: String,
    pub auto_start_services: Vec<String>,
    pub theme: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudProviders {
    pub aws_access_key: Option<String>,
    pub aws_secret_key: Option<String>,
    pub aws_region: Option<String>,
    pub netlify_token: Option<String>,
    pub vercel_token: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::from("."),
            p2p_port: 0,
            relay_enabled: false,
            relay_server: None,
            cloud_providers: CloudProviders {
                aws_access_key: None,
                aws_secret_key: None,
                aws_region: None,
                netlify_token: None,
                vercel_token: None,
            },
            ai_providers: crate::ai::default_providers(),
            active_ai_provider: "ollama".into(),
            active_ai_model: "qwen2.5-coder:7b".into(),
            auto_start_services: vec![],
            theme: "dark".to_string(),
        }
    }
}

impl AppConfig {
    pub fn load() -> Self {
        let config_path = get_config_path();
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(mut config) = serde_json::from_str::<Self>(&content) {
                let cp = &mut config.cloud_providers;

                if let Some(val) = cp.aws_access_key.take() {
                    cp.aws_access_key = val
                        .strip_prefix("enc:")
                        .and_then(|v| decrypt_value(v))
                        .or(Some(val));
                }
                if let Some(val) = cp.aws_secret_key.take() {
                    cp.aws_secret_key = val
                        .strip_prefix("enc:")
                        .and_then(|v| decrypt_value(v))
                        .or(Some(val));
                }
                if let Some(val) = cp.netlify_token.take() {
                    cp.netlify_token = val
                        .strip_prefix("enc:")
                        .and_then(|v| decrypt_value(v))
                        .or(Some(val));
                }
                if let Some(val) = cp.vercel_token.take() {
                    cp.vercel_token = val
                        .strip_prefix("enc:")
                        .and_then(|v| decrypt_value(v))
                        .or(Some(val));
                }

                return config;
            }
        }
        let config = Self::default();
        let _ = config.save();
        config
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let config_path = get_config_path();
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut value = serde_json::to_value(self)?;

        if let Some(providers) = value
            .get_mut("cloud_providers")
            .and_then(|v| v.as_object_mut())
        {
            for field in [
                "aws_access_key",
                "aws_secret_key",
                "netlify_token",
                "vercel_token",
            ] {
                if let Some(serde_json::Value::String(val)) = providers.get_mut(field) {
                    if val.is_empty() || val.starts_with("enc:") {
                        continue;
                    }
                    if let Some(encrypted) = encrypt_value(val) {
                        *val = format!("enc:{}", encrypted);
                    }
                }
            }
        }

        let content = serde_json::to_string_pretty(&value)?;
        std::fs::write(&config_path, content)?;
        Ok(())
    }
}

fn get_config_path() -> PathBuf {
    let data_dir = crate::get_data_dir();
    data_dir.join("config.json")
}

/// Load AI provider configs into the static store
pub async fn load_ai_providers() {
    let config = AppConfig::load();
    for provider in config.ai_providers {
        crate::ai::update_provider(provider).await;
    }
}

// ─── Tauri commands for config management ─────────────────────────────────

#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    Ok(AppConfig::load())
}

#[tauri::command]
pub async fn save_config(config: AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}
