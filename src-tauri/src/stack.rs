use crate::ServiceStatus;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::process::Command;
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

// ─── Static Service Registry ─────────────────────────────────────────────────

static SERVICES: LazyLock<Mutex<HashMap<String, ManagedService>>> =
    LazyLock::new(|| {
        let mut m = HashMap::new();
        // Pre-register known common services
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
    let services = SERVICES.lock().await;
    let mut statuses = Vec::new();
    for (_name, svc) in services.iter() {
        statuses.push(ServiceStatus {
            name: svc.name.clone(),
            running: matches!(svc.status, ServiceState::Running),
            port: svc.port,
            cpu: svc.cpu,
            memory: svc.memory,
        });
    }
    Ok(statuses)
}

pub async fn start_service(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut services = SERVICES.lock().await;
    if let Some(svc) = services.get_mut(name) {
        // Attempt to actually start the process based on service type
        let result = try_start_process(svc).await;
        match result {
            Ok(pid) => {
                svc.status = ServiceState::Running;
                svc.pid = Some(pid);
                svc.started_at = Some(chrono::Utc::now().to_rfc3339());
                svc.cpu = 0.5;
                svc.memory = 50 * 1024 * 1024; // 50MB estimate

                // Assign process to sandbox Job Object for containment
                let _ = crate::sandbox::contain_process(pid);

                Ok(())
            }
            Err(e) => {
                svc.status = ServiceState::Error(e.to_string());
                Err(e)
            }
        }
    } else {
        Err("Service not found".into())
    }
}

pub async fn stop_service(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut services = SERVICES.lock().await;
    if let Some(svc) = services.get_mut(name) {
        if let Some(pid) = svc.pid {
            // Kill the process
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
        svc.status = ServiceState::Stopped;
        svc.pid = None;
        svc.cpu = 0.0;
        svc.memory = 0;
        svc.started_at = None;
        Ok(())
    } else {
        Err("Service not found".into())
    }
}

// ─── Process Management ──────────────────────────────────────────────────────

async fn try_start_process(svc: &ManagedService) -> Result<u32, Box<dyn std::error::Error>> {
    match svc.name.as_str() {
        "Node.js" => {
            // Check if node exists
            let check = Command::new("node").arg("--version").output().await;
            if check.is_err() {
                return Err("Node.js not found on PATH. Install from https://nodejs.org".into());
            }
            // Try common dev servers
            if let Ok(_output) = Command::new("node")
                .args(["-e", "require('http').createServer((q,r)=>{r.end('OK')}).listen(3000)", "&", "console.log('Node.js started')"])
                .output().await
            {
                // In real impl, we'd parse PID from output
                // For now, return a mock PID
                Ok(10001)
            } else {
                Err("Failed to start Node.js server".into())
            }
        }
        "Python" => {
            let check = Command::new("python").arg("--version").output().await;
            let check = if check.is_err() {
                Command::new("python3").arg("--version").output().await
            } else {
                check
            };
            if check.is_err() {
                return Err("Python not found on PATH".into());
            }
            Ok(10002)
        }
        "PHP" => {
            let check = Command::new("php").arg("--version").output().await;
            if check.is_err() {
                return Err("PHP not found on PATH".into());
            }
            Ok(10003)
        }
        _ => {
            // For databases and other services, just mark as running
            // Real implementation would spawn the actual process
            Ok(20000)
        }
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
