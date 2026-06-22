// ─── GitHub Integration ──────────────────────────────────────────────────
//
// Provides OAuth device-flow authentication, repo listing, creation, and
// archive download via the GitHub REST API (v3).

use serde::{Deserialize, Serialize};
use std::path::Path;

// ─── Types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAuthState {
    pub is_authenticated: bool,
    pub username: Option<String>,
    pub token_preview: Option<String>, // first 8 chars of token
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub clone_url: String,
    pub ssh_url: String,
    pub language: Option<String>,
    pub stars: u64,
    pub forks: u64,
    pub is_private: bool,
    pub is_fork: bool,
    pub default_branch: String,
    pub updated_at: String,
    pub owner: String,
    pub owner_avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub public_repos: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubError {
    pub message: String,
    pub documentation_url: Option<String>,
}

// ─── Constants ────────────────────────────────────────────────────────────

/// OAuth App client ID for dweb.
/// This is a public client ID (safe to embed) used for device flow.
const CLIENT_ID: &str = "Iv23liLSGiVay7wMs0fW"; // dweb-dev local testing

/// GitHub API base URL.
const API_BASE: &str = "https://api.github.com";

/// GitHub OAuth base URL.
const OAUTH_BASE: &str = "https://github.com/login/device";

/// User-Agent required by GitHub API.
const USER_AGENT: &str = "dweb-app/0.1.0";

// ─── Token Storage ────────────────────────────────────────────────────────

/// Get the path to the GitHub token file.
fn token_path() -> std::path::PathBuf {
    let data_dir = crate::get_data_dir();
    data_dir.join("github_token.json")
}

/// Save the GitHub access token.
pub fn save_token(token: &str) -> Result<(), String> {
    let path = token_path();
    let data = serde_json::json!({ "token": token });
    std::fs::write(&path, serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Failed to save token: {}", e))?;
    Ok(())
}

/// Load the GitHub access token.
pub fn load_token() -> Option<String> {
    let path = token_path();
    if !path.exists() {
        return None;
    }
    let data = std::fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&data).ok()?;
    parsed.get("token")?.as_str().map(|s| s.to_string())
}

/// Clear the saved token.
pub fn clear_token() -> Result<(), String> {
    let path = token_path();
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to remove token: {}", e))?;
    }
    Ok(())
}

// ─── HTTP Client ──────────────────────────────────────────────────────────

/// Create a reqwest client with GitHub-friendly headers.
fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .expect("Failed to create HTTP client")
}

/// Make an authenticated GET request to the GitHub API.
async fn get_json(url: &str, token: Option<&str>) -> Result<serde_json::Value, String> {
    let req = client().get(url);
    let req = if let Some(t) = token {
        req.header("Authorization", format!("Bearer {}", t))
    } else {
        req
    };
    let req = req.header("Accept", "application/vnd.github.v3+json");

    let resp = req.send().await.map_err(|e| format!("HTTP error: {}", e))?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON error: {}", e))?;

    if !status.is_success() {
        let msg = body.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error");
        return Err(format!("GitHub API error ({}): {}", status.as_u16(), msg));
    }

    Ok(body)
}

/// Make an authenticated POST request to the GitHub API.
async fn post_json(url: &str, token: Option<&str>, body: &serde_json::Value) -> Result<serde_json::Value, String> {
    let req = client().post(url).json(body);
    let req = if let Some(t) = token {
        req.header("Authorization", format!("Bearer {}", t))
    } else {
        req
    };
    let req = req.header("Accept", "application/vnd.github.v3+json");

    let resp = req.send().await.map_err(|e| format!("HTTP error: {}", e))?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON error: {}", e))?;

    if !status.is_success() {
        let msg = body.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error");
        return Err(format!("GitHub API error ({}): {}", status.as_u16(), msg));
    }

    Ok(body)
}

// ─── OAuth Device Flow ────────────────────────────────────────────────────

/// Step 1: Request a device code from GitHub.
/// Returns the device code, user code, and verification URL.
pub async fn request_device_code() -> Result<DeviceCodeResponse, String> {
    let url = format!("{}/login/device/code", OAUTH_BASE);
    let body = serde_json::json!({
        "client_id": CLIENT_ID,
        "scope": "repo,user"
    });

    let resp = client()
        .post(&url)
        .json(&body)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Device code request failed: {}", e))?;

    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON error: {}", e))?;

    if !status.is_success() {
        let msg = json.get("error_description")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        return Err(format!("OAuth error: {}", msg));
    }

    Ok(DeviceCodeResponse {
        device_code: json.get("device_code")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        user_code: json.get("user_code")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        verification_uri: json.get("verification_uri")
            .and_then(|v| v.as_str())
            .unwrap_or("https://github.com/login/device")
            .to_string(),
        interval: json.get("interval").and_then(|v| v.as_u64()).unwrap_or(5),
        expires_in: json.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(900),
    })
}

/// Step 2: Poll GitHub to exchange the device code for an access token.
pub async fn poll_for_token(device_code: &str, interval: u64) -> Result<String, String> {
    let url = format!("{}/login/oauth/access_token", OAUTH_BASE);
    let body = serde_json::json!({
        "client_id": CLIENT_ID,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
    });

    // Poll up to 15 minutes (or until expired)
    let max_attempts = 180u64; // 180 * 5s = 15 min
    for attempt in 0..max_attempts {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

        let resp = client()
            .post(&url)
            .json(&body)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Poll failed: {}", e))?;

        let json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON error: {}", e))?;

        // Check for access token
        if let Some(token) = json.get("access_token").and_then(|v| v.as_str()) {
            if !token.is_empty() {
                save_token(token)?;
                return Ok(token.to_string());
            }
        }

        // Check for error
        if let Some(error) = json.get("error").and_then(|v| v.as_str()) {
            match error {
                "authorization_pending" => {
                    // User hasn't authorized yet — keep polling
                    log::debug!("GitHub OAuth: authorization pending (attempt {})", attempt + 1);
                    continue;
                }
                "slow_down" => {
                    // GitHub asks us to slow down — increase interval by 5s
                    log::debug!("GitHub OAuth: slow down requested");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
                "expired_token" => {
                    return Err("Device code expired. Please try again.".to_string());
                }
                "access_denied" => {
                    return Err("Access denied by user.".to_string());
                }
                _ => {
                    return Err(format!("OAuth error: {}", error));
                }
            }
        }
    }

    Err("Timed out waiting for GitHub authorization.".to_string())
}

/// Get the current auth state.
pub async fn check_auth() -> GitHubAuthState {
    let token = load_token();
    match token {
        Some(t) => {
            let preview = if t.len() > 8 {
                Some(t[..8].to_string())
            } else {
                Some(t.clone())
            };

            // Try to get user info
            match get_current_user(Some(t)).await {
                Ok(user) => GitHubAuthState {
                    is_authenticated: true,
                    username: Some(user.login),
                    token_preview: preview,
                },
                Err(_) => {
                    // Token is invalid — clear it
                    let _ = clear_token();
                    GitHubAuthState {
                        is_authenticated: false,
                        username: None,
                        token_preview: None,
                    }
                }
            }
        }
        None => GitHubAuthState {
            is_authenticated: false,
            username: None,
            token_preview: None,
        },
    }
}

/// Get the currently authenticated user.
pub async fn get_current_user(token: Option<String>) -> Result<GitHubUser, String> {
    let token = token.or_else(load_token);
    let json = get_json(&format!("{}/user", API_BASE), token.as_deref()).await?;

    Ok(GitHubUser {
        login: json.get("login").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        name: json.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
        avatar_url: json.get("avatar_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
        public_repos: json.get("public_repos").and_then(|v| v.as_u64()).unwrap_or(0),
    })
}

// ─── Repository Operations ────────────────────────────────────────────────

/// List repositories for the authenticated user.
pub async fn list_repos(token: Option<String>) -> Result<Vec<GitHubRepo>, String> {
    let token = token.or_else(load_token)
        .ok_or_else(|| "Not authenticated. Please login first.".to_string())?;

    let json = get_json(
        &format!("{}/user/repos?per_page=100&sort=updated&direction=desc", API_BASE),
        Some(&token),
    ).await?;

    let repos: Vec<serde_json::Value> = serde_json::from_value(json)
        .map_err(|e| format!("Parse error: {}", e))?;

    let mut result = Vec::new();
    for r in repos {
        result.push(GitHubRepo {
            id: r.get("id").and_then(|v| v.as_u64()).unwrap_or(0),
            name: r.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
            full_name: r.get("full_name").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
            description: r.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
            html_url: r.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            clone_url: r.get("clone_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            ssh_url: r.get("ssh_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            language: r.get("language").and_then(|v| v.as_str()).map(|s| s.to_string()),
            stars: r.get("stargazers_count").and_then(|v| v.as_u64()).unwrap_or(0),
            forks: r.get("forks_count").and_then(|v| v.as_u64()).unwrap_or(0),
            is_private: r.get("private").and_then(|v| v.as_bool()).unwrap_or(false),
            is_fork: r.get("fork").and_then(|v| v.as_bool()).unwrap_or(false),
            default_branch: r.get("default_branch").and_then(|v| v.as_str()).unwrap_or("main").to_string(),
            updated_at: r.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            owner: r.get("owner")
                .and_then(|o| o.get("login"))
                .and_then(|v| v.as_str())
                .unwrap_or("?")
                .to_string(),
            owner_avatar: r.get("owner")
                .and_then(|o| o.get("avatar_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        });
    }

    Ok(result)
}

/// Create a new repository on GitHub.
pub async fn create_repo(
    token: Option<String>,
    name: &str,
    description: Option<&str>,
    private: bool,
) -> Result<GitHubRepo, String> {
    let token = token.or_else(load_token)
        .ok_or_else(|| "Not authenticated.".to_string())?;

    let mut body = serde_json::json!({
        "name": name,
        "private": private,
        "auto_init": false,
    });
    if let Some(desc) = description {
        body["description"] = serde_json::json!(desc);
    }

    let json = post_json(&format!("{}/user/repos", API_BASE), Some(&token), &body).await?;

    Ok(GitHubRepo {
        id: json.get("id").and_then(|v| v.as_u64()).unwrap_or(0),
        name: json.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        full_name: json.get("full_name").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        description: json.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
        html_url: json.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        clone_url: json.get("clone_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        ssh_url: json.get("ssh_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        language: json.get("language").and_then(|v| v.as_str()).map(|s| s.to_string()),
        stars: json.get("stargazers_count").and_then(|v| v.as_u64()).unwrap_or(0),
        forks: json.get("forks_count").and_then(|v| v.as_u64()).unwrap_or(0),
        is_private: json.get("private").and_then(|v| v.as_bool()).unwrap_or(false),
        is_fork: json.get("fork").and_then(|v| v.as_bool()).unwrap_or(false),
        default_branch: json.get("default_branch").and_then(|v| v.as_str()).unwrap_or("main").to_string(),
        updated_at: json.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        owner: json.get("owner")
            .and_then(|o| o.get("login"))
            .and_then(|v| v.as_str())
            .unwrap_or("?")
            .to_string(),
        owner_avatar: json.get("owner")
            .and_then(|o| o.get("avatar_url"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

/// Download a repository archive (as a zipball or tarball).
/// Returns the bytes of the archive.
pub async fn download_archive(
    token: Option<String>,
    owner: &str,
    repo: &str,
    archive_format: &str, // "zipball" or "tarball"
    branch: Option<&str>,
) -> Result<Vec<u8>, String> {
    let token = token.or_else(load_token)
        .ok_or_else(|| "Not authenticated.".to_string())?;

    let branch = branch.unwrap_or("HEAD");
    let url = format!(
        "{}/repos/{}/{}/{}/{}",
        API_BASE, owner, repo, archive_format, branch
    );

    let resp = client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed (HTTP {})", resp.status().as_u16()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {}", e))?;
    Ok(bytes.to_vec())
}

/// Import a GitHub repo: clone it to a local path.
/// Equivalent to `git clone <clone_url> <path>`.
pub async fn import_repo(
    token: Option<String>,
    repo_full_name: &str, // e.g. "owner/repo"
    dest_path: &Path,
) -> Result<crate::git::RepoInfo, String> {
    let token = token.or_else(load_token)
        .ok_or_else(|| "Not authenticated.".to_string())?;

    // Get repo details to find the clone URL
    let url = format!("{}/repos/{}", API_BASE, repo_full_name);
    let json = get_json(&url, Some(&token)).await?;

    let clone_url = json.get("clone_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No clone URL found".to_string())?;

    // Clone with auth (embed token in URL for HTTPS)
    let auth_url = clone_url.replace("https://", &format!("https://x-access-token:{}@", token));

    crate::git::clone_repo(&auth_url, dest_path)
}

/// Detect VC provider from URL.
pub fn detect_provider(url: &str) -> crate::git::GitProvider {
    crate::git::detect_provider(url)
}
