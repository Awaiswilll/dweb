use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::Mutex;

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

// ─── In-Memory Domain Store ──────────────────────────────────────────────────

static DOMAINS: LazyLock<Mutex<HashMap<String, DomainRecord>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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

    let mut records = DOMAINS.lock().await;
    if records.contains_key(&name) {
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

    records.insert(name.clone(), record.clone());

    // In full implementation, announce on DHT here
    log::info!("Domain registered: {}.dweb", name);

    Ok(record)
}

pub async fn resolve(name: &str) -> Result<DomainRecord, String> {
    let records = DOMAINS.lock().await;
    let name = name.trim().to_lowercase();

    // Check local store first
    if let Some(record) = records.get(&name) {
        if record.active {
            return Ok(record.clone());
        }
    }
    drop(records); // release lock before DHT call

    // Try DHT lookup via P2P manager
    match crate::p2p::resolve(&name).await {
        Ok(Some(site)) => {
            let now = chrono::Utc::now();
            let record = DomainRecord {
                name: site.domain.clone(),
                owner_key: site.peer_id,
                address: Some(format!("{}:{}", site.address, site.port)),
                registered_at: now.to_rfc3339(),
                expires_at: (now + chrono::Duration::hours(1)).to_rfc3339(),
                active: true,
            };
            // Cache in local store
            let mut records = DOMAINS.lock().await;
            records.insert(name, record.clone());
            Ok(record)
        }
        Ok(None) => Err(format!("Domain '{}' not found on the P2P network. Register it first.", name)),
        Err(e) => Err(format!("P2P resolution failed: {}", e)),
    }
}

pub async fn list_domains() -> Result<Vec<DomainRecord>, String> {
    let records = DOMAINS.lock().await;
    let mut domains: Vec<DomainRecord> = records.values().cloned().collect();
    domains.sort_by(|a, b| b.registered_at.cmp(&a.registered_at));
    Ok(domains)
}

pub async fn renew_domain(name: &str) -> Result<DomainRecord, String> {
    let mut records = DOMAINS.lock().await;
    let name = name.trim().to_lowercase();

    if let Some(record) = records.get_mut(&name) {
        let now = chrono::Utc::now();
        record.expires_at = (now + chrono::Duration::days(90)).to_rfc3339();
        record.active = true;
        log::info!("Domain renewed: {}.dweb (expires {})", name, record.expires_at);
        Ok(record.clone())
    } else {
        Err(format!("Domain '{}' not found.", name))
    }
}

pub async fn transfer_domain(name: &str, new_owner: &str) -> Result<DomainRecord, String> {
    let mut records = DOMAINS.lock().await;
    let name = name.trim().to_lowercase();

    if let Some(record) = records.get_mut(&name) {
        record.owner_key = new_owner.to_string();
        log::info!("Domain transferred: {}.dweb -> {}", name, new_owner);
        Ok(record.clone())
    } else {
        Err(format!("Domain '{}' not found.", name))
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn generate_owner_key() -> String {
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    let mut key = [0u8; 16];
    rng.fill_bytes(&mut key);
    hex::encode(key)
}
