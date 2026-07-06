#![allow(unexpected_cfgs)]

pub mod ai;
pub mod cloud;
pub mod config;
pub mod database;
pub mod domain;
pub mod git;
pub mod github;
pub mod p2p;
pub mod sandbox;
pub mod stack;

use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

// ─── Global Instance State ───────────────────────────────────────────────────

static DATA_DIR: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));
static INSTANCE_PORT: Lazy<Mutex<u16>> = Lazy::new(|| Mutex::new(5173));
static INSTANCE_NAME: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));

/// Set instance-global data dir. Must be called before any other operation.
pub fn set_data_dir(path: PathBuf) {
    if let Ok(mut guard) = DATA_DIR.lock() {
        *guard = Some(path);
    }
}

/// Get the current instance's data directory.
pub fn get_data_dir() -> PathBuf {
    if let Ok(guard) = DATA_DIR.lock() {
        if let Some(ref path) = *guard {
            return path.clone();
        }
    }
    // Fallback: user config dir + dweb
    dirs_next::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("dweb")
}

pub fn set_instance_port(port: u16) {
    if let Ok(mut guard) = INSTANCE_PORT.lock() {
        *guard = port;
    }
}

pub fn get_instance_port() -> u16 {
    if let Ok(guard) = INSTANCE_PORT.lock() {
        *guard
    } else {
        5173
    }
}

pub fn set_instance_name(name: Option<String>) {
    if let Ok(mut guard) = INSTANCE_NAME.lock() {
        *guard = name.unwrap_or_default();
    }
}

pub fn get_instance_name() -> String {
    if let Ok(guard) = INSTANCE_NAME.lock() {
        guard.clone()
    } else {
        String::new()
    }
}

// ─── Data Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub name: String,
    pub running: bool,
    pub port: u16,
    pub cpu: f64,
    pub memory: u64,
}

// ─── Stack Manager Commands ──────────────────────────────────────────────────

#[tauri::command]
async fn get_services() -> Result<Vec<ServiceStatus>, String> {
    let mut services = stack::list_services().await.map_err(|e| e.to_string())?;
    // If no services in the managed list, detect runtimes and add them
    if services.is_empty() {
        let runtimes = stack::detect_runtimes().await.map_err(|e| e.to_string())?;
        for rt in runtimes {
            if let Some((name, port)) = parse_runtime(&rt) {
                let _ =
                    stack::add_service(&name, stack::ServiceType::Runtime, port, "detected", false)
                        .await;
            }
        }
        services = stack::list_services().await.map_err(|e| e.to_string())?;
    }
    Ok(services)
}

#[tauri::command]
async fn start_service(name: String) -> Result<(), String> {
    stack::start_service(&name).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_service(name: String) -> Result<(), String> {
    stack::stop_service(&name).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn restart_service(name: String) -> Result<(), String> {
    stack::stop_service(&name)
        .await
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    stack::start_service(&name).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn detect_runtimes() -> Result<Vec<String>, String> {
    stack::detect_runtimes().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn detect_databases() -> Result<Vec<String>, String> {
    stack::detect_databases().await.map_err(|e| e.to_string())
}

fn parse_runtime(rt: &str) -> Option<(String, u16)> {
    let rt_lower = rt.to_lowercase();
    if rt_lower.contains("node.js") {
        Some(("Node.js".into(), 3000))
    } else if rt_lower.contains("python") {
        Some(("Python".into(), 8000))
    } else if rt_lower.contains("php") {
        Some(("PHP".into(), 8080))
    } else if rt_lower.contains("go") {
        Some(("Go".into(), 8080))
    } else if rt_lower.contains("ruby") {
        Some(("Ruby".into(), 3000))
    } else if rt_lower.contains("mysql") {
        Some(("MySQL".into(), 3306))
    } else if rt_lower.contains("postgresql") || rt_lower.contains("psql") {
        Some(("PostgreSQL".into(), 5432))
    } else if rt_lower.contains("mongodb") || rt_lower.contains("mongod") {
        Some(("MongoDB".into(), 27017))
    } else if rt_lower.contains("redis") {
        Some(("Redis".into(), 6379))
    } else {
        None
    }
}

// ─── P2P Commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn publish_site(domain: String, port: u16) -> Result<String, String> {
    p2p::publish(&domain, port).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn resolve_domain(domain: String) -> Result<domain::DomainRecord, String> {
    let resolved = p2p::resolve(&domain).await.map_err(|e| e.to_string())?;
    match resolved {
        Some(site) => {
            // Persist to domain store for caching
            let record = domain::DomainRecord {
                name: site.domain.clone(),
                owner_key: site.peer_id,
                address: Some(format!("{}:{}", site.address, site.port)),
                registered_at: chrono::Utc::now().to_rfc3339(),
                expires_at: (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
                active: site.active,
            };
            // Also save to database for localhost shortcut
            let db_record = crate::database::DomainRecord {
                name: site.domain,
                owner_key: record.owner_key.clone(),
                registered_at: record.registered_at.clone(),
                expires_at: record.expires_at.clone(),
                target_port: None,
                project_id: None,
            };
            let _ = crate::database::save_domain_record(&db_record);
            Ok(record)
        }
        None => Err(format!(
            "Domain '{}' not found on the network. Register it first.",
            domain
        )),
    }
}

#[tauri::command]
async fn get_p2p_status() -> Result<String, String> {
    let status = p2p::get_status().await;
    serde_json::to_string(&status).map_err(|e| e.to_string())
}

// ─── Domain Commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn register_domain(name: String) -> Result<domain::DomainRecord, String> {
    let record = domain::register(&name).await.map_err(|e| e.to_string())?;
    // Also announce on the P2P network immediately
    let _ = p2p::publish(&name, 0).await;
    Ok(record)
}

#[tauri::command]
async fn list_domains() -> Result<Vec<domain::DomainRecord>, String> {
    domain::list_domains().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn renew_domain(name: String) -> Result<domain::DomainRecord, String> {
    domain::renew_domain(&name).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn transfer_domain(name: String, new_owner: String) -> Result<domain::DomainRecord, String> {
    domain::transfer_domain(&name, &new_owner)
        .await
        .map_err(|e| e.to_string())
}

// ─── AI Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_ai_providers() -> Result<Vec<ai::ProviderConfig>, String> {
    Ok(ai::get_providers().await)
}

#[tauri::command]
async fn update_ai_provider(config: ai::ProviderConfig) -> Result<(), String> {
    ai::update_provider(config).await;
    // Also persist to disk
    let mut app_config = config::AppConfig::load();
    app_config.ai_providers = ai::get_providers().await;
    app_config.save().map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_active_ai(provider: String, model: String) -> Result<(), String> {
    let mut app_config = config::AppConfig::load();
    app_config.active_ai_provider = provider;
    app_config.active_ai_model = model;
    app_config.save().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_active_ai() -> Result<(String, String), String> {
    let config = config::AppConfig::load();
    Ok((config.active_ai_provider, config.active_ai_model))
}

// ─── Cloud Commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn deploy_to_cloud(provider: String, domain: String) -> Result<String, String> {
    cloud::deploy(&provider, &domain)
        .await
        .map_err(|e| e.to_string())
}

// ─── Git / Version Control Commands ──────────────────────────────────────────

#[tauri::command]
async fn git_init_repo(path: String) -> Result<git::RepoInfo, String> {
    git::init_repo(&std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_clone_repo(url: String, path: String) -> Result<git::RepoInfo, String> {
    git::clone_repo(&url, &std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_repo_status(path: String) -> Result<git::RepoInfo, String> {
    git::get_repo_status(&std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_stage_all(path: String) -> Result<git::GitOperationResult, String> {
    git::stage_all(&std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_stage_files(
    path: String,
    files: Vec<String>,
) -> Result<git::GitOperationResult, String> {
    git::stage_files(&std::path::PathBuf::from(&path), files)
}

#[tauri::command]
async fn git_unstage_all(path: String) -> Result<git::GitOperationResult, String> {
    git::unstage_all(&std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_commit(path: String, message: String) -> Result<git::CommitInfo, String> {
    git::commit(&std::path::PathBuf::from(&path), &message)
}

#[tauri::command]
async fn git_push(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<git::GitOperationResult, String> {
    git::push(
        &std::path::PathBuf::from(&path),
        remote.as_deref(),
        branch.as_deref(),
    )
}

#[tauri::command]
async fn git_pull(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<git::GitOperationResult, String> {
    git::pull(
        &std::path::PathBuf::from(&path),
        remote.as_deref(),
        branch.as_deref(),
    )
}

#[tauri::command]
async fn git_branches(path: String) -> Result<Vec<git::BranchInfo>, String> {
    git::list_branches(&std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_switch_branch(path: String, name: String) -> Result<git::GitOperationResult, String> {
    git::switch_branch(&std::path::PathBuf::from(&path), &name)
}

#[tauri::command]
async fn git_delete_branch(path: String, name: String) -> Result<git::GitOperationResult, String> {
    git::delete_branch(&std::path::PathBuf::from(&path), &name)
}

#[tauri::command]
async fn git_remotes(path: String) -> Result<Vec<git::RemoteInfo>, String> {
    git::list_remotes(&std::path::PathBuf::from(&path))
}

#[tauri::command]
async fn git_add_remote(
    path: String,
    name: String,
    url: String,
) -> Result<git::GitOperationResult, String> {
    git::add_remote(&std::path::PathBuf::from(&path), &name, &url)
}

#[tauri::command]
async fn git_remove_remote(path: String, name: String) -> Result<git::GitOperationResult, String> {
    git::remove_remote(&std::path::PathBuf::from(&path), &name)
}

#[tauri::command]
async fn git_log(path: String, max_count: Option<usize>) -> Result<Vec<git::GitLogEntry>, String> {
    git::log(&std::path::PathBuf::from(&path), max_count.unwrap_or(20))
}

#[tauri::command]
async fn git_find_repos(root: String) -> Result<Vec<git::RepoInfo>, String> {
    git::find_repos(&std::path::PathBuf::from(&root))
}

#[tauri::command]
async fn git_detect_provider(url: String) -> Result<git::GitProvider, String> {
    Ok(git::detect_provider(&url))
}

// ─── GitHub Commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn github_request_device_code() -> Result<github::DeviceCodeResponse, String> {
    github::request_device_code().await
}

#[tauri::command]
async fn github_poll_for_token(device_code: String, interval: u64) -> Result<String, String> {
    github::poll_for_token(&device_code, interval).await
}

#[tauri::command]
async fn github_check_auth() -> Result<github::GitHubAuthState, String> {
    Ok(github::check_auth().await)
}

#[tauri::command]
async fn github_logout() -> Result<(), String> {
    github::clear_token()
}

#[tauri::command]
async fn github_get_user() -> Result<github::GitHubUser, String> {
    github::get_current_user(None).await
}

#[tauri::command]
async fn github_list_repos() -> Result<Vec<github::GitHubRepo>, String> {
    github::list_repos(None).await
}

#[tauri::command]
async fn github_create_repo(
    name: String,
    description: Option<String>,
    private: Option<bool>,
) -> Result<github::GitHubRepo, String> {
    github::create_repo(
        None,
        &name,
        description.as_deref(),
        private.unwrap_or(false),
    )
    .await
}

#[tauri::command]
async fn github_download_archive(
    owner: String,
    repo: String,
    archive_format: Option<String>,
    branch: Option<String>,
) -> Result<Vec<u8>, String> {
    github::download_archive(
        None,
        &owner,
        &repo,
        &archive_format.unwrap_or_else(|| "zipball".to_string()),
        branch.as_deref(),
    )
    .await
}

#[tauri::command]
async fn github_import_repo(full_name: String, dest_path: String) -> Result<git::RepoInfo, String> {
    github::import_repo(None, &full_name, &std::path::PathBuf::from(&dest_path)).await
}

// ─── App Entry Point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Default: use the standard config-dir based path
    run_with_args(get_data_dir(), 5173, None);
}

pub fn run_with_args(data_dir: PathBuf, port: u16, name: Option<String>) {
    // Set global instance state (everything reads from these statics)
    set_data_dir(data_dir.clone());
    set_instance_port(port);
    set_instance_name(name);
    let instance_label = get_instance_name();

    // Initialize sandbox (per-instance)
    sandbox::init(&data_dir);

    // Initialize database at startup (per-instance, in data_dir/data/)
    if let Err(e) = database::init() {
        log::error!("Failed to initialize database: {}", e);
    }

    // Initialize P2P network (connects to DHT bootstrap nodes)
    tauri::async_runtime::block_on(p2p::init(&data_dir))
        .unwrap_or_else(|e| log::warn!("P2P init deferred: {}", e));

    // Load AI providers from disk on startup
    tauri::async_runtime::block_on(config::load_ai_providers());

    let tooltip = if instance_label.is_empty() {
        "dweb".to_string()
    } else {
        format!("dweb — {}", instance_label)
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Stack Manager
            get_services,
            start_service,
            stop_service,
            restart_service,
            detect_runtimes,
            detect_databases,
            // Sandbox
            sandbox::get_sandbox_status,
            // P2P
            publish_site,
            resolve_domain,
            get_p2p_status,
            // Domains
            register_domain,
            list_domains,
            renew_domain,
            transfer_domain,
            // AI
            get_ai_providers,
            update_ai_provider,
            ai::get_ai_models,
            ai::ai_generate,
            ai::ai_generate_stream,
            ai::ai_build,
            ai::test_ai_connection,
            set_active_ai,
            get_active_ai,
            // Cloud
            deploy_to_cloud,
            // Config
            config::get_config,
            config::save_config,
            // Database
            database::db_list_projects,
            database::db_get_project,
            database::db_save_project,
            database::db_delete_project,
            database::db_list_builds,
            database::db_list_domain_records,
            // Git
            git_init_repo,
            git_clone_repo,
            git_repo_status,
            git_stage_all,
            git_stage_files,
            git_unstage_all,
            git_commit,
            git_push,
            git_pull,
            git_branches,
            git_switch_branch,
            git_delete_branch,
            git_remotes,
            git_add_remote,
            git_remove_remote,
            git_log,
            git_find_repos,
            git_detect_provider,
            // GitHub
            github_request_device_code,
            github_poll_for_token,
            github_check_auth,
            github_logout,
            github_get_user,
            github_list_repos,
            github_create_repo,
            github_download_archive,
            github_import_repo,
        ])
        .setup({
            // Capture tooltip by value for the closure
            let tray_tooltip = tooltip.clone();
            move |app| {
                // Initialize sandboxed service container
                sandbox::init_service_container();

                #[cfg(desktop)]
                {
                    use tauri::tray::TrayIconBuilder;
                    let _tray = TrayIconBuilder::new().tooltip(&tray_tooltip).build(app)?;
                }
                Ok(())
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running dweb");
}
