use crate::ServiceStatus;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::LazyLock;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedService {
    pub name: String,
    pub service_type: ServiceType,
    pub port: u16,
    pub version: String,
    pub auto_start: bool,
    pub status: ServiceState,
    pub pid: Option<u32>,
    pub cpu: f64,
    pub memory: u64,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServiceType {
    Runtime,
    Database,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServiceState {
    Running,
    Stopped,
    Error(String),
}

struct SpawnedProcess {
    pid: u32,
    child: Child,
}

struct ManagedProcess {
    health_task: tokio::task::JoinHandle<()>,
}

// ─── Static State ────────────────────────────────────────────────────────────

static PROCESS_COUNT: AtomicUsize = AtomicUsize::new(0);

static PROCESSES: LazyLock<Mutex<HashMap<String, ManagedProcess>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

static SERVICES: LazyLock<Mutex<HashMap<String, ManagedService>>> =
    LazyLock::new(|| {
        let mut m = HashMap::new();
        let known: Vec<(&str, ServiceType, u16)> = vec![
            ("Node.js", ServiceType::Runtime, 3000),
            ("Python", ServiceType::Runtime, 8000),
            ("PHP", ServiceType::Runtime, 8080),
            ("Go", ServiceType::Runtime, 8080),
            ("Ruby", ServiceType::Runtime, 3000),
            ("MySQL", ServiceType::Database, 3306),
            ("PostgreSQL", ServiceType::Database, 5432),
            ("MongoDB", ServiceType::Database, 27017),
            ("Redis", ServiceType::Database, 6379),
        ];
        for (name, st, port) in known {
            m.insert(name.to_string(), ManagedService {
                name: name.to_string(),
                service_type: st,
                port,
                version: "detected".into(),
                auto_start: false,
                status: ServiceState::Stopped,
                pid: None,
                cpu: 0.0,
                memory: 0,
                started_at: None,
            });
        }
        Mutex::new(m)
    });

// ─── Public API ──────────────────────────────────────────────────────────────

pub async fn add_service(
    name: &str,
    service_type: ServiceType,
    port: u16,
    version: &str,
    auto_start: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut services = SERVICES.lock().await;
    services.insert(name.to_string(), ManagedService {
        name: name.to_string(),
        service_type,
        port,
        version: version.to_string(),
        auto_start,
        status: ServiceState::Stopped,
        pid: None,
        cpu: 0.0,
        memory: 0,
        started_at: None,
    });
    Ok(())
}

pub async fn list_services() -> Result<Vec<ServiceStatus>, Box<dyn std::error::Error>> {
    let mut services = SERVICES.lock().await;
    let mut statuses = Vec::new();
    let mut to_cleanup = Vec::new();

    for (name, svc) in services.iter() {
        if matches!(svc.status, ServiceState::Running) {
            if let Some(pid) = svc.pid {
                if !is_pid_alive(pid) {
                    to_cleanup.push(name.clone());
                    continue;
                }
            }
        }
        statuses.push(ServiceStatus {
            name: svc.name.clone(),
            running: matches!(svc.status, ServiceState::Running),
            port: svc.port,
            cpu: svc.cpu,
            memory: svc.memory,
        });
    }

    for name in &to_cleanup {
        if let Some(svc) = services.get_mut(name) {
            svc.status = ServiceState::Stopped;
            svc.pid = None;
            svc.cpu = 0.0;
            svc.memory = 0;
            svc.started_at = None;
            PROCESS_COUNT.fetch_sub(1, Ordering::SeqCst);
        }
    }

    drop(services);

    for name in &to_cleanup {
        let mut processes = PROCESSES.lock().await;
        if let Some(mp) = processes.remove(name) {
            mp.health_task.abort();
        }
    }

    Ok(statuses)
}

pub async fn start_service(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let svc_name = name.to_string();

    let spawned = {
        let mut services = SERVICES.lock().await;
        let svc = services.get_mut(name).ok_or("Service not found")?;

        match try_start_process(svc).await {
            Ok(sp) => {
                let now = chrono::Utc::now().to_rfc3339();
                svc.status = ServiceState::Running;
                svc.pid = Some(sp.pid);
                svc.started_at = Some(now);
                svc.cpu = 0.5;
                svc.memory = 50 * 1024 * 1024;
                PROCESS_COUNT.fetch_add(1, Ordering::SeqCst);

                let _ = crate::sandbox::contain_process(sp.pid);

                Ok((sp.pid, sp.child))
            }
            Err(e) => {
                svc.status = ServiceState::Error(e.to_string());
                Err(e)
            }
        }
    };

    let (pid, mut child) = spawned?;

    let service_name = svc_name.clone();
    let health_task = tokio::spawn(async move {
        let _ = child.wait().await;

        let mut services = SERVICES.lock().await;
        if let Some(svc) = services.get_mut(&service_name) {
            if matches!(svc.status, ServiceState::Running) {
                svc.status = ServiceState::Stopped;
                svc.pid = None;
                svc.cpu = 0.0;
                svc.memory = 0;
                svc.started_at = None;
                PROCESS_COUNT.fetch_sub(1, Ordering::SeqCst);
            }
        }
    });

    let mut processes = PROCESSES.lock().await;
    if let Some(old) = processes.remove(&svc_name) {
        old.health_task.abort();
    }
    processes.insert(svc_name, ManagedProcess { health_task });

    Ok(())
}

pub async fn stop_service(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut services = SERVICES.lock().await;
    let svc = services.get_mut(name).ok_or("Service not found")?;

    if let Some(pid) = svc.pid {
        if cfg!(target_os = "windows") {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output().await;
        } else {
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output().await;
        }
    }

    let was_running = matches!(svc.status, ServiceState::Running);
    svc.status = ServiceState::Stopped;
    svc.pid = None;
    svc.cpu = 0.0;
    svc.memory = 0;
    svc.started_at = None;
    if was_running {
        PROCESS_COUNT.fetch_sub(1, Ordering::SeqCst);
    }

    drop(services);

    let mut processes = PROCESSES.lock().await;
    if let Some(mp) = processes.remove(name) {
        mp.health_task.abort();
    }

    Ok(())
}

pub fn get_process_count() -> usize {
    PROCESS_COUNT.load(Ordering::SeqCst)
}

// ─── Process Management ──────────────────────────────────────────────────────

async fn try_start_process(svc: &ManagedService) -> Result<SpawnedProcess, Box<dyn std::error::Error>> {
    match svc.name.as_str() {
        "Node.js" => {
            let check = Command::new("node").arg("--version").output().await;
            if check.is_err() {
                return Err("Node.js not found on PATH. Install from https://nodejs.org".into());
            }
            let port = svc.port;
            let mut child = Command::new("node")
                .args([
                    "-e",
                    &format!(
                        "const http = require('http'); \
                         http.createServer((q, r) => {{ r.end('OK'); }}).listen({}, () => {{ \
                           console.log('Node.js started on port {}'); \
                         }});",
                        port, port
                    ),
                ])
                .spawn()
                .map_err(|e| format!("Failed to spawn Node.js: {}", e))?;
            let pid = child.id().ok_or("Node.js process exited before PID could be read")?;
            Ok(SpawnedProcess { pid, child })
        }
        "Python" => {
            let python_cmd = if Command::new("python3").arg("--version").output().await.is_ok() {
                "python3"
            } else if Command::new("python").arg("--version").output().await.is_ok() {
                "python"
            } else {
                return Err("Python not found on PATH".into());
            };
            let port = svc.port;
            let mut child = Command::new(python_cmd)
                .args(["-m", "http.server", &port.to_string()])
                .spawn()
                .map_err(|e| format!("Failed to spawn Python: {}", e))?;
            let pid = child.id().ok_or("Python process exited before PID could be read")?;
            Ok(SpawnedProcess { pid, child })
        }
        "PHP" => {
            let check = Command::new("php").arg("--version").output().await;
            if check.is_err() {
                return Err("PHP not found on PATH".into());
            }
            let port = svc.port;
            let mut child = Command::new("php")
                .args(["-S", &format!("0.0.0.0:{}", port)])
                .spawn()
                .map_err(|e| format!("Failed to spawn PHP: {}", e))?;
            let pid = child.id().ok_or("PHP process exited before PID could be read")?;
            Ok(SpawnedProcess { pid, child })
        }
        "Ruby" => {
            let check = Command::new("ruby").arg("--version").output().await;
            if check.is_err() {
                return Err("Ruby not found on PATH".into());
            }
            let port = svc.port;
            let mut child = Command::new("ruby")
                .args(["-run", "-e", "httpd", "--", "-p", &port.to_string()])
                .spawn()
                .map_err(|e| format!("Failed to spawn Ruby: {}", e))?;
            let pid = child.id().ok_or("Ruby process exited before PID could be read")?;
            Ok(SpawnedProcess { pid, child })
        }
        _ => {
            Err(format!("Cannot auto-start '{}': no spawn handler defined", svc.name).into())
        }
    }
}

fn is_pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout);
                out.contains(&pid.to_string())
            })
            .unwrap_or(false)
    }
}

// ─── Runtime Detection ───────────────────────────────────────────────────────

pub async fn detect_runtimes() -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut found = Vec::new();
    let checks = vec![
        ("node", "Node.js"),
        ("python3", "Python"),
        ("python", "Python"),
        ("php", "PHP"),
        ("go", "Go"),
        ("ruby", "Ruby"),
    ];

    for (cmd, name) in &checks {
        let output = Command::new(cmd).arg("--version").output().await;
        if let Ok(out) = output {
            if out.status.success() {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                found.push(format!("{}: {}", name, version));
            }
        }
    }
    Ok(found)
}

pub async fn detect_databases() -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut found = Vec::new();
    let checks = vec![
        ("mysql", "MySQL", 3306),
        ("psql", "PostgreSQL", 5432),
        ("mongod", "MongoDB", 27017),
        ("redis-server", "Redis", 6379),
    ];

    for (cmd, name, port) in &checks {
        let output = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/c", &format!("tasklist /FI \"IMAGENAME eq {}.exe\" 2>NUL", cmd)])
                .output().await
        } else {
            Command::new("sh")
                .args(["-c", &format!("pgrep -x {} 2>/dev/null", cmd)])
                .output().await
        };

        if let Ok(out) = output {
            if !out.stdout.is_empty() {
                found.push(format!("{} (port {})", name, port));
            }
        }
    }
    Ok(found)
}
