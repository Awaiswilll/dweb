use serde::{Deserialize, Serialize};
use sled::Db;
use std::path::PathBuf;
use std::sync::Mutex;

// ─── Data Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub stack: String,
    pub provider: String,
    pub model: String,
    pub prompt: String,
    pub generated_code: String,
    pub status: ProjectStatus,
    pub created_at: String,
    pub updated_at: String,
    pub port: Option<u16>,
    pub domain: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProjectStatus {
    Created,
    Building,
    Built,
    Running,
    Stopped,
    Failed,
    Published,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildRecord {
    pub id: String,
    pub prompt: String,
    pub provider: String,
    pub model: String,
    pub result: String,
    pub success: bool,
    pub started_at: String,
    pub completed_at: String,
    pub project_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainRecord {
    pub name: String,
    pub owner_key: String,
    pub registered_at: String,
    pub expires_at: String,
    pub target_port: Option<u16>,
    pub project_id: Option<String>,
}

// ─── Database Singleton ──────────────────────────────────────────────────────

static DB: once_cell::sync::Lazy<Mutex<Option<Db>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

fn db_path() -> PathBuf {
    let data_dir = crate::get_data_dir();
    let db_dir = data_dir.join("data");
    std::fs::create_dir_all(&db_dir).ok();
    db_dir.join("dweb.db")
}

/// Initialize the database (called once at startup).
pub fn init() -> Result<(), String> {
    let path = db_path();
    let db = sled::open(&path).map_err(|e| format!("Failed to open database: {}", e))?;
    let mut guard = DB.lock().map_err(|e| format!("Lock error: {}", e))?;
    *guard = Some(db);
    log::info!("Database opened at {:?}", path);
    Ok(())
}

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Db) -> Result<T, String>,
{
    let guard = DB.lock().map_err(|e| format!("Lock error: {}", e))?;
    match guard.as_ref() {
        Some(db) => f(db),
        None => Err("Database not initialized. Call init() first.".to_string()),
    }
}

// ─── Project CRUD ────────────────────────────────────────────────────────────

/// Insert or update a project.
pub fn upsert_project(project: &Project) -> Result<(), String> {
    let key = format!("project:{}", project.id);
    let value = serde_json::to_vec(project).map_err(|e| e.to_string())?;
    with_db(|db| {
        db.insert(key.as_bytes(), value)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Get a project by ID.
pub fn get_project(id: &str) -> Result<Option<Project>, String> {
    let key = format!("project:{}", id);
    with_db(
        |db| match db.get(key.as_bytes()).map_err(|e| e.to_string())? {
            Some(bytes) => {
                let project: Project = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                Ok(Some(project))
            }
            None => Ok(None),
        },
    )
}

/// List all projects.
pub fn list_projects() -> Result<Vec<Project>, String> {
    let prefix = "project:";
    with_db(|db| {
        let mut projects = Vec::new();
        for result in db.scan_prefix(prefix) {
            let (_, value) = result.map_err(|e| e.to_string())?;
            let project: Project = serde_json::from_slice(&value).map_err(|e| e.to_string())?;
            projects.push(project);
        }
        projects.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(projects)
    })
}

/// Delete a project by ID.
pub fn delete_project(id: &str) -> Result<bool, String> {
    let key = format!("project:{}", id);
    with_db(|db| {
        let removed = db.remove(key.as_bytes()).map_err(|e| e.to_string())?;
        Ok(removed.is_some())
    })
}

// ─── Build History CRUD ──────────────────────────────────────────────────────

pub fn insert_build(record: &BuildRecord) -> Result<(), String> {
    let key = format!("build:{}", record.id);
    let value = serde_json::to_vec(record).map_err(|e| e.to_string())?;
    with_db(|db| {
        db.insert(key.as_bytes(), value)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn list_builds(limit: usize) -> Result<Vec<BuildRecord>, String> {
    let prefix = "build:";
    with_db(|db| {
        let mut builds = Vec::new();
        for result in db.scan_prefix(prefix) {
            let (_, value) = result.map_err(|e| e.to_string())?;
            let record: BuildRecord = serde_json::from_slice(&value).map_err(|e| e.to_string())?;
            builds.push(record);
        }
        builds.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        builds.truncate(limit);
        Ok(builds)
    })
}

// ─── Domain Record CRUD (persisted) ──────────────────────────────────────────

pub fn save_domain_record(record: &DomainRecord) -> Result<(), String> {
    let key = format!("domain:{}", record.name);
    let value = serde_json::to_vec(record).map_err(|e| e.to_string())?;
    with_db(|db| {
        db.insert(key.as_bytes(), value)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn get_domain_record(name: &str) -> Result<Option<DomainRecord>, String> {
    let key = format!("domain:{}", name);
    with_db(
        |db| match db.get(key.as_bytes()).map_err(|e| e.to_string())? {
            Some(bytes) => {
                let record: DomainRecord =
                    serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                Ok(Some(record))
            }
            None => Ok(None),
        },
    )
}

pub fn list_domain_records() -> Result<Vec<DomainRecord>, String> {
    let prefix = "domain:";
    with_db(|db| {
        let mut records = Vec::new();
        for result in db.scan_prefix(prefix) {
            let (_, value) = result.map_err(|e| e.to_string())?;
            let record: DomainRecord = serde_json::from_slice(&value).map_err(|e| e.to_string())?;
            records.push(record);
        }
        records.sort_by(|a, b| b.registered_at.cmp(&a.registered_at));
        Ok(records)
    })
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn db_list_projects() -> Result<Vec<Project>, String> {
    list_projects()
}

#[tauri::command]
pub fn db_get_project(id: String) -> Result<Option<Project>, String> {
    get_project(&id)
}

#[tauri::command]
pub fn db_save_project(project: Project) -> Result<(), String> {
    upsert_project(&project)
}

#[tauri::command]
pub fn db_delete_project(id: String) -> Result<bool, String> {
    delete_project(&id)
}

#[tauri::command]
pub fn db_list_builds(limit: Option<usize>) -> Result<Vec<BuildRecord>, String> {
    list_builds(limit.unwrap_or(50))
}

#[tauri::command]
pub fn db_list_domain_records() -> Result<Vec<DomainRecord>, String> {
    list_domain_records()
}
