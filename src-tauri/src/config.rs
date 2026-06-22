use crate::ai::ProviderConfig;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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
            if let Ok(config) = serde_json::from_str(&content) {
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
        let content = serde_json::to_string_pretty(self)?;
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
