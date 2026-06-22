// ─── Version Control Integration ──────────────────────────────────────────
//
// Supports local git operations via the git2 crate (libgit2 bindings).
// All functions return serializable types for Tauri invoke() responses.

use serde::{Deserialize, Serialize};
use std::path::Path;

// ─── Types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub current_branch: String,
    pub is_clean: bool,
    pub modified_files: Vec<String>,
    pub staged_files: Vec<String>,
    pub untracked_files: Vec<String>,
    pub ahead: usize,
    pub behind: usize,
    pub last_commit: Option<CommitInfo>,
    pub remotes: Vec<RemoteInfo>,
    pub branches: Vec<BranchInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitOperationResult {
    pub success: bool,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitProvider {
    Local,
    GitHub,
    GitLab,
    Bitbucket,
    Other(String),
}

impl std::fmt::Display for GitProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitProvider::Local => write!(f, "local"),
            GitProvider::GitHub => write!(f, "github"),
            GitProvider::GitLab => write!(f, "gitlab"),
            GitProvider::Bitbucket => write!(f, "bitbucket"),
            GitProvider::Other(s) => write!(f, "{}", s),
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/// Convert a git2 error to a string.
fn git_err(e: git2::Error) -> String {
    e.message().to_string()
}

/// Open a repository at the given path.
fn open_repo(path: &Path) -> Result<git2::Repository, String> {
    git2::Repository::open(path).map_err(|e| format!("Failed to open repo: {}", e.message()))
}

/// Format a time spec from git2
fn format_time(t: &git2::Time) -> String {
    let secs = t.seconds();
    chrono::DateTime::from_timestamp(secs, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Convert signature to (name, email)
fn sig_info(sig: &git2::Signature) -> (String, String) {
    (
        sig.name().unwrap_or("unknown").to_string(),
        sig.email().unwrap_or("unknown").to_string(),
    )
}

/// Extract commit info from a git2 Commit.
fn commit_info(commit: &git2::Commit) -> CommitInfo {
    let hash = commit.id().to_string();
    let (author, email) = sig_info(&commit.author());
    CommitInfo {
        short_hash: hash[..7].to_string(),
        hash,
        author,
        email,
        message: commit.message().unwrap_or("").trim().to_string(),
        timestamp: format_time(&commit.time()),
    }
}

// ─── Public API ───────────────────────────────────────────────────────────

/// Initialize a new git repository at the given path.
pub fn init_repo(path: &Path) -> Result<RepoInfo, String> {
    let repo = git2::Repository::init(path).map_err(git_err)?;

    // Create initial commit so we have a branch
    let sig = repo.signature().map_err(git_err)?;
    let tree_id = {
        let mut index = repo.index().map_err(git_err)?;
        index.write_tree().map_err(git_err)?
    };
    let tree = repo.find_tree(tree_id).map_err(git_err)?;
    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
        .map_err(git_err)?;

    get_repo_status(path)
}

/// Clone a remote repository to a local path.
pub fn clone_repo(url: &str, path: &Path) -> Result<RepoInfo, String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    // Create parent directory if needed
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create directory: {}", e))?;
    }

    // Clone with callbacks for progress
    let mut cb = git2::RemoteCallbacks::new();
    cb.transfer_progress(|progress| {
        if progress.total_objects() > 0 {
            log::debug!(
                "Clone: {}/{} objects",
                progress.received_objects(),
                progress.total_objects(),
            );
        }
        true
    });

    let mut fo = git2::FetchOptions::new();
    fo.remote_callbacks(cb);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fo);

    builder
        .clone(url, path)
        .map_err(|e| format!("Clone failed: {}", e.message()))?;

    get_repo_status(path)
}

/// Get the status of a repository at the given path.
pub fn get_repo_status(path: &Path) -> Result<RepoInfo, String> {
    let repo = open_repo(path)?;

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unnamed".to_string());

    // Current branch
    let current_branch = match repo.head() {
        Ok(head) => match head.shorthand() {
            Some(name) => name.to_string(),
            None => "HEAD (detached)".to_string(),
        },
        Err(_) => "no commits".to_string(),
    };

    // Status
    let statuses = repo
        .statuses(Some(
            git2::StatusOptions::new()
                .include_untracked(true)
                .recurse_untracked_dirs(true),
        ))
        .map_err(git_err)?;

    let mut modified_files = Vec::new();
    let mut staged_files = Vec::new();
    let mut untracked_files = Vec::new();

    for entry in statuses.iter() {
        let file_path = entry
            .path()
            .map(|p| p.to_string())
            .unwrap_or_else(|| "?".to_string());

        let status = entry.status();
        if status.contains(git2::Status::WT_MODIFIED)
            || status.contains(git2::Status::WT_DELETED)
            || status.contains(git2::Status::WT_RENAMED)
            || status.contains(git2::Status::WT_TYPECHANGE)
        {
            modified_files.push(file_path.clone());
        }
        if status.contains(git2::Status::INDEX_MODIFIED)
            || status.contains(git2::Status::INDEX_NEW)
            || status.contains(git2::Status::INDEX_DELETED)
            || status.contains(git2::Status::INDEX_RENAMED)
            || status.contains(git2::Status::INDEX_TYPECHANGE)
        {
            staged_files.push(file_path.clone());
        }
        if status.contains(git2::Status::WT_NEW) {
            untracked_files.push(file_path);
        }
    }

    let is_clean = modified_files.is_empty() && staged_files.is_empty() && untracked_files.is_empty();

    // Ahead/behind for current branch
    let (ahead, behind) = get_ahead_behind(&repo, &current_branch);

    // Last commit
    let last_commit = repo.head().ok().and_then(|head| {
        head.peel_to_commit().ok().map(|c| commit_info(&c))
    });

    // Remotes
    let remotes = list_remotes_internal(&repo);

    // Branches
    let branches = list_branches_internal(&repo);

    Ok(RepoInfo {
        path: path.to_string_lossy().to_string(),
        name,
        current_branch,
        is_clean,
        modified_files,
        staged_files,
        untracked_files,
        ahead,
        behind,
        last_commit,
        remotes,
        branches,
    })
}

/// Get ahead/behind counts for a branch vs its upstream.
fn get_ahead_behind(repo: &git2::Repository, branch_name: &str) -> (usize, usize) {
    let branch = match repo.find_branch(branch_name, git2::BranchType::Local) {
        Ok(b) => b,
        Err(_) => return (0, 0),
    };

    let upstream = match branch.upstream() {
        Ok(u) => u,
        Err(_) => return (0, 0),
    };

    let local_oid = match branch.get().target() {
        Some(oid) => oid,
        None => return (0, 0),
    };
    let upstream_oid = match upstream.get().target() {
        Some(oid) => oid,
        None => return (0, 0),
    };

    match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok((a, b)) => (a as usize, b as usize),
        Err(_) => (0, 0),
    }
}

/// Stage all files (equivalent to `git add -A`).
pub fn stage_all(path: &Path) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    let mut index = repo.index().map_err(git_err)?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(git_err)?;
    index.write().map_err(git_err)?;
    Ok(GitOperationResult {
        success: true,
        message: "All files staged".to_string(),
        details: None,
    })
}

/// Stage specific files.
pub fn stage_files(path: &Path, files: Vec<String>) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    let mut index = repo.index().map_err(git_err)?;
    for file in &files {
        index.add_path(Path::new(file)).map_err(|e| {
            format!("Failed to stage '{}': {}", file, e.message())
        })?;
    }
    index.write().map_err(git_err)?;
    Ok(GitOperationResult {
        success: true,
        message: format!("Staged {} file(s)", files.len()),
        details: None,
    })
}

/// Unstage all files.
pub fn unstage_all(path: &Path) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    let mut index = repo.index().map_err(git_err)?;
    // git2 0.19 remove_all takes (paths, opts)
    index.remove_all(["*"].iter(), None).map_err(git_err)?;
    index.write().map_err(git_err)?;
    Ok(GitOperationResult {
        success: true,
        message: "All files unstaged".to_string(),
        details: None,
    })
}

/// Create a commit with the given message (stages all changes first).
pub fn commit(path: &Path, message: &str) -> Result<CommitInfo, String> {
    let repo = open_repo(path)?;

    // Stage all changes first
    let mut index = repo.index().map_err(git_err)?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(git_err)?;
    index.write().map_err(git_err)?;

    let tree_id = index.write_tree().map_err(git_err)?;
    let tree = repo.find_tree(tree_id).map_err(git_err)?;

    let sig = repo.signature().map_err(git_err)?;

    let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

    let commit_id = match parent_commit {
        Some(ref parent) => repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &[parent],
        ),
        None => repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &[],
        ),
    }
    .map_err(git_err)?;

    let commit_obj = repo.find_commit(commit_id).map_err(git_err)?;
    Ok(commit_info(&commit_obj))
}

/// Push to the remote (default: origin, current branch).
pub fn push(path: &Path, remote_name: Option<&str>, branch: Option<&str>) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    let remote_name = remote_name.unwrap_or("origin");
    let branch = branch.unwrap_or("");

    // Determine branch to push
    let branch_to_push = if branch.is_empty() {
        match repo.head() {
            Ok(head) => match head.shorthand() {
                Some(name) => name.to_string(),
                None => return Err("No active branch".to_string()),
            },
            Err(_) => return Err("No commits yet".to_string()),
        }
    } else {
        branch.to_string()
    };

    let mut remote = repo.find_remote(remote_name).map_err(|e| {
        format!("Remote '{}' not found: {}", remote_name, e.message())
    })?;

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_to_push, branch_to_push);

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.push_update_reference(|refname, status| {
        if let Some(msg) = status {
            Err(git2::Error::from_str(&format!("Push rejected '{}': {}", refname, msg)))
        } else {
            Ok(())
        }
    });

    let mut opts = git2::PushOptions::new();
    opts.remote_callbacks(callbacks);

    remote.push(&[&refspec], Some(&mut opts)).map_err(|e| {
        format!("Push failed: {}", e.message())
    })?;

    Ok(GitOperationResult {
        success: true,
        message: format!("Pushed '{}' to '{}'", branch_to_push, remote_name),
        details: None,
    })
}

/// Pull from the remote (default: origin, current branch).
pub fn pull(path: &Path, remote_name: Option<&str>, branch: Option<&str>) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    let remote_name = remote_name.unwrap_or("origin");
    let branch = branch.unwrap_or("");

    // Determine branch
    let branch_to_merge = if branch.is_empty() {
        match repo.head() {
            Ok(head) => match head.shorthand() {
                Some(name) => name.to_string(),
                None => return Err("No active branch".to_string()),
            },
            Err(_) => return Err("No commits yet".to_string()),
        }
    } else {
        branch.to_string()
    };

    // Fetch from remote
    let mut remote = repo.find_remote(remote_name).map_err(|e| {
        format!("Remote '{}' not found: {}", remote_name, e.message())
    })?;

    let mut fetch_opts = git2::FetchOptions::new();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.transfer_progress(|progress| {
        log::debug!("Fetch: {}/{} objects", progress.received_objects(), progress.total_objects());
        true
    });
    fetch_opts.remote_callbacks(callbacks);

    // Use a temp refspec for fetch
    let refspec = format!("+refs/heads/{}:refs/remotes/{}/{}", branch_to_merge, remote_name, branch_to_merge);

    remote.fetch(&[&refspec], Some(&mut fetch_opts), None).map_err(|e| {
        format!("Fetch failed: {}", e.message())
    })?;

    // Merge fetched branch
    let fetch_head = repo.find_reference("FETCH_HEAD").map_err(|e| {
        format!("Cannot find FETCH_HEAD: {}", e.message())
    })?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)
        .map_err(git_err)?;

    let analysis = repo.merge_analysis(&[&fetch_commit]).map_err(git_err)?;

    if analysis.0.is_up_to_date() {
        return Ok(GitOperationResult {
            success: true,
            message: "Already up to date".to_string(),
            details: None,
        });
    }

    if analysis.0.is_fast_forward() {
        // Fast-forward merge
        let refname = format!("refs/heads/{}", branch_to_merge);
        let mut reference = repo.find_reference(&refname).map_err(git_err)?;
        reference.set_target(fetch_commit.id(), "Pull: fast-forward").map_err(git_err)?;
        repo.set_head(&refname).map_err(git_err)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(git_err)?;
        Ok(GitOperationResult {
            success: true,
            message: format!("Fast-forward merged '{}' from '{}'", branch_to_merge, remote_name),
            details: None,
        })
    } else {
        // Normal merge (may require manual conflict resolution)
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.allow_conflicts(true).conflict_style_merge(true);

        let mut merge_opts = git2::MergeOptions::new();
        if let Err(e) = repo.merge(&[&fetch_commit], Some(&mut merge_opts), Some(&mut checkout)) {
            return Err(format!("Merge failed: {}. Resolve conflicts and commit.", e.message()));
        }

        // Check if there are conflicts
        if repo.index().map_err(git_err)?.has_conflicts() {
            return Ok(GitOperationResult {
                success: false,
                message: "Pull completed with conflicts. Resolve them and commit.".to_string(),
                details: Some("Conflicts detected after merge".to_string()),
            });
        }

        // Auto-commit the merge
        let sig = repo.signature().map_err(git_err)?;
        let tree_id = repo.index().map_err(git_err)?.write_tree().map_err(git_err)?;
        let tree = repo.find_tree(tree_id).map_err(git_err)?;
        let head_commit = repo.head().and_then(|h| h.peel_to_commit()).map_err(git_err)?;

        // Peel the annotated commit to a regular commit for the parent list
        let fetch_commit_obj = fetch_commit.id();
        let fetch_commit_parent = repo.find_commit(fetch_commit_obj).map_err(git_err)?;

        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &format!("Merge remote-tracking branch '{}/{}'", remote_name, branch_to_merge),
            &tree,
            &[&head_commit, &fetch_commit_parent],
        )
        .map_err(git_err)?;

        Ok(GitOperationResult {
            success: true,
            message: format!("Merged '{}/{}'", remote_name, branch_to_merge),
            details: None,
        })
    }
}

/// List branches (local and remote).
pub fn list_branches(path: &Path) -> Result<Vec<BranchInfo>, String> {
    let repo = open_repo(path)?;
    Ok(list_branches_internal(&repo))
}

fn list_branches_internal(repo: &git2::Repository) -> Vec<BranchInfo> {
    let current = repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string()));
    let mut branches = Vec::new();

    // Local branches
    if let Ok(branch_iter) = repo.branches(Some(git2::BranchType::Local)) {
        for branch in branch_iter.flatten() {
            let name = branch.0.name().ok().flatten().unwrap_or("?").to_string();
            let is_current = current.as_deref() == Some(name.as_str());
            branches.push(BranchInfo {
                name,
                is_current,
                is_remote: false,
            });
        }
    }

    // Remote branches
    if let Ok(branch_iter) = repo.branches(Some(git2::BranchType::Remote)) {
        for branch in branch_iter.flatten() {
            let name = branch.0.name().ok().flatten().unwrap_or("?").to_string();
            branches.push(BranchInfo {
                name,
                is_current: false,
                is_remote: true,
            });
        }
    }

    branches
}

/// Switch to a branch (create if it doesn't exist).
pub fn switch_branch(path: &Path, name: &str) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;

    // Check if branch exists locally
    match repo.find_branch(name, git2::BranchType::Local) {
        Ok(branch) => {
            let refname = branch.get().name().ok_or("Invalid branch ref")?.to_string();
            repo.set_head(&refname).map_err(git_err)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
                .map_err(git_err)?;
            Ok(GitOperationResult {
                success: true,
                message: format!("Switched to branch '{}'", name),
                details: None,
            })
        }
        Err(_) => {
            // Create new branch from HEAD
            let head_commit = repo.head()
                .and_then(|h| h.peel_to_commit())
                .map_err(|_| "No commits yet — cannot create branch".to_string())?;
            repo.branch(name, &head_commit, false).map_err(git_err)?;
            let refname = format!("refs/heads/{}", name);
            repo.set_head(&refname).map_err(git_err)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
                .map_err(git_err)?;
            Ok(GitOperationResult {
                success: true,
                message: format!("Created and switched to branch '{}'", name),
                details: None,
            })
        }
    }
}

/// Delete a branch.
pub fn delete_branch(path: &Path, name: &str) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    let mut branch = repo.find_branch(name, git2::BranchType::Local)
        .map_err(|_| format!("Branch '{}' not found", name))?;
    branch.delete().map_err(git_err)?;
    Ok(GitOperationResult {
        success: true,
        message: format!("Deleted branch '{}'", name),
        details: None,
    })
}

/// List remotes.
pub fn list_remotes(path: &Path) -> Result<Vec<RemoteInfo>, String> {
    let repo = open_repo(path)?;
    Ok(list_remotes_internal(&repo))
}

fn list_remotes_internal(repo: &git2::Repository) -> Vec<RemoteInfo> {
    let mut remotes = Vec::new();
    if let Ok(names) = repo.remotes() {
        for name in names.iter().flatten() {
            if let Ok(remote) = repo.find_remote(name) {
                if let Some(url) = remote.url() {
                    remotes.push(RemoteInfo {
                        name: name.to_string(),
                        url: url.to_string(),
                    });
                }
            }
        }
    }
    remotes
}

/// Add a remote.
pub fn add_remote(path: &Path, name: &str, url: &str) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    repo.remote(name, url).map_err(|e| {
        format!("Failed to add remote '{}': {}", name, e.message())
    })?;
    Ok(GitOperationResult {
        success: true,
        message: format!("Added remote '{}' → {}", name, url),
        details: None,
    })
}

/// Remove a remote.
pub fn remove_remote(path: &Path, name: &str) -> Result<GitOperationResult, String> {
    let repo = open_repo(path)?;
    repo.remote_delete(name).map_err(|e| {
        format!("Failed to remove remote '{}': {}", name, e.message())
    })?;
    Ok(GitOperationResult {
        success: true,
        message: format!("Removed remote '{}'", name),
        details: None,
    })
}

/// Get commit log.
pub fn log(path: &Path, max_count: usize) -> Result<Vec<GitLogEntry>, String> {
    let repo = open_repo(path)?;
    let mut revwalk = repo.revwalk().map_err(git_err)?;
    revwalk.push_head().map_err(git_err)?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(git_err)?;

    let mut entries = Vec::new();
    for (i, oid) in revwalk.flatten().enumerate() {
        if i >= max_count {
            break;
        }
        if let Ok(commit) = repo.find_commit(oid) {
            let hash = commit.id().to_string();
            let (author, email) = sig_info(&commit.author());
            entries.push(GitLogEntry {
                short_hash: hash[..7].to_string(),
                hash,
                author,
                email,
                message: commit.message().unwrap_or("").trim().to_string(),
                timestamp: format_time(&commit.time()),
            });
        }
    }
    Ok(entries)
}

/// Detect git provider from a remote URL.
pub fn detect_provider(url: &str) -> GitProvider {
    let lower = url.to_lowercase();
    if lower.contains("github.com") {
        GitProvider::GitHub
    } else if lower.contains("gitlab") {
        GitProvider::GitLab
    } else if lower.contains("bitbucket") {
        GitProvider::Bitbucket
    } else {
        GitProvider::Other(url.to_string())
    }
}

/// List all repos under a directory (scans for .git folders).
pub fn find_repos(root: &Path) -> Result<Vec<RepoInfo>, String> {
    let mut repos = Vec::new();

    if !root.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let git_dir = path.join(".git");
                if git_dir.exists() {
                    match get_repo_status(&path) {
                        Ok(info) => repos.push(info),
                        Err(e) => log::warn!("Failed to read repo at {}: {}", path.display(), e),
                    }
                }
            }
        }
    }

    Ok(repos)
}
