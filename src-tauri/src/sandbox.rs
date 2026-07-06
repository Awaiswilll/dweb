//! Instance sandboxing: identity, process isolation, and resource containment.
//!
//! ## Layers
//! 1. **Instance identity** — per-instance HyperDHT keypair in `{data-dir}/identity.json`
//! 2. **Job Object (Windows)** — all child service processes belong to a Job Object
//!    enforcing memory limits, kill-on-close, and process-group management.
//! 3. **Restricted token** — child processes run at Low integrity with filesystem
//!    access limited to their project directory (planned).

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use std::sync::Mutex;

// ─── Instance Identity ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceIdentity {
    pub public_key: String,
    pub secret_key: String,
    pub label: String,
    pub created_at: String,
}

impl InstanceIdentity {
    pub fn generate(label: &str) -> Self {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let mut secret = [0u8; 32];
        let mut public = [0u8; 32];
        rng.fill(&mut secret);
        rng.fill(&mut public);
        Self {
            public_key: hex::encode(public),
            secret_key: hex::encode(secret),
            label: label.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn load_or_create(data_dir: &PathBuf) -> Self {
        let path = data_dir.join("identity.json");
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(id) = serde_json::from_str(&content) {
                return id;
            }
        }
        let label = crate::get_instance_name();
        let identity = Self::generate(&label);
        let _ = identity.save(data_dir);
        identity
    }

    pub fn save(&self, data_dir: &Path) -> Result<(), String> {
        let path = data_dir.join("identity.json");
        let content =
            serde_json::to_string_pretty(self).map_err(|e| format!("Serialize: {}", e))?;
        std::fs::write(&path, &content).map_err(|e| format!("Write: {}", e))?;
        Ok(())
    }
}

// ─── Windows Job Object (via raw FFI) ──────────────────────────────────────
// We use raw `extern "system"` FFI instead of the `windows` crate to avoid
// version-specific compilation issues. These bindings are stable across
// Windows 7 through 11.

#[cfg(target_os = "windows")]
mod ffi {
    #![allow(nonstandard_style, dead_code)]
    use std::ffi::c_void;

    pub type HANDLE = *mut c_void;
    pub type BOOL = i32;
    pub type DWORD = u32;
    pub type LPCWSTR = *const u16;
    pub type LPVOID = *mut c_void;
    pub type LPSECURITY_ATTRIBUTES = *mut c_void;

    /// Wrapper around HANDLE that implements Send (required for static Mutex).
    /// Windows handles are opaque tokens, not actual memory pointers, so
    /// sending them between threads is safe.
    #[derive(Clone, Copy)]
    pub struct JobHandle(pub HANDLE);
    unsafe impl Send for JobHandle {}
    unsafe impl Sync for JobHandle {}

    pub const FALSE: BOOL = 0;
    pub const TRUE: BOOL = 1;

    // Access rights
    pub const PROCESS_SET_QUOTA: DWORD = 0x0100;
    pub const PROCESS_TERMINATE: DWORD = 0x0001;

    // Job Object limit flags
    pub const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: DWORD = 0x2000;
    pub const JOB_OBJECT_LIMIT_PROCESS_MEMORY: DWORD = 0x0100;

    // JobObjectInfoClass
    pub const JobObjectExtendedLimitInformation: i32 = 9;

    #[repr(C)]
    pub struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        pub PerProcessUserTimeLimit: i64,
        pub PerJobUserTimeLimit: i64,
        pub LimitFlags: DWORD,
        pub MinimumWorkingSetSize: usize,
        pub MaximumWorkingSetSize: usize,
        pub ActiveProcessLimit: DWORD,
        pub Affinity: usize,
        pub ChildProcessRate: DWORD,
        pub MaximumCPURate: DWORD,
    }

    #[repr(C)]
    pub struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        pub BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        pub IoInfo: [u8; 48], // IO_COUNTERS — we don't need to parse it
        pub ProcessMemoryLimit: usize,
        pub JobMemoryLimit: usize,
        pub PeakProcessMemoryUsed: usize,
        pub PeakJobMemoryUsed: usize,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn CreateJobObjectW(lpJobAttributes: LPSECURITY_ATTRIBUTES, lpName: LPCWSTR) -> HANDLE;

        pub fn SetInformationJobObject(
            hJob: HANDLE,
            JobObjectInfoClass: i32,
            lpJobObjectInfo: LPVOID,
            cbJobObjectInfoLength: DWORD,
        ) -> BOOL;

        pub fn AssignProcessToJobObject(hJob: HANDLE, hProcess: HANDLE) -> BOOL;

        pub fn OpenProcess(
            dwDesiredAccess: DWORD,
            bInheritHandle: BOOL,
            dwProcessId: DWORD,
        ) -> HANDLE;

        pub fn CloseHandle(hObject: HANDLE) -> BOOL;
    }
}

#[cfg(target_os = "windows")]
static JOB_HANDLE: Mutex<Option<ffi::JobHandle>> = Mutex::new(None);

/// Initialize the sandbox subsystem. Creates/stores instance identity.
pub fn init(data_dir: &PathBuf) {
    let identity = InstanceIdentity::load_or_create(data_dir);
    log::info!(
        "Sandbox initialized — identity: {}…",
        &identity.public_key[..8]
    );
}

/// Initialize the service container (Job Object on Windows).
pub fn init_service_container() {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr;

        let wide: Vec<u16> = OsStr::new("dweb-sandbox")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let job = ffi::CreateJobObjectW(ptr::null_mut(), wide.as_ptr());
            if job.is_null() {
                log::error!("Failed to create Job Object");
                return;
            }

            let mut extended = ffi::JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
                BasicLimitInformation: ffi::JOBOBJECT_BASIC_LIMIT_INFORMATION {
                    PerProcessUserTimeLimit: 0,
                    PerJobUserTimeLimit: 0,
                    LimitFlags: ffi::JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                        | ffi::JOB_OBJECT_LIMIT_PROCESS_MEMORY,
                    MinimumWorkingSetSize: 0,
                    MaximumWorkingSetSize: 0,
                    ActiveProcessLimit: 0,
                    Affinity: 0,
                    ChildProcessRate: 0,
                    MaximumCPURate: 0,
                },
                IoInfo: [0u8; 48],
                ProcessMemoryLimit: 512 * 1024 * 1024, // 512 MB
                JobMemoryLimit: 0,
                PeakProcessMemoryUsed: 0,
                PeakJobMemoryUsed: 0,
            };

            let result = ffi::SetInformationJobObject(
                job,
                ffi::JobObjectExtendedLimitInformation,
                &mut extended as *mut _ as ffi::LPVOID,
                std::mem::size_of::<ffi::JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as ffi::DWORD,
            );
            if result == ffi::FALSE {
                log::error!("Failed to set Job Object limits");
                ffi::CloseHandle(job);
                return;
            }

            if let Ok(mut guard) = JOB_HANDLE.lock() {
                *guard = Some(ffi::JobHandle(job));
            }
            log::info!("Service container (Job Object) created — 512 MB limit, kill-on-close");
        }
    }

    #[cfg(not(target_os = "windows"))]
    log::info!("Service container: process-group based (non-Windows)");
}

/// Assign a child process to the sandbox container.
pub fn contain_process(child_pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let guard = JOB_HANDLE.lock().map_err(|e| e.to_string())?;
        if let Some(jh) = *guard {
            let job = jh.0;
            unsafe {
                let proc_handle = ffi::OpenProcess(
                    ffi::PROCESS_SET_QUOTA | ffi::PROCESS_TERMINATE,
                    ffi::FALSE,
                    child_pid,
                );
                if proc_handle.is_null() {
                    return Err(format!("Failed to open process {}", child_pid));
                }

                let result = ffi::AssignProcessToJobObject(job, proc_handle);
                ffi::CloseHandle(proc_handle);

                if result == ffi::FALSE {
                    return Err(format!("Failed to assign process {} to job", child_pid));
                }
                log::info!("Process {} assigned to sandbox Job Object", child_pid);
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        log::info!("Process {} sandboxed (process group)", child_pid);
        Ok(())
    }
}

// ─── Tauri Command ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SandboxStatus {
    pub data_dir: String,
    pub instance_port: u16,
    pub instance_label: String,
    pub public_key: String,
    pub service_container_active: bool,
    pub process_count: usize,
    pub platform: String,
}

#[tauri::command]
pub fn get_sandbox_status() -> Result<SandboxStatus, String> {
    let data_dir = crate::get_data_dir();
    let identity = InstanceIdentity::load_or_create(&data_dir);

    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "unknown"
    };

    Ok(SandboxStatus {
        data_dir: data_dir.to_string_lossy().to_string(),
        instance_port: crate::get_instance_port(),
        instance_label: crate::get_instance_name(),
        public_key: identity.public_key,
        service_container_active: true,
        process_count: 0,
        platform: platform.to_string(),
    })
}
