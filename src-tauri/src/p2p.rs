use dht_rpc::{Commit, DhtConfig, IdBytes};
use futures::StreamExt;
use hyperdht::{adht::Dht, Keypair};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishedSite {
    pub domain: String,
    pub port: u16,
    pub peer_id: String,
    pub address: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct P2PStatus {
    pub connected_peers: usize,
    pub routing_table_size: usize,
    pub domains_resolved: u64,
    pub uptime_seconds: u64,
    pub public_key: String,
    /// Human-readable NAT status
    pub nat_status: String,
    pub port: u16,
}

// ─── DHT Bootstrap Nodes ───────────────────────────────────────────────────

/// Default bootstrap nodes for the HyperDHT network.
/// These are well-known public DHT nodes that help new peers join the network.
const BOOTSTRAP_NODES: &[&str] = &[
    "bootstrap1.dweb.net:49737",
    "bootstrap2.dweb.net:49737",
    "bootstrap3.dweb.net:49737",
];

// ─── Singleton ──────────────────────────────────────────────────────────────

static P2P_MANAGER: Lazy<Arc<Mutex<Option<P2PManager>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

/// Initialize the global P2P manager (called once at startup).
pub async fn init(data_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    // Shut down any existing manager first to kill orphaned tasks
    let mut guard = P2P_MANAGER.lock().await;
    if let Some(old) = guard.take() {
        old.shutdown().await;
        log::info!("P2P previous manager shut down");
    }
    drop(guard);

    let manager = P2PManager::new(data_dir).await?;
    let mut guard = P2P_MANAGER.lock().await;
    *guard = Some(manager);
    log::info!("P2P manager initialized");
    Ok(())
}

/// Convenience: get a reference to the singleton manager.
async fn with_manager(
) -> Result<tokio::sync::MutexGuard<'static, Option<P2PManager>>, Box<dyn std::error::Error>> {
    let guard = P2P_MANAGER.lock().await;
    if guard.is_some() {
        Ok(guard)
    } else {
        Err("P2P manager not initialized".into())
    }
}

// ─── P2P Manager ────────────────────────────────────────────────────────────

/// Persistent P2P node connected to the HyperDHT network.
pub struct P2PManager {
    dht: Arc<Mutex<Option<Dht>>>,
    keypair: Keypair,
    started_at: chrono::DateTime<chrono::Utc>,
    resolved_count: std::sync::atomic::AtomicU64,
    #[allow(dead_code)]
    data_dir: PathBuf,
    /// Tracked background task handles — aborted on shutdown to prevent orphaned-task panics
    task_handles: Vec<tokio::task::JoinHandle<()>>,
}

impl P2PManager {
    /// Create and bootstrap a new P2P node.
    pub async fn new(data_dir: &PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let mut config = DhtConfig::default();
        // Configure bootstrap nodes for the DHT
        let nodes: Vec<std::net::SocketAddr> = BOOTSTRAP_NODES
            .iter()
            .filter_map(|s| s.parse().ok())
            .collect();
        if !nodes.is_empty() {
            config.bootstrap_nodes = nodes;
        }

        let dht = Dht::with_config(config).await?;
        log::info!("P2P bootstrapping to DHT network...");
        dht.bootstrap().await?;

        // CRITICAL FIX: drive() spawns background tasks. Wrap in tokio::spawn
        // so we can track and abort the handle on shutdown, preventing the
        // ~17s orphaned-task crash.
        let mut task_handles: Vec<tokio::task::JoinHandle<()>> = Vec::new();
        // dht.drive() typically needs &mut self; clone the Arc for the task
        // We hold the dht in Arc<Mutex<Option<Dht>>>, so we re-wrap after bootstrapping
        let dht_arc = Arc::new(Mutex::new(Some(dht)));

        // Spawn the DHT event loop as a tracked task
        {
            let dht_clone = dht_arc.clone();
            let handle = tokio::spawn(async move {
                loop {
                    let mut guard = dht_clone.lock().await;
                    if let Some(ref mut dht) = *guard {
                        // drive() processes DHT events — it may block or yield
                        // If it returns, we re-lock and re-drive
                        dht.drive();
                    }
                    drop(guard);
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            });
            task_handles.push(handle);
        }

        log::info!("P2P node connected and driving DHT events");

        Ok(Self {
            dht: dht_arc,
            keypair: Keypair::default(),
            started_at: chrono::Utc::now(),
            resolved_count: std::sync::atomic::AtomicU64::new(0),
            data_dir: data_dir.clone(),
            task_handles,
        })
    }

    /// Abort all tracked background tasks. Call before dropping to prevent
    /// orphaned-task panics in the Tokio runtime.
    pub async fn shutdown(&self) {
        for handle in &self.task_handles {
            handle.abort();
        }
        // Wait briefly for tasks to actually stop
        for handle in &self.task_handles {
            let _ = handle.await;
        }
        log::info!(
            "P2P manager: {} background task(s) aborted",
            self.task_handles.len()
        );
    }

    /// Hex-encoded public key of this node.
    pub fn public_key_hex(&self) -> String {
        hex::encode(&self.keypair.public[..])
    }

    /// Announce a domain on the DHT so remote peers can discover it.
    pub async fn announce_domain(
        &self,
        name: &str,
        port: u16,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let topic = domain_topic(name);
        let dht_lock = self.dht.lock().await;
        if let Some(ref dht) = *dht_lock {
            dht.announce(IdBytes(topic), self.keypair.clone(), vec![])
                .await?;
            log::info!("Announced {}.dweb on DHT (port {})", name, port);
        }
        Ok(())
    }

    /// Look up a domain on the DHT. Returns the first peer that announced it.
    /// Before querying the DHT, checks the local domain store (localhost shortcut).
    pub async fn resolve_domain(
        &self,
        name: &str,
    ) -> Result<Option<PublishedSite>, Box<dyn std::error::Error>> {
        let name = name.trim().to_lowercase();

        // Step 1: Check local domain store first (localhost shortcut).
        // If the domain is registered by any local instance, return it directly.
        if let Ok(Some(local_record)) = crate::database::get_domain_record(&name) {
            if let Some(port) = local_record.target_port {
                self.resolved_count
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                log::info!("Resolved {}.dweb locally (port {})", name, port);
                return Ok(Some(PublishedSite {
                    domain: name.clone(),
                    port,
                    peer_id: self.public_key_hex(),
                    address: "127.0.0.1".to_string(),
                    active: true,
                }));
            }
        }

        // Step 2: DHT lookup — poll the stream for real results.
        let topic = domain_topic(&name);
        let dht_lock = self.dht.lock().await;
        if let Some(ref dht) = *dht_lock {
            let mut lookup_stream = dht.lookup(IdBytes(topic), Commit::No)?;

            // Drop the DHT lock before awaiting — the stream does not borrow Dht.
            drop(dht_lock);

            // Poll the stream for the first result (with a 10-second timeout).
            let timeout_duration = std::time::Duration::from_secs(10);
            let timed_result = tokio::time::timeout(timeout_duration, lookup_stream.next()).await;

            match timed_result {
                Ok(Some(Ok(Some(response)))) => {
                    // response is LookupResponse with peers: Vec<Peer>
                    log::debug!(
                        "DHT lookup for {}.dweb got batch of {} peers",
                        name,
                        response.peers.len()
                    );

                    if let Some(first) = response.peers.first() {
                        let peer_id = hex::encode(&*first.public_key);
                        let address = first
                            .relay_addresses
                            .first()
                            .map(|a| a.ip().to_string())
                            .unwrap_or_else(|| "0.0.0.0".to_string());
                        let port = first.relay_addresses.first().map(|a| a.port()).unwrap_or(0);

                        self.resolved_count
                            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        log::info!(
                            "Resolved {}.dweb on DHT → {}:{} (peer: {}…)",
                            name,
                            address,
                            port,
                            &peer_id[..8]
                        );

                        return Ok(Some(PublishedSite {
                            domain: name.clone(),
                            port,
                            peer_id,
                            address,
                            active: true,
                        }));
                    }
                }
                Ok(Some(Ok(None))) => {
                    log::debug!(
                        "DHT lookup for {}.dweb returned empty batch (no peers)",
                        name
                    );
                }
                Ok(Some(Err(e))) => {
                    log::warn!("DHT lookup error for {}.dweb: {}", name, e);
                }
                Ok(None) => {
                    log::debug!("DHT lookup stream for {}.dweb ended", name);
                }
                Err(_elapsed) => {
                    log::warn!("DHT lookup for {}.dweb timed out after 10s", name);
                }
            }
        }

        Ok(None)
    }

    /// DHT-only lookup that skips the local DB check.
    /// Used by domain::resolve() to avoid redundant DB lookups and prevent circular calls.
    pub async fn resolve_domain_dht_only(
        &self,
        name: &str,
    ) -> Result<Option<PublishedSite>, Box<dyn std::error::Error>> {
        let name = name.trim().to_lowercase();
        let topic = domain_topic(&name);
        let dht_lock = self.dht.lock().await;
        if let Some(ref dht) = *dht_lock {
            let mut lookup_stream = dht.lookup(IdBytes(topic), Commit::No)?;
            drop(dht_lock);

            let timeout_duration = std::time::Duration::from_secs(10);
            let timed_result = tokio::time::timeout(timeout_duration, lookup_stream.next()).await;

            match timed_result {
                Ok(Some(Ok(Some(response)))) => {
                    if let Some(first) = response.peers.first() {
                        let peer_id = hex::encode(&*first.public_key);
                        let address = first
                            .relay_addresses
                            .first()
                            .map(|a| a.ip().to_string())
                            .unwrap_or_else(|| "0.0.0.0".to_string());
                        let port = first.relay_addresses.first().map(|a| a.port()).unwrap_or(0);

                        self.resolved_count
                            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        log::info!(
                            "DHT resolved {}.dweb → {}:{} (peer: {}…)",
                            name,
                            address,
                            port,
                            &peer_id[..8]
                        );

                        return Ok(Some(PublishedSite {
                            domain: name.clone(),
                            port,
                            peer_id,
                            address,
                            active: true,
                        }));
                    }
                }
                Ok(Some(Ok(None))) => {
                    log::debug!("DHT lookup for {}.dweb returned empty batch", name);
                }
                Ok(Some(Err(e))) => {
                    log::warn!("DHT lookup error for {}.dweb: {}", name, e);
                }
                Ok(None) => {
                    log::debug!("DHT lookup stream for {}.dweb ended", name);
                }
                Err(_elapsed) => {
                    log::warn!("DHT lookup for {}.dweb timed out after 10s", name);
                }
            }
        }
        Ok(None)
    }

    /// Current P2P network status.
    pub fn status(&self) -> P2PStatus {
        let uptime = chrono::Utc::now() - self.started_at;
        P2PStatus {
            connected_peers: 0,    // TODO: expose from Dht node
            routing_table_size: 0, // TODO: expose from Dht node
            domains_resolved: self
                .resolved_count
                .load(std::sync::atomic::Ordering::Relaxed),
            uptime_seconds: uptime.num_seconds().max(0) as u64,
            public_key: self.public_key_hex(),
            nat_status: "unknown".to_string(),
            port: 0,
        }
    }
}

// ─── Domain Topic Hashing ───────────────────────────────────────────────────

/// Deterministically hash a domain name into a 32-byte DHT topic.
/// Uses SHA-256 for consistent, well-distributed topic IDs.
fn domain_topic(name: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    let result = hasher.finalize();
    let mut topic = [0u8; 32];
    topic.copy_from_slice(&result);
    topic
}

// ─── Public Free-Function API ───────────────────────────────────────────────

/// Announce a domain on the P2P network (uses the global singleton manager).
pub async fn publish(name: &str, port: u16) -> Result<String, Box<dyn std::error::Error>> {
    let guard = with_manager().await?;
    let mgr = guard.as_ref().unwrap();

    let _ = mgr.announce_domain(name, port).await?;

    // Also persist to the local domain database for localhost shortcut resolution.
    let public_key = mgr.public_key_hex();
    drop(guard); // release before DB write

    let record = crate::database::DomainRecord {
        name: name.to_string(),
        owner_key: public_key,
        registered_at: chrono::Utc::now().to_rfc3339(),
        expires_at: (chrono::Utc::now() + chrono::Duration::days(90)).to_rfc3339(),
        target_port: Some(port),
        project_id: None,
    };
    let _ = crate::database::save_domain_record(&record);

    Ok(format!("dweb://{}.dweb", name))
}

/// Resolve a .dweb domain (checks local store first, then DHT lookup).
pub async fn resolve(name: &str) -> Result<Option<PublishedSite>, Box<dyn std::error::Error>> {
    let name = name.trim().to_lowercase();

    // Step 1: Try local database (localhost shortcut for same-machine instances).
    if let Ok(Some(record)) = crate::database::get_domain_record(&name) {
        if let Some(port) = record.target_port {
            return Ok(Some(PublishedSite {
                domain: name.clone(),
                port,
                peer_id: record.owner_key,
                address: "127.0.0.1".to_string(),
                active: true,
            }));
        }
    }

    // Step 2: Try DHT lookup via the manager.
    let guard = with_manager().await?;
    let mgr = guard.as_ref().unwrap();
    mgr.resolve_domain(&name).await
}

/// Get real P2P status from the global manager.
pub async fn get_status() -> P2PStatus {
    let guard = P2P_MANAGER.lock().await;
    match guard.as_ref() {
        Some(mgr) => mgr.status(),
        None => P2PStatus {
            connected_peers: 0,
            routing_table_size: 0,
            domains_resolved: 0,
            uptime_seconds: 0,
            public_key: "uninitialized".to_string(),
            nat_status: "not started".to_string(),
            port: 0,
        },
    }
}

/// DHT-only domain lookup without local DB check (avoids circular calls with domain::resolve()).
pub async fn dht_lookup(name: &str) -> Result<Option<PublishedSite>, Box<dyn std::error::Error>> {
    let guard = with_manager().await?;
    let mgr = guard.as_ref().unwrap();
    mgr.resolve_domain_dht_only(name).await
}
