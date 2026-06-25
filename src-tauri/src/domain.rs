use serde::{Deserialize, Serialize};

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainRecord {
    pub name: String,
    pub owner_key: String,
    pub address: Option<String>,
    pub registered_at: String,
    pub expires_at: String,
    pub active: bool,
}

// ─── Conversion Between Domain and Database Records ─────────────────────────

fn domain_to_db(record: &DomainRecord) -> crate::database::DomainRecord {
    let target_port = record.address.as_ref().and_then(|addr| {
        addr.rsplit(':').next().and_then(|s| s.parse::<u16>().ok())
    });
    crate::database::DomainRecord {
        name: record.name.clone(),
        owner_key: record.owner_key.clone(),
        registered_at: record.registered_at.clone(),
        expires_at: record.expires_at.clone(),
        target_port,
        project_id: None,
    }
}

fn db_to_domain(record: &crate::database::DomainRecord) -> DomainRecord {
    let address = record.target_port.map(|port| format!("127.0.0.1:{}", port));
    DomainRecord {
        name: record.name.clone(),
        owner_key: record.owner_key.clone(),
        address,
        registered_at: record.registered_at.clone(),
        expires_at: record.expires_at.clone(),
        active: true,
    }
}

// ─── Validation ──────────────────────────────────────────────────────────────

fn is_valid_domain(name: &str) -> bool {
    if name.len() < 3 || name.len() > 63 {
        return false;
    }
    name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

// ─── Public API ──────────────────────────────────────────────────────────────

pub async fn register(name: &str) -> Result<DomainRecord, String> {
    let name = name.trim().to_lowercase();
    if !is_valid_domain(&name) {
        return Err("Invalid domain name. Use 3-63 chars: lowercase letters, numbers, hyphens.".to_string());
    }

    if let Ok(Some(_)) = crate::database::get_domain_record(&name) {
        return Err(format!("Domain '{}' is already registered.", name));
    }

    let now = chrono::Utc::now();
    let record = DomainRecord {
        name: name.clone(),
        owner_key: generate_owner_key(),
        address: None,
        registered_at: now.to_rfc3339(),
        expires_at: (now + chrono::Duration::days(90)).to_rfc3339(),
        active: true,
    };

    let db_record = domain_to_db(&record);
    crate::database::save_domain_record(&db_record)?;

    log::info!("Domain registered: {}.dweb", name);

    Ok(record)
}

pub async fn resolve(name: &str) -> Result<DomainRecord, String> {
    let name = name.trim().to_lowercase();

    // Check local database first
    if let Ok(Some(db_record)) = crate::database::get_domain_record(&name) {
        return Ok(db_to_domain(&db_record));
    }

    // Try DHT lookup via P2P (DHT-only path — no local DB check, prevents circular calls)
    match crate::p2p::dht_lookup(&name).await {
        Ok(Some(site)) => {
            let now = chrono::Utc::now();
            let record = DomainRecord {
                name: site.domain,
                owner_key: site.peer_id,
                address: Some(format!("{}:{}", site.address, site.port)),
                registered_at: now.to_rfc3339(),
                expires_at: (now + chrono::Duration::hours(1)).to_rfc3339(),
                active: true,
            };
            Ok(record)
        }
        Ok(None) => Err(format!("Domain '{}' not found on the P2P network. Register it first.", name)),
        Err(e) => Err(format!("P2P resolution failed: {}", e)),
    }
}

pub async fn list_domains() -> Result<Vec<DomainRecord>, String> {
    let db_records = crate::database::list_domain_records()?;
    let mut domains: Vec<DomainRecord> = db_records.iter().map(db_to_domain).collect();
    domains.sort_by(|a, b| b.registered_at.cmp(&a.registered_at));
    Ok(domains)
}

pub async fn renew_domain(name: &str) -> Result<DomainRecord, String> {
    let name = name.trim().to_lowercase();

    let mut db_record = crate::database::get_domain_record(&name)?
        .ok_or_else(|| format!("Domain '{}' not found.", name))?;

    let now = chrono::Utc::now();
    db_record.expires_at = (now + chrono::Duration::days(90)).to_rfc3339();
    crate::database::save_domain_record(&db_record)?;

    let record = db_to_domain(&db_record);
    log::info!("Domain renewed: {}.dweb (expires {})", name, record.expires_at);
    Ok(record)
}

pub async fn transfer_domain(name: &str, new_owner: &str) -> Result<DomainRecord, String> {
    let name = name.trim().to_lowercase();

    let mut db_record = crate::database::get_domain_record(&name)?
        .ok_or_else(|| format!("Domain '{}' not found.", name))?;

    db_record.owner_key = new_owner.to_string();
    crate::database::save_domain_record(&db_record)?;

    let record = db_to_domain(&db_record);
    log::info!("Domain transferred: {}.dweb -> {}", name, new_owner);
    Ok(record)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn generate_owner_key() -> String {
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    let mut key = [0u8; 16];
    rng.fill_bytes(&mut key);
    hex::encode(key)
}
