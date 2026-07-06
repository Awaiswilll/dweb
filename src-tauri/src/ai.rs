use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use tauri::Emitter;
use tokio::sync::Mutex;

// ─── Data Types ──────────────────────────────────────────────────────────────

/// Configuration for a single AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider_type: String, // "ollama" | "openai" | "anthropic" | "google" | "together" | "groq" | "openrouter"
    pub enabled: bool,
    pub label: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

/// Info about an available model (returned to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: String,
}

/// Result of a non-streaming generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationResult {
    pub content: String,
    pub model: String,
    pub provider: String,
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
}

/// Token emitted during streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamToken {
    pub token: String,
    pub done: bool,
}

// ─── Default Provider Configs ───────────────────────────────────────────────

pub fn default_providers() -> Vec<ProviderConfig> {
    vec![
        ProviderConfig {
            provider_type: "ollama".into(),
            enabled: true,
            label: "Ollama (Local)".into(),
            api_key: None,
            base_url: Some("http://localhost:11434".into()),
            default_model: Some("qwen2.5-coder:7b".into()),
            temperature: Some(0.2),
            max_tokens: Some(8192),
        },
        ProviderConfig {
            provider_type: "openai".into(),
            enabled: false,
            label: "OpenAI".into(),
            api_key: None,
            base_url: Some("https://api.openai.com/v1".into()),
            default_model: Some("gpt-4o".into()),
            temperature: Some(0.3),
            max_tokens: Some(16384),
        },
        ProviderConfig {
            provider_type: "anthropic".into(),
            enabled: false,
            label: "Anthropic Claude".into(),
            api_key: None,
            base_url: Some("https://api.anthropic.com/v1".into()),
            default_model: Some("claude-sonnet-4-20250514".into()),
            temperature: Some(0.3),
            max_tokens: Some(8192),
        },
        ProviderConfig {
            provider_type: "google".into(),
            enabled: false,
            label: "Google Gemini".into(),
            api_key: None,
            base_url: Some("https://generativelanguage.googleapis.com/v1beta".into()),
            default_model: Some("gemini-2.0-flash".into()),
            temperature: Some(0.3),
            max_tokens: Some(8192),
        },
        ProviderConfig {
            provider_type: "together".into(),
            enabled: false,
            label: "Together AI".into(),
            api_key: None,
            base_url: Some("https://api.together.xyz/v1".into()),
            default_model: Some("Qwen/Qwen2.5-Coder-32B-Instruct".into()),
            temperature: Some(0.3),
            max_tokens: Some(8192),
        },
        ProviderConfig {
            provider_type: "groq".into(),
            enabled: false,
            label: "Groq".into(),
            api_key: None,
            base_url: Some("https://api.groq.com/openai/v1".into()),
            default_model: Some("llama-3.3-70b-versatile".into()),
            temperature: Some(0.3),
            max_tokens: Some(32768),
        },
        ProviderConfig {
            provider_type: "openrouter".into(),
            enabled: false,
            label: "OpenRouter".into(),
            api_key: None,
            base_url: Some("https://openrouter.ai/api/v1".into()),
            default_model: Some("openai/gpt-4o".into()),
            temperature: Some(0.3),
            max_tokens: Some(16384),
        },
    ]
}

/// Hardcoded fallback model lists (used when API doesn't list models)
pub fn default_models_for_provider(provider: &str) -> Vec<ModelInfo> {
    match provider {
        "ollama" => vec![
            ModelInfo {
                id: "qwen2.5-coder:7b".into(),
                name: "Qwen 2.5 Coder 7B".into(),
                provider: "ollama".into(),
                description: "🔋 Balanced — best local code model".into(),
            },
            ModelInfo {
                id: "qwen2.5-coder:1.5b".into(),
                name: "Qwen 2.5 Coder 1.5B".into(),
                provider: "ollama".into(),
                description: "⚡ Fast — lightweight code model".into(),
            },
            ModelInfo {
                id: "codellama:7b".into(),
                name: "Code Llama 7B".into(),
                provider: "ollama".into(),
                description: "🔋 Balanced — Meta's code model".into(),
            },
            ModelInfo {
                id: "deepseek-coder:6.7b".into(),
                name: "DeepSeek Coder 6.7B".into(),
                provider: "ollama".into(),
                description: "🔋 Balanced — strong code".into(),
            },
            ModelInfo {
                id: "mistral:7b".into(),
                name: "Mistral 7B".into(),
                provider: "ollama".into(),
                description: "🔋 Balanced — general purpose".into(),
            },
            ModelInfo {
                id: "phi3:mini".into(),
                name: "Phi-3 Mini 3.8B".into(),
                provider: "ollama".into(),
                description: "⚡ Fast — small but capable".into(),
            },
            ModelInfo {
                id: "llama3.2:3b".into(),
                name: "Llama 3.2 3B".into(),
                provider: "ollama".into(),
                description: "⚡ Fast — latest Meta small model".into(),
            },
        ],
        "openai" => vec![
            ModelInfo {
                id: "gpt-4o".into(),
                name: "GPT-4o".into(),
                provider: "openai".into(),
                description: "🚀 Powerful — flagship model".into(),
            },
            ModelInfo {
                id: "gpt-4o-mini".into(),
                name: "GPT-4o Mini".into(),
                provider: "openai".into(),
                description: "⚡ Fast — cheaper, capable".into(),
            },
            ModelInfo {
                id: "gpt-4-turbo".into(),
                name: "GPT-4 Turbo".into(),
                provider: "openai".into(),
                description: "🚀 Powerful — previous gen".into(),
            },
            ModelInfo {
                id: "gpt-3.5-turbo".into(),
                name: "GPT-3.5 Turbo".into(),
                provider: "openai".into(),
                description: "⚡ Fast — economical".into(),
            },
            ModelInfo {
                id: "o3-mini".into(),
                name: "o3-mini".into(),
                provider: "openai".into(),
                description: "⚡ Fast — reasoning, low cost".into(),
            },
        ],
        "anthropic" => vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".into(),
                name: "Claude Sonnet 4".into(),
                provider: "anthropic".into(),
                description: "🚀 Powerful — latest balanced".into(),
            },
            ModelInfo {
                id: "claude-3-5-sonnet-latest".into(),
                name: "Claude 3.5 Sonnet".into(),
                provider: "anthropic".into(),
                description: "🚀 Powerful — previous gen".into(),
            },
            ModelInfo {
                id: "claude-3-opus-latest".into(),
                name: "Claude 3 Opus".into(),
                provider: "anthropic".into(),
                description: "🚀 Powerful — most capable".into(),
            },
            ModelInfo {
                id: "claude-3-haiku-latest".into(),
                name: "Claude 3 Haiku".into(),
                provider: "anthropic".into(),
                description: "⚡ Fast — fastest Claude".into(),
            },
        ],
        "google" => vec![
            ModelInfo {
                id: "gemini-2.0-flash".into(),
                name: "Gemini 2.0 Flash".into(),
                provider: "google".into(),
                description: "⚡ Fast — efficient".into(),
            },
            ModelInfo {
                id: "gemini-1.5-pro".into(),
                name: "Gemini 1.5 Pro".into(),
                provider: "google".into(),
                description: "🚀 Powerful — most capable".into(),
            },
            ModelInfo {
                id: "gemini-1.5-flash".into(),
                name: "Gemini 1.5 Flash".into(),
                provider: "google".into(),
                description: "⚡ Fast — cost-effective".into(),
            },
        ],
        "together" => vec![
            ModelInfo {
                id: "Qwen/Qwen2.5-Coder-32B-Instruct".into(),
                name: "Qwen 2.5 Coder 32B".into(),
                provider: "together".into(),
                description: "🚀 Powerful — top-tier code".into(),
            },
            ModelInfo {
                id: "meta-llama/Llama-3.3-70B-Instruct-Turbo".into(),
                name: "Llama 3.3 70B".into(),
                provider: "together".into(),
                description: "🚀 Powerful — Meta large".into(),
            },
            ModelInfo {
                id: "mistralai/Mixtral-8x22B-Instruct-v0.1".into(),
                name: "Mixtral 8x22B".into(),
                provider: "together".into(),
                description: "🚀 Powerful — Mistral MoE".into(),
            },
            ModelInfo {
                id: "codellama/CodeLlama-34b-Instruct-hf".into(),
                name: "Code Llama 34B".into(),
                provider: "together".into(),
                description: "🚀 Powerful — code spec".into(),
            },
        ],
        "groq" => vec![
            ModelInfo {
                id: "llama-3.3-70b-versatile".into(),
                name: "Llama 3.3 70B".into(),
                provider: "groq".into(),
                description: "🚀 Powerful — fast on Groq".into(),
            },
            ModelInfo {
                id: "llama-3.1-8b-instant".into(),
                name: "Llama 3.1 8B".into(),
                provider: "groq".into(),
                description: "⚡ Fast — lightning fast".into(),
            },
            ModelInfo {
                id: "mixtral-8x7b-32768".into(),
                name: "Mixtral 8x7B".into(),
                provider: "groq".into(),
                description: "🚀 Powerful — large ctx".into(),
            },
            ModelInfo {
                id: "gemma2-9b-it".into(),
                name: "Gemma 2 9B".into(),
                provider: "groq".into(),
                description: "🔋 Balanced — Google efficient".into(),
            },
        ],
        "openrouter" => vec![
            ModelInfo {
                id: "openai/gpt-4o".into(),
                name: "OpenAI GPT-4o".into(),
                provider: "openrouter".into(),
                description: "🚀 Powerful — via OpenRouter".into(),
            },
            ModelInfo {
                id: "anthropic/claude-3.5-sonnet".into(),
                name: "Claude 3.5 Sonnet".into(),
                provider: "openrouter".into(),
                description: "🚀 Powerful — via OpenRouter".into(),
            },
            ModelInfo {
                id: "google/gemini-2.0-flash-001".into(),
                name: "Gemini 2.0 Flash".into(),
                provider: "openrouter".into(),
                description: "⚡ Fast — via OpenRouter".into(),
            },
            ModelInfo {
                id: "meta-llama/llama-3.3-70b-instruct".into(),
                name: "Llama 3.3 70B".into(),
                provider: "openrouter".into(),
                description: "🚀 Powerful — via OpenRouter".into(),
            },
            ModelInfo {
                id: "qwen/qwen-2.5-coder-32b-instruct".into(),
                name: "Qwen 2.5 Coder 32B".into(),
                provider: "openrouter".into(),
                description: "🚀 Powerful — via OpenRouter".into(),
            },
        ],
        _ => vec![],
    }
}

// ─── In-Memory Provider Store ───────────────────────────────────────────────

static PROVIDERS: LazyLock<Mutex<Vec<ProviderConfig>>> =
    LazyLock::new(|| Mutex::new(default_providers()));

/// Shared HTTP client with 120s timeout — avoids creating a new client per request
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .expect("Failed to build shared HTTP client")
});

/// Get currently configured providers
pub async fn get_providers() -> Vec<ProviderConfig> {
    PROVIDERS.lock().await.clone()
}

/// Update a provider's config
pub async fn update_provider(config: ProviderConfig) {
    let mut providers = PROVIDERS.lock().await;
    if let Some(existing) = providers
        .iter_mut()
        .find(|p| p.provider_type == config.provider_type)
    {
        *existing = config;
    } else {
        providers.push(config);
    }
}

/// Get a specific provider's config
pub async fn get_provider(provider_type: &str) -> Option<ProviderConfig> {
    let providers = PROVIDERS.lock().await;
    providers
        .iter()
        .find(|p| p.provider_type == provider_type)
        .cloned()
}

// ─── Tauri Command Handlers (free functions) ────────────────────────────────

/// List models for a given provider (tries API first, falls back to hardcoded list)
#[tauri::command]
pub async fn get_ai_models(provider_type: String) -> Result<Vec<ModelInfo>, String> {
    // Try fetching from the API first
    let result = fetch_models_from_api(&provider_type).await;
    match result {
        Ok(models) if !models.is_empty() => Ok(models),
        _ => Ok(default_models_for_provider(&provider_type)),
    }
}

/// Non-streaming AI generation
#[tauri::command]
pub async fn ai_generate(
    prompt: String,
    provider_type: String,
    model: String,
    response_format: Option<String>,
) -> Result<GenerationResult, String> {
    let config = {
        let providers = PROVIDERS.lock().await;
        providers
            .iter()
            .find(|p| p.provider_type == provider_type)
            .ok_or_else(|| format!("Provider '{}' not configured", provider_type))?
            .clone()
    };

    if !config.enabled {
        return Err(format!(
            "Provider '{}' is disabled. Enable it in Settings.",
            config.label
        ));
    }

    let model = if model.is_empty() {
        config
            .default_model
            .clone()
            .unwrap_or_else(|| "unknown".into())
    } else {
        model
    };

    let fmt = response_format.as_deref();

    match provider_type.as_str() {
        "ollama" => ollama_generate(&config, &model, &prompt, false, fmt).await,
        "openai" => openai_chat_generate(&config, &model, &prompt, fmt).await,
        "anthropic" => anthropic_generate(&config, &model, &prompt).await,
        "google" => google_generate(&config, &model, &prompt).await,
        "together" => openai_chat_generate(&config, &model, &prompt, fmt).await,
        "groq" => openai_chat_generate(&config, &model, &prompt, fmt).await,
        "openrouter" => openai_chat_generate(&config, &model, &prompt, fmt).await,
        _ => Err(format!("Unknown provider type: {}", provider_type)),
    }
}

/// Start streaming generation — emits events on the Tauri event bus.
/// Events: "ai:token" (StreamToken), "ai:done" (null), "ai:error" (error string)
#[tauri::command]
pub async fn ai_generate_stream(
    app: tauri::AppHandle,
    prompt: String,
    provider_type: String,
    model: String,
    response_format: Option<String>,
) -> Result<(), String> {
    let config = {
        let providers = PROVIDERS.lock().await;
        providers
            .iter()
            .find(|p| p.provider_type == provider_type)
            .ok_or_else(|| format!("Provider '{}' not configured", provider_type))?
            .clone()
    };

    if !config.enabled {
        return Err(format!("Provider '{}' is disabled.", config.label));
    }

    let model = if model.is_empty() {
        config
            .default_model
            .clone()
            .unwrap_or_else(|| "unknown".into())
    } else {
        model
    };

    let fmt = response_format.unwrap_or_default();

    let app_clone = app.clone();

    tokio::spawn(async move {
        let result = match provider_type.as_str() {
            "ollama" => ollama_generate_stream(&app_clone, &config, &model, &prompt, &fmt).await,
            "openai" => openai_chat_stream(&app_clone, &config, &model, &prompt, &fmt).await,
            "anthropic" => anthropic_stream(&app_clone, &config, &model, &prompt).await,
            "google" => google_stream(&app_clone, &config, &model, &prompt).await,
            "together" => openai_chat_stream(&app_clone, &config, &model, &prompt, &fmt).await,
            "groq" => openai_chat_stream(&app_clone, &config, &model, &prompt, &fmt).await,
            "openrouter" => openai_chat_stream(&app_clone, &config, &model, &prompt, &fmt).await,
            _ => {
                let _ = app_clone.emit("ai:error", format!("Unknown provider: {}", provider_type));
                return;
            }
        };

        if let Err(e) = result {
            let _ = app_clone.emit("ai:error", e);
        }
    });

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider Implementations
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Ollama ──────────────────────────────────────────────────────────────────

async fn ollama_generate(
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
    _stream: bool,
    response_format: Option<&str>,
) -> Result<GenerationResult, String> {
    let base_url = cfg.base_url.as_deref().unwrap_or("http://localhost:11434");

    let mut body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": cfg.temperature.unwrap_or(0.2),
        }
    });

    // Ollama supports "format": "json" for structured JSON output
    if response_format == Some("json") {
        body["format"] = serde_json::json!("json");
    }

    let resp = HTTP_CLIENT
        .post(format!("{}/api/generate", base_url.trim_end_matches('/')))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama connection failed: {}. Is Ollama running?", e))?;

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ollama parse error: {}", e))?;

    let content = result["response"].as_str().unwrap_or("").to_string();

    Ok(GenerationResult {
        content,
        model: model.to_string(),
        provider: "ollama".into(),
        tokens_in: result["prompt_eval_count"].as_u64().map(|v| v as u32),
        tokens_out: result["eval_count"].as_u64().map(|v| v as u32),
    })
}

async fn ollama_generate_stream(
    app: &tauri::AppHandle,
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
    response_format: &str,
) -> Result<(), String> {
    let base_url = cfg.base_url.as_deref().unwrap_or("http://localhost:11434");

    let mut body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": true,
        "options": {
            "temperature": cfg.temperature.unwrap_or(0.2),
        }
    });

    if response_format == "json" {
        body["format"] = serde_json::json!("json");
    }

    let resp = HTTP_CLIENT
        .post(format!("{}/api/generate", base_url.trim_end_matches('/')))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama connection failed: {}", e))?;

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || !line.starts_with("data: ") {
                // Check for json lines without "data: " prefix (Ollama sends raw JSON)
                if line.starts_with('{') {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                        if let Some(resp) = val["response"].as_str() {
                            let done = val["done"].as_bool().unwrap_or(false);
                            let _ = app.emit(
                                "ai:token",
                                StreamToken {
                                    token: resp.to_string(),
                                    done,
                                },
                            );
                            if done {
                                return Ok(());
                            }
                        }
                    }
                }
                continue;
            }

            let data = line["data: ".len()..].to_string();
            if data == "[DONE]" {
                let _ = app.emit(
                    "ai:token",
                    StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                return Ok(());
            }

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(resp) = val["response"].as_str() {
                    let done = val["done"].as_bool().unwrap_or(false);
                    let _ = app.emit(
                        "ai:token",
                        StreamToken {
                            token: resp.to_string(),
                            done,
                        },
                    );
                    if done {
                        return Ok(());
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "ai:token",
        StreamToken {
            token: String::new(),
            done: true,
        },
    );
    Ok(())
}

async fn ollama_fetch_models(cfg: &ProviderConfig) -> Result<Vec<ModelInfo>, String> {
    let base_url = cfg.base_url.as_deref().unwrap_or("http://localhost:11434");
    let resp = HTTP_CLIENT
        .get(format!("{}/api/tags", base_url.trim_end_matches('/')))
        .send()
        .await
        .map_err(|e| format!("Ollama API error: {}", e))?;

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    let mut models = Vec::new();
    if let Some(arr) = result["models"].as_array() {
        for m in arr {
            if let Some(name) = m["name"].as_str() {
                models.push(ModelInfo {
                    id: name.to_string(),
                    name: name.to_string(),
                    provider: "ollama".into(),
                    description: format!(
                        "{}B params",
                        m["details"]["parameter_size"].as_str().unwrap_or("?")
                    ),
                });
            }
        }
    }
    Ok(models)
}

// ─── OpenAI / OpenAI-Compatible (Together, Groq, OpenRouter) ────────────────

async fn openai_chat_generate(
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
    response_format: Option<&str>,
) -> Result<GenerationResult, String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let api_key = cfg
        .api_key
        .as_deref()
        .ok_or("API key not set for this provider")?;

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": cfg.temperature.unwrap_or(0.3),
        "max_tokens": cfg.max_tokens.unwrap_or(4096),
    });

    if response_format == Some("json") {
        body["response_format"] = serde_json::json!({"type": "json_object"});
    }

    let resp = HTTP_CLIENT
        .post(format!(
            "{}/chat/completions",
            base_url.trim_end_matches('/')
        ))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    let status = resp.status();
    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    if !status.is_success() {
        let err_msg = result["error"]["message"]
            .as_str()
            .unwrap_or("Unknown API error");
        return Err(format!("API error ({}): {}", status, err_msg));
    }

    let content = result["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let tokens_in = result["usage"]["prompt_tokens"].as_u64().map(|v| v as u32);
    let tokens_out = result["usage"]["completion_tokens"]
        .as_u64()
        .map(|v| v as u32);

    Ok(GenerationResult {
        content,
        model: model.to_string(),
        provider: cfg.provider_type.clone(),
        tokens_in,
        tokens_out,
    })
}

async fn openai_chat_stream(
    app: &tauri::AppHandle,
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
    response_format: &str,
) -> Result<(), String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let api_key = cfg.api_key.as_deref().ok_or("API key not set")?;

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": cfg.temperature.unwrap_or(0.3),
        "max_tokens": cfg.max_tokens.unwrap_or(4096),
        "stream": true,
    });

    if response_format == "json" {
        body["response_format"] = serde_json::json!({"type": "json_object"});
    }

    let resp = HTTP_CLIENT
        .post(format!(
            "{}/chat/completions",
            base_url.trim_end_matches('/')
        ))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Stream request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, err_text));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }

            let data = line["data: ".len()..].to_string();
            if data == "[DONE]" {
                let _ = app.emit(
                    "ai:token",
                    StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                return Ok(());
            }

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(choice) = val["choices"].get(0) {
                    if let Some(delta) = choice["delta"]["content"].as_str() {
                        let _ = app.emit(
                            "ai:token",
                            StreamToken {
                                token: delta.to_string(),
                                done: false,
                            },
                        );
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "ai:token",
        StreamToken {
            token: String::new(),
            done: true,
        },
    );
    Ok(())
}

async fn openai_fetch_models(cfg: &ProviderConfig) -> Result<Vec<ModelInfo>, String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let api_key = cfg.api_key.as_deref().ok_or("No API key")?;

    let resp = HTTP_CLIENT
        .get(format!("{}/models", base_url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("API error: {}", e))?;

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    let mut models = Vec::new();
    if let Some(arr) = result["data"].as_array() {
        for m in arr.iter().take(50) {
            if let Some(id) = m["id"].as_str() {
                // Filter to chat models only (exclude embeddings, etc.)
                if id.contains("gpt")
                    || id.contains("o1")
                    || id.contains("o3")
                    || id.contains("claude")
                    || id.contains("llama")
                    || id.contains("mixtral")
                    || id.contains("gemma")
                    || id.contains("qwen")
                    || id.contains("mistral")
                {
                    models.push(ModelInfo {
                        id: id.to_string(),
                        name: id.to_string(),
                        provider: cfg.provider_type.clone(),
                        description: String::new(),
                    });
                }
            }
        }
    }
    Ok(models)
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async fn anthropic_generate(
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
) -> Result<GenerationResult, String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://api.anthropic.com/v1");
    let api_key = cfg
        .api_key
        .as_deref()
        .ok_or("API key not set for Anthropic")?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": cfg.max_tokens.unwrap_or(4096),
        "messages": [{"role": "user", "content": prompt}],
    });

    let resp = HTTP_CLIENT
        .post(format!("{}/messages", base_url.trim_end_matches('/')))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {}", e))?;

    let status = resp.status();
    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    if !status.is_success() {
        let err_msg = result["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("Anthropic error ({}): {}", status, err_msg));
    }

    let content = result["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(GenerationResult {
        content,
        model: model.to_string(),
        provider: "anthropic".into(),
        tokens_in: result["usage"]["input_tokens"].as_u64().map(|v| v as u32),
        tokens_out: result["usage"]["output_tokens"].as_u64().map(|v| v as u32),
    })
}

async fn anthropic_stream(
    app: &tauri::AppHandle,
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
) -> Result<(), String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://api.anthropic.com/v1");
    let api_key = cfg.api_key.as_deref().ok_or("API key not set")?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": cfg.max_tokens.unwrap_or(4096),
        "messages": [{"role": "user", "content": prompt}],
        "stream": true,
    });

    let resp = HTTP_CLIENT
        .post(format!("{}/messages", base_url.trim_end_matches('/')))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Stream request failed: {}", e))?;

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }

            let data = line["data: ".len()..].to_string();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                match val["type"].as_str() {
                    Some("content_block_delta") => {
                        if let Some(text) = val["delta"]["text"].as_str() {
                            let _ = app.emit(
                                "ai:token",
                                StreamToken {
                                    token: text.to_string(),
                                    done: false,
                                },
                            );
                        }
                    }
                    Some("message_stop") | Some("message_delta") => {
                        let _ = app.emit(
                            "ai:token",
                            StreamToken {
                                token: String::new(),
                                done: true,
                            },
                        );
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }

    let _ = app.emit(
        "ai:token",
        StreamToken {
            token: String::new(),
            done: true,
        },
    );
    Ok(())
}

// ─── Google Gemini ───────────────────────────────────────────────────────────

async fn google_generate(
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
) -> Result<GenerationResult, String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://generativelanguage.googleapis.com/v1beta");
    let api_key = cfg
        .api_key
        .as_deref()
        .ok_or("API key not set for Google Gemini")?;

    let body = serde_json::json!({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": cfg.temperature.unwrap_or(0.3),
            "maxOutputTokens": cfg.max_tokens.unwrap_or(4096),
        }
    });

    let url = format!(
        "{}/models/{}:generateContent?key={}",
        base_url.trim_end_matches('/'),
        model,
        api_key
    );

    let resp = HTTP_CLIENT
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Google API request failed: {}", e))?;

    let status = resp.status();
    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    if !status.is_success() {
        let err_msg = result["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("Google API error ({}): {}", status, err_msg));
    }

    let content = result["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(GenerationResult {
        content,
        model: model.to_string(),
        provider: "google".into(),
        tokens_in: None,
        tokens_out: None,
    })
}

async fn google_stream(
    app: &tauri::AppHandle,
    cfg: &ProviderConfig,
    model: &str,
    prompt: &str,
) -> Result<(), String> {
    let base_url = cfg
        .base_url
        .as_deref()
        .unwrap_or("https://generativelanguage.googleapis.com/v1beta");
    let api_key = cfg.api_key.as_deref().ok_or("API key not set")?;

    let body = serde_json::json!({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": cfg.temperature.unwrap_or(0.3),
            "maxOutputTokens": cfg.max_tokens.unwrap_or(4096),
        }
    });

    let url = format!(
        "{}/models/{}:streamGenerateContent?key={}&alt=sse",
        base_url.trim_end_matches('/'),
        model,
        api_key
    );

    let resp = HTTP_CLIENT
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Stream request failed: {}", e))?;

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }

            let data = line["data: ".len()..].to_string();
            if data == "[DONE]" {
                let _ = app.emit(
                    "ai:token",
                    StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                return Ok(());
            }

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(candidate) = val["candidates"].get(0) {
                    if let Some(part) = candidate["content"]["parts"].get(0) {
                        if let Some(text) = part["text"].as_str() {
                            let _ = app.emit(
                                "ai:token",
                                StreamToken {
                                    token: text.to_string(),
                                    done: false,
                                },
                            );
                        }
                    }
                    // Check finish reason for done signal
                    if let Some(finish) = candidate["finishReason"].as_str() {
                        if !finish.is_empty() && finish != "STOP_UNSPECIFIED" {
                            let _ = app.emit(
                                "ai:token",
                                StreamToken {
                                    token: String::new(),
                                    done: true,
                                },
                            );
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "ai:token",
        StreamToken {
            token: String::new(),
            done: true,
        },
    );
    Ok(())
}

// ─── Fetch Models From API ──────────────────────────────────────────────────

async fn fetch_models_from_api(provider_type: &str) -> Result<Vec<ModelInfo>, String> {
    let providers = PROVIDERS.lock().await;
    let cfg = providers
        .iter()
        .find(|p| p.provider_type == provider_type)
        .ok_or("Provider not found")?;

    if !cfg.enabled {
        return Err("Provider disabled".into());
    }

    match provider_type {
        "ollama" => ollama_fetch_models(cfg).await,
        "openai" | "together" | "groq" | "openrouter" => openai_fetch_models(cfg).await,
        _ => Err("Model listing not supported for this provider via API".into()),
    }
}

// ─── Build Pipeline ─────────────────────────────────────────────────────────

/// Full AI build pipeline: recommend stack → scaffold → generate code → return result
#[tauri::command]
pub async fn ai_build(
    prompt: String,
    provider_type: String,
    model: String,
) -> Result<String, String> {
    let config = {
        let providers = PROVIDERS.lock().await;
        providers
            .iter()
            .find(|p| p.provider_type == provider_type)
            .ok_or_else(|| format!("Provider '{}' not configured", provider_type))?
            .clone()
    };

    if !config.enabled {
        return Err(format!("Provider '{}' is disabled.", config.label));
    }

    let model = if model.is_empty() {
        config
            .default_model
            .clone()
            .unwrap_or_else(|| "unknown".into())
    } else {
        model
    };

    // Step 1: Stack recommendation
    let stack_prompt = format!(
        "Based on this request, recommend a SINGLE tech stack name from this list: \
         Node.js+React, Python+FastAPI, PHP+MySQL, Go+Redis, Ruby+Rails, Static. \
         Only respond with the stack name, nothing else.\n\nRequest: {}",
        prompt
    );

    let stack_result = match provider_type.as_str() {
        "ollama" => ollama_generate(&config, &model, &stack_prompt, false, None).await,
        "openai" | "together" | "groq" | "openrouter" => {
            openai_chat_generate(&config, &model, &stack_prompt, None).await
        }
        "anthropic" => anthropic_generate(&config, &model, &stack_prompt).await,
        "google" => google_generate(&config, &model, &stack_prompt).await,
        _ => return Err("Unknown provider".into()),
    }?;
    let stack = stack_result.content.trim().to_string();

    // Step 2: Generate scaffold + code in one call
    let code_prompt = format!(
        "Create a complete {} project for: {}\n\n\
         Provide:\n\
         1. Project structure (files and directories)\n\
         2. All source code files with full implementation\n\
         3. Configuration files (package.json, requirements.txt, etc.)\n\
         4. README with setup instructions\n\n\
         Make it production-ready with proper error handling.\
         Format the response as markdown with code blocks.",
        stack, prompt
    );

    let code_result = match provider_type.as_str() {
        "ollama" => ollama_generate(&config, &model, &code_prompt, false, None).await,
        "openai" | "together" | "groq" | "openrouter" => {
            openai_chat_generate(&config, &model, &code_prompt, None).await
        }
        "anthropic" => anthropic_generate(&config, &model, &code_prompt).await,
        "google" => google_generate(&config, &model, &code_prompt).await,
        _ => return Err("Unknown provider".into()),
    }?;

    Ok(serde_json::to_string(&serde_json::json!({
        "status": "success",
        "stack": stack,
        "code": code_result.content,
        "provider": provider_type,
        "model": model,
        "tokens_in": code_result.tokens_in,
        "tokens_out": code_result.tokens_out,
    }))
    .unwrap_or_else(|_| "{}".into()))
}

// ─── Test Connection ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_ai_connection(provider_type: String) -> Result<String, String> {
    let providers = PROVIDERS.lock().await;
    let config = providers
        .iter()
        .find(|p| p.provider_type == provider_type)
        .ok_or_else(|| format!("Provider '{}' not configured", provider_type))?
        .clone();
    drop(providers);

    match provider_type.as_str() {
        "ollama" => {
            let base_url = config
                .base_url
                .as_deref()
                .unwrap_or("http://localhost:11434");
            let resp = HTTP_CLIENT
                .get(format!("{}/api/tags", base_url.trim_end_matches('/')))
                .send()
                .await
                .map_err(|e| format!("Cannot reach Ollama: {}. Make sure Ollama is running.", e))?;
            if resp.status().is_success() {
                Ok("✅ Connected to Ollama".into())
            } else {
                Err(format!("Ollama returned status {}", resp.status()))
            }
        }
        "openai" | "together" | "groq" | "openrouter" => {
            let base_url = config.base_url.clone().unwrap_or_default();
            let api_key = config.api_key.as_deref().ok_or("API key is required")?;
            let resp = HTTP_CLIENT
                .get(format!("{}/models", base_url.trim_end_matches('/')))
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;
            let status = resp.status();
            if status.is_success() {
                Ok(format!("✅ Connected to {}", config.label))
            } else {
                let body = resp.text().await.unwrap_or_default();
                Err(format!("Auth failed ({}): {}", status, body))
            }
        }
        "anthropic" => {
            let api_key = config.api_key.as_deref().ok_or("API key is required")?;
            let resp = HTTP_CLIENT
                .get("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;
            if resp.status().is_success() || resp.status().as_u16() == 400 {
                // 400 means key is valid but we made a bad request (no body) — good enough
                Ok("✅ Connected to Anthropic Claude".into())
            } else {
                Err(format!(
                    "Auth failed ({}): check your API key",
                    resp.status()
                ))
            }
        }
        "google" => {
            let api_key = config.api_key.as_deref().ok_or("API key is required")?;
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                api_key
            );
            let resp = HTTP_CLIENT
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;
            if resp.status().is_success() {
                Ok("✅ Connected to Google Gemini".into())
            } else {
                Err(format!(
                    "Auth failed ({}): check your API key",
                    resp.status()
                ))
            }
        }
        _ => Err("Unknown provider".into()),
    }
}
