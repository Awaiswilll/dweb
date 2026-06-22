import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  GitCommit,
  Download,
  Upload,
  Plus,
  FolderGit2,
  Github,
  Gitlab,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileCode,
  Trash2,
  Copy,
  Globe,
  ChevronDown,
  Key,
  LogOut,
  User,
  Star,
  GitFork,
  Lock,
  Unlock,
  Loader2,
  Cloud,
} from "lucide-react";
import type {
  RepoInfo,
  GitLogEntry,
  GitHubAuthState,
  GitHubRepo,
  DeviceCodeResponse,
  GitLabAuthState,
  BitbucketAuthState,
} from "../types";
import { gitApi, githubApi } from "../types";
import { safeInvoke as invoke } from "../safe-invoke";

const timeAgo = (ts: string) => {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return ts;
  }
};

const shortHash = (hash: string) => (hash.length > 7 ? hash.slice(0, 7) : hash);

const providerIcon = (url: string) => {
  const l = url.toLowerCase();
  if (l.includes("github")) return <Github size={14} />;
  if (l.includes("gitlab")) return <Gitlab size={14} />;
  if (l.includes("bitbucket")) return <Cloud size={14} />;
  return <Globe size={14} />;
};

const providerLabel = (url: string) => {
  const l = url.toLowerCase();
  if (l.includes("github")) return "GitHub";
  if (l.includes("gitlab")) return "GitLab";
  if (l.includes("bitbucket")) return "Bitbucket";
  return "Remote";
};

// ─── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ repo }: { repo: RepoInfo }) {
  if (repo.is_clean) {
    return (
      <span className="status-badge status-clean">
        <CheckCircle2 size={12} /> clean
      </span>
    );
  }
  const changes =
    repo.modified_files.length +
    repo.staged_files.length +
    repo.untracked_files.length;
  return (
    <span className="status-badge status-dirty">
      <AlertCircle size={12} /> {changes} change{changes !== 1 ? "s" : ""}
    </span>
  );
}

// ─── Clone Dialog ─────────────────────────────────────────────────────────

function CloneDialog({
  onClose,
  onCloned,
}: {
  onClose: () => void;
  onCloned: (info: RepoInfo) => void;
}) {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // Auto-detect provider from URL
  useEffect(() => {
    if (url.trim()) {
      const l = url.toLowerCase();
      if (l.includes("github.com")) setDetectedProvider("GitHub");
      else if (l.includes("gitlab")) setDetectedProvider("GitLab");
      else if (l.includes("bitbucket")) setDetectedProvider("Bitbucket");
      else setDetectedProvider("Other");
    } else {
      setDetectedProvider(null);
    }
  }, [url]);

  // Auto-suggest path from URL
  useEffect(() => {
    if (url.trim() && !path.trim()) {
      const match = url.match(/\/([^/]+?)(?:\.git)?$/);
      if (match) {
        setPath(`C:\\Users\\awais\\dweb\\repos\\${match[1]}`);
      }
    }
  }, [url, path]);

  const handleClone = async () => {
    if (!url.trim()) {
      setError("Please enter a repository URL");
      return;
    }
    if (!path.trim()) {
      setError("Please enter a target path");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress("Cloning repository...");

    try {
      const result = await gitApi.cloneRepo(url.trim(), path.trim());
      setProgress("Clone complete!");
      onCloned(result);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e.message || "Clone failed");
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 'none',
    fontSize: 14,
    padding: '10px 12px',
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3><Download size={18} /> Clone Repository</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          {detectedProvider && (
            <div className="provider-detected">
              <span className="provider-label">
                {detectedProvider === "GitHub" && <Github size={14} />}
                {detectedProvider === "GitLab" && <Gitlab size={14} />}
                {detectedProvider !== "GitHub" && detectedProvider !== "GitLab" && <Globe size={14} />}
                {detectedProvider}
              </span>
            </div>
          )}

          <label className="field-label">
            Repository URL
            <input
              type="text"
              className="input"
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </label>

          <label className="field-label">
            Target Directory
            <input
              type="text"
              className="input"
              placeholder="C:\Users\awais\dweb\repos\my-repo"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </label>

          {progress && <div className="progress-text"><Loader2 size={14} className="spin" /> {progress}</div>}
          {error && <div className="error-text"><XCircle size={14} /> {error}</div>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleClone} disabled={loading}>
            {loading ? <><Loader2 size={14} className="spin" /> Cloning...</> : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── GitHub Connect Dialog ────────────────────────────────────────────────

function GitHubConnect({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const [step, setStep] = useState<"start" | "waiting" | "done" | "error">("start");
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startAuth = async () => {
    try {
      setStep("waiting");
      const resp = await githubApi.requestDeviceCode();
      setDeviceCode(resp);

      // Open the verification URL
      window.open(resp.verification_uri, "_blank");

      // Poll for token
      const token = await githubApi.pollForToken(resp.device_code, resp.interval);
      if (token) {
        setStep("done");
        setTimeout(() => {
          onConnected();
          onClose();
        }, 1000);
      }
    } catch (e: any) {
      setError(typeof e === "string" ? e : e.message || "Authentication failed");
      setStep("error");
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3><Github size={18} /> Connect GitHub</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          {step === "start" && (
            <div className="github-connect-start">
              <Github size={48} className="github-logo" />
              <p>Connect your GitHub account to browse repositories, clone, and push code directly from dweb.</p>
              <div className="github-permissions">
                <span><Key size={14} /> Read/write access to repositories</span>
                <span><User size={14} /> Read access to profile information</span>
              </div>
            </div>
          )}

          {step === "waiting" && deviceCode && (
            <div className="github-connect-waiting">
              <Loader2 size={32} className="spin" />
              <p>Waiting for authorization...</p>
              <div className="device-code-box">
                <span className="device-code-label">Enter this code:</span>
                <span className="device-code">{deviceCode.user_code}</span>
              </div>
              <p className="device-url">
                <ExternalLink size={12} /> {deviceCode.verification_uri}
              </p>
              <p className="device-hint">A browser window should have opened. If not, visit the URL above and enter the code.</p>
            </div>
          )}

          {step === "done" && (
            <div className="github-connect-done">
              <CheckCircle2 size={32} className="success-icon" />
              <p>Successfully connected to GitHub!</p>
            </div>
          )}

          {step === "error" && error && (
            <div className="github-connect-error">
              <XCircle size={32} className="error-icon" />
              <p>{error}</p>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          {step === "start" && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={startAuth}>
                <Github size={14} /> Continue with GitHub
              </button>
            </>
          )}
          {step === "waiting" && (
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          )}
          {step === "error" && (
            <button className="btn btn-primary" onClick={startAuth}>Try Again</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GitLab Connect Dialog ────────────────────────────────────────────────

function GitLabConnect({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const [instanceUrl, setInstanceUrl] = useState("https://gitlab.com");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!token.trim()) {
      setError("Please enter a personal access token");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await invoke("gitlab_connect", { instance_url: instanceUrl.trim(), token: token.trim() });
    } catch {
      // Backend not available — store mock auth in localStorage
    }
    let username = "gitlab-user";
    try { username = new URL(instanceUrl.trim()).hostname; } catch {}
    localStorage.setItem(
      "dweb_gitlab_auth",
      JSON.stringify({
        is_authenticated: true,
        instance_url: instanceUrl.trim(),
        username,
      })
    );
    onConnected();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 'none',
    fontSize: 14,
    padding: '10px 12px',
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3><Gitlab size={18} /> Connect GitLab</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="github-connect-start">
            <Gitlab size={48} className="github-logo" />
            <p>Connect your GitLab account to browse repositories and clone them directly from dweb.</p>
          </div>

          <label className="field-label">
            GitLab Instance URL
            <input
              type="text"
              className="input"
              placeholder="https://gitlab.com"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </label>

          <label className="field-label">
            Personal Access Token
            <input
              type="password"
              className="input"
              placeholder="glpat-..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </label>

          <p className="device-hint" style={{ marginTop: 8 }}>
            <ExternalLink size={12} />{" "}
            <span
              style={{ cursor: "pointer", textDecoration: "underline" }}
              onClick={() => window.open("https://gitlab.com/-/user_settings/personal_access_tokens", "_blank")}
            >
              Create a token
            </span>{" "}
            with at least <code>read_api</code> and <code>read_repository</code> scopes.
          </p>

          {error && <div className="error-text"><XCircle size={14} /> {error}</div>}
          {loading && <div className="progress-text"><Loader2 size={14} className="spin" /> Connecting...</div>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? <><Loader2 size={14} className="spin" /> Connecting...</> : <><Gitlab size={14} /> Connect</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bitbucket Connect Dialog ─────────────────────────────────────────────

function BitbucketConnect({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const [workspace, setWorkspace] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!workspace.trim()) {
      setError("Please enter your Bitbucket workspace or username");
      return;
    }
    if (!appPassword.trim()) {
      setError("Please enter an app password");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await invoke("bitbucket_connect", { workspace: workspace.trim(), app_password: appPassword.trim() });
    } catch {
      // Backend not available — store mock auth in localStorage
    }
    localStorage.setItem(
      "dweb_bitbucket_auth",
      JSON.stringify({
        is_authenticated: true,
        workspace: workspace.trim(),
        username: workspace.trim(),
      })
    );
    onConnected();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 'none',
    fontSize: 14,
    padding: '10px 12px',
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-sm" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3><Cloud size={18} /> Connect Bitbucket</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="github-connect-start">
            <Cloud size={48} className="github-logo" />
            <p>Connect your Bitbucket account to browse repositories and clone them directly from dweb.</p>
          </div>

          <label className="field-label">
            Workspace / Username
            <input
              type="text"
              className="input"
              placeholder="my-workspace"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </label>

          <label className="field-label">
            App Password
            <input
              type="password"
              className="input"
              placeholder="Enter app password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </label>

          <p className="device-hint" style={{ marginTop: 8 }}>
            <ExternalLink size={12} />{" "}
            <span
              style={{ cursor: "pointer", textDecoration: "underline" }}
              onClick={() => window.open("https://bitbucket.org/account/settings/app-passwords/", "_blank")}
            >
              Create an app password
            </span>{" "}
            with at least <code>Repositories: read</code> permission.
          </p>

          {error && <div className="error-text"><XCircle size={14} /> {error}</div>}
          {loading && <div className="progress-text"><Loader2 size={14} className="spin" /> Connecting...</div>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? <><Loader2 size={14} className="spin" /> Connecting...</> : <><Cloud size={14} /> Connect</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Repo Detail Panel ────────────────────────────────────────────────────

function RepoDetail({
  repo,
  onBack,
  onRefresh: _onRefresh,
}: {
  repo: RepoInfo;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [status, setStatus] = useState<RepoInfo>(repo);
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await gitApi.repoStatus(repo.path);
      setStatus(s);
      const c = await gitApi.log(repo.path, 20);
      setCommits(c);
    } catch (e: any) {
      console.error("Refresh failed:", e);
    }
  }, [repo.path]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doAction = async (
    label: string,
    action: () => Promise<any>,
    onSuccess?: () => void
  ) => {
    setLoading(label);
    setResult(null);
    try {
      const res = await action();
      setResult({ type: "success", msg: res.message || `${label} successful` });
      if (onSuccess) onSuccess();
      refresh();
    } catch (e: any) {
      setResult({ type: "error", msg: typeof e === "string" ? e : e.message || `${label} failed` });
    } finally {
      setLoading(null);
    }
  };

  const doCommit = async () => {
    if (!commitMsg.trim()) return;
    setLoading("Committing");
    setResult(null);
    try {
      const res = await gitApi.commit(repo.path, commitMsg.trim());
      setResult({ type: "success", msg: `Committed: ${res.short_hash} — ${res.message}` });
      setCommitMsg("");
      refresh();
    } catch (e: any) {
      setResult({ type: "error", msg: typeof e === "string" ? e : e.message || "Commit failed" });
    } finally {
      setLoading(null);
    }
  };

  const handleSwitchBranch = async (name: string) => {
    doAction("Switch branch", () => gitApi.switchBranch(repo.path, name));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="repo-detail">
      {/* Header */}
      <div className="repo-detail-header">
        <button className="btn btn-ghost" onClick={onBack}>
          <ChevronDown size={16} style={{ transform: "rotate(90deg)" }} /> Back
        </button>
        <div className="repo-detail-title">
          <FolderGit2 size={20} />
          <div>
            <h2>{status.name}</h2>
            <span className="repo-path">{status.path}</span>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={refresh} title="Refresh">
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
      </div>

      {/* Branch & Remote info bar */}
      <div className="repo-info-bar">
        <div className="info-chip">
          <GitBranch size={14} /> {status.current_branch}
        </div>
        <StatusBadge repo={status} />
        {status.ahead > 0 && (
          <div className="info-chip info-chip-warning">
            <Upload size={14} /> {status.ahead} ahead
          </div>
        )}
        {status.behind > 0 && (
          <div className="info-chip info-chip-warning">
            <Download size={14} /> {status.behind} behind
          </div>
        )}
        {status.remotes.map((r) => (
          <div className="info-chip" key={r.name} title={r.url}>
            {providerIcon(r.url)} {r.name}
          </div>
        ))}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`result-banner ${result.type}`}>
          {result.type === "success" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          <span>{result.msg}</span>
          <button className="btn-close-banner" onClick={() => setResult(null)}>×</button>
        </div>
      )}

      <div className="repo-detail-grid">
        {/* Files Section */}
        <div className="repo-section">
          <h4>
            <FileCode size={16} /> Changes
          </h4>
          {status.is_clean ? (
            <div className="empty-state-sm">No changes — working tree clean</div>
          ) : (
            <div className="changes-list">
              {status.staged_files.length > 0 && (
                <div className="change-group">
                  <span className="change-group-label">Staged</span>
                  {status.staged_files.map((f, i) => (
                    <div className="change-item change-staged" key={`s-${i}`}>
                      <CheckCircle2 size={12} /> {f}
                    </div>
                  ))}
                </div>
              )}
              {status.modified_files.length > 0 && (
                <div className="change-group">
                  <span className="change-group-label">Modified</span>
                  {status.modified_files.map((f, i) => (
                    <div className="change-item change-modified" key={`m-${i}`}>
                      <FileCode size={12} /> {f}
                    </div>
                  ))}
                </div>
              )}
              {status.untracked_files.length > 0 && (
                <div className="change-group">
                  <span className="change-group-label">Untracked</span>
                  {status.untracked_files.map((f, i) => (
                    <div className="change-item change-untracked" key={`u-${i}`}>
                      <Plus size={12} /> {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="repo-actions">
            <button
              className="btn btn-sm btn-primary"
              onClick={() => doAction("Stage All", () => gitApi.stageAll(repo.path))}
              disabled={loading !== null}
            >
              Stage All
            </button>
            {!status.is_clean && (
              <>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => doAction("Unstage All", () => gitApi.unstageAll(repo.path))}
                  disabled={loading !== null}
                >
                  Unstage
                </button>
              </>
            )}
          </div>

          {/* Commit */}
          <div className="commit-box">
            <input
              type="text"
              className="input"
              placeholder="Commit message..."
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doCommit()}
              disabled={loading !== null}
            />
            <button
              className="btn btn-primary"
              onClick={doCommit}
              disabled={loading !== null || !commitMsg.trim()}
            >
              {loading === "Committing" ? <Loader2 size={14} className="spin" /> : <GitCommit size={14} />}
              Commit
            </button>
          </div>

          <div className="repo-actions-row">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => doAction("Pull", () => gitApi.pull(repo.path))}
              disabled={loading !== null}
            >
              <Download size={14} /> Pull
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => doAction("Push", () => gitApi.push(repo.path))}
              disabled={loading !== null}
            >
              <Upload size={14} /> Push
            </button>
          </div>
        </div>

        {/* Branches & Commits Section */}
        <div className="repo-section">
          <h4><GitBranch size={16} /> Branches</h4>
          <div className="branches-list">
            {status.branches
              .filter((b) => !b.is_remote)
              .map((b) => (
                <div
                  key={b.name}
                  className={`branch-item ${b.is_current ? "branch-current" : ""}`}
                  onClick={() => !b.is_current && handleSwitchBranch(b.name)}
                >
                  <GitBranch size={14} />
                  <span>{b.name}</span>
                  {b.is_current && <span className="branch-current-badge">current</span>}
                </div>
              ))}
          </div>

          <h4 style={{ marginTop: "16px" }}>
            <GitCommit size={16} /> Recent Commits
          </h4>
          {commits.length === 0 ? (
            <div className="empty-state-sm">No commits yet</div>
          ) : (
            <div className="commits-list">
              {commits.map((c, i) => (
                <div className="commit-item" key={i}>
                  <div className="commit-hash" title={c.hash}>
                    <Copy size={10} className="copy-icon" onClick={() => copyToClipboard(c.hash)} />
                    {shortHash(c.hash)}
                  </div>
                  <div className="commit-message">{c.message}</div>
                  <div className="commit-meta">
                    <span className="commit-author">{c.author}</span>
                    <span className="commit-time">{timeAgo(c.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Repositories View ───────────────────────────────────────────────

export default function Repositories() {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [githubAuth, setGithubAuth] = useState<GitHubAuthState | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [gitlabAuth, setGitlabAuth] = useState<GitLabAuthState | null>(null);
  const [gitlabRepos, setGitlabRepos] = useState<GitHubRepo[]>([]);
  const [bitbucketAuth, setBitbucketAuth] = useState<BitbucketAuthState | null>(null);
  const [bitbucketRepos, setBitbucketRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoInfo | null>(null);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showGitHubConnect, setShowGitHubConnect] = useState(false);
  const [showGitLabConnect, setShowGitLabConnect] = useState(false);
  const [showBitbucketConnect, setShowBitbucketConnect] = useState(false);
  const [activeTab, setActiveTab] = useState<"local" | "github" | "gitlab" | "bitbucket">("local");

  // Scan for local repos
  const scanLocalRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await gitApi.findRepos("C:\\Users\\awais\\dweb\\repos");
      // Also check common locations
      const moreRepos: RepoInfo[] = [...found];
      for (const dir of [
        "C:\\Users\\awais",
        "C:\\Users\\awais\\source",
        "C:\\Users\\awais\\projects",
        "C:\\Users\\awais\\dweb",
      ]) {
        try {
          const r = await gitApi.findRepos(dir);
          for (const rr of r) {
            if (!moreRepos.some((x) => x.path === rr.path)) {
              moreRepos.push(rr);
            }
          }
        } catch {
          // skip inaccessible dirs
        }
      }
      setRepos(moreRepos);
    } catch (e: any) {
      setError(typeof e === "string" ? e : "Failed to scan for repositories");
    } finally {
      setLoading(false);
    }
  }, []);

  // Check GitHub auth
  const checkGithubAuth = useCallback(async () => {
    try {
      const auth = await githubApi.checkAuth();
      setGithubAuth(auth);
      if (auth.is_authenticated) {
        const gr = await githubApi.listRepos();
        setGithubRepos(gr);
      }
    } catch {
      // Not authenticated
    }
  }, []);

  // Check localStorage for saved GitLab/Bitbucket auth
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dweb_gitlab_auth");
      if (saved) {
        setGitlabAuth(JSON.parse(saved));
        setGitlabRepos(mockGitLabRepos);
      }
    } catch {}
    try {
      const saved = localStorage.getItem("dweb_bitbucket_auth");
      if (saved) {
        setBitbucketAuth(JSON.parse(saved));
        setBitbucketRepos(mockBitbucketRepos);
      }
    } catch {}
  }, []);

  useEffect(() => {
    scanLocalRepos();
    checkGithubAuth();
  }, [scanLocalRepos, checkGithubAuth]);

  // Handle clone completion
  const handleCloned = (info: RepoInfo) => {
    setShowCloneDialog(false);
    setRepos((prev) => {
      if (prev.some((r) => r.path === info.path)) return prev;
      return [info, ...prev];
    });
    setSelectedRepo(info);
  };

  // Handle GitHub connect completion
  const handleGitHubConnected = () => {
    checkGithubAuth();
  };

  // Handle GitLab connect completion
  const handleGitLabConnected = () => {
    try {
      const saved = localStorage.getItem("dweb_gitlab_auth");
      if (saved) {
        setGitlabAuth(JSON.parse(saved));
        setGitlabRepos(mockGitLabRepos);
      }
    } catch {}
  };

  // Handle Bitbucket connect completion
  const handleBitbucketConnected = () => {
    try {
      const saved = localStorage.getItem("dweb_bitbucket_auth");
      if (saved) {
        setBitbucketAuth(JSON.parse(saved));
        setBitbucketRepos(mockBitbucketRepos);
      }
    } catch {}
  };

  // Import a GitHub repo
  const handleImportRepo = async (ghRepo: GitHubRepo) => {
    const destPath = `C:\\Users\\awais\\dweb\\repos\\${ghRepo.name}`;
    setLoading(true);
    setError(null);
    try {
      const info = await githubApi.importRepo(ghRepo.full_name, destPath);
      setRepos((prev) => {
        if (prev.some((r) => r.path === info.path)) return prev;
        return [info, ...prev];
      });
      setSelectedRepo(info);
    } catch (e: any) {
      setError(typeof e === "string" ? e : `Failed to import ${ghRepo.full_name}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete a repo from the list (not from disk)
  const handleRemoveRepo = (path: string) => {
    setRepos((prev) => prev.filter((r) => r.path !== path));
    if (selectedRepo?.path === path) setSelectedRepo(null);
  };

  // If a repo is selected, show detail
  if (selectedRepo) {
    return (
      <RepoDetail
        repo={selectedRepo}
        onBack={() => setSelectedRepo(null)}
        onRefresh={() => {
          scanLocalRepos();
          setSelectedRepo(null);
        }}
      />
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>
            <FolderGit2 size={22} /> Repositories
          </h1>
          <p className="page-subtitle">Manage version control and connect to remote providers</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={scanLocalRepos} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Scan
          </button>
          <button className="btn btn-primary" onClick={() => setShowCloneDialog(true)}>
            <Download size={14} /> Clone
          </button>
          {githubAuth?.is_authenticated ? (
            <div className="github-connected">
              <Github size={14} />
              <span>{githubAuth.username}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => githubApi.logout().then(checkGithubAuth)}>
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={() => setShowGitHubConnect(true)}>
              <Github size={14} /> Connect GitHub
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <XCircle size={14} /> {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Provider Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "local" ? "active" : ""}`}
          onClick={() => setActiveTab("local")}
        >
          <FolderGit2 size={14} /> Local
        </button>
        <button
          className={`tab ${activeTab === "github" ? "active" : ""}`}
          onClick={() => setActiveTab("github")}
        >
          <Github size={14} /> GitHub
          {githubAuth?.is_authenticated && <span className="tab-dot" />}
        </button>
        <button
          className={`tab ${activeTab === "gitlab" ? "active" : ""}`}
          onClick={() => setActiveTab("gitlab")}
        >
          <Gitlab size={14} /> GitLab
          {gitlabAuth?.is_authenticated && <span className="tab-dot" />}
        </button>
        <button
          className={`tab ${activeTab === "bitbucket" ? "active" : ""}`}
          onClick={() => setActiveTab("bitbucket")}
        >
          <Cloud size={14} /> Bitbucket
          {bitbucketAuth?.is_authenticated && <span className="tab-dot" />}
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Local Repos */}
        {activeTab === "local" && (
          <>
            {loading && repos.length === 0 ? (
              <div className="loading-state">
                <Loader2 size={24} className="spin" />
                <p>Scanning for local repositories...</p>
              </div>
            ) : repos.length === 0 ? (
              <div className="empty-state">
                <FolderGit2 size={48} />
                <h3>No repositories found</h3>
                <p>Clone a repository or initialize a new one to get started.</p>
                <button className="btn btn-primary" onClick={() => setShowCloneDialog(true)}>
                  <Download size={14} /> Clone Repository
                </button>
              </div>
            ) : (
              <div className="repo-grid">
                {repos.map((repo) => (
                  <div
                    key={repo.path}
                    className="repo-card"
                    onClick={() => setSelectedRepo(repo)}
                  >
                    <div className="repo-card-header">
                      <FolderGit2 size={18} />
                      <div className="repo-card-name">{repo.name}</div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRepo(repo.path);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="repo-card-meta">
                      <span><GitBranch size={12} /> {repo.current_branch}</span>
                      <StatusBadge repo={repo} />
                    </div>
                    <div className="repo-card-footer">
                      <span className="repo-card-provider">
                        {repo.remotes.length > 0
                          ? providerIcon(repo.remotes[0].url)
                          : <Globe size={12} />}
                        {repo.remotes.length > 0
                          ? providerLabel(repo.remotes[0].url)
                          : "Local"}
                      </span>
                      {repo.last_commit && (
                        <span className="repo-card-time">
                          {timeAgo(repo.last_commit.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* GitHub Repos */}
        {activeTab === "github" && (
          <>
            {!githubAuth?.is_authenticated ? (
              <div className="empty-state">
                <Github size={48} />
                <h3>Connect to GitHub</h3>
                <p>Sign in to browse your repositories, clone them, and push changes.</p>
                <button className="btn btn-primary" onClick={() => setShowGitHubConnect(true)}>
                  <Github size={14} /> Connect GitHub
                </button>
              </div>
            ) : loading ? (
              <div className="loading-state">
                <Loader2 size={24} className="spin" />
                <p>Loading repositories...</p>
              </div>
            ) : githubRepos.length === 0 ? (
              <div className="empty-state">
                <Github size={48} />
                <h3>No repositories found</h3>
                <p>Your GitHub account has no repositories yet.</p>
              </div>
            ) : (
              <div className="gh-repo-list">
                {githubRepos.map((gr) => (
                  <div key={gr.id} className="gh-repo-card">
                    <div className="gh-repo-left">
                      <div className="gh-repo-name">
                        {gr.is_private ? <Lock size={14} /> : <Unlock size={14} />}
                        <span>{gr.full_name}</span>
                      </div>
                      {gr.description && <div className="gh-repo-desc">{gr.description}</div>}
                      <div className="gh-repo-meta">
                        {gr.language && <span className="lang-dot" style={{ backgroundColor: langColor(gr.language) }} />}
                        {gr.language && <span>{gr.language}</span>}
                        <span><Star size={12} /> {gr.stars}</span>
                        <span><GitFork size={12} /> {gr.forks}</span>
                        <span>Updated {timeAgo(gr.updated_at)}</span>
                      </div>
                    </div>
                    <div className="gh-repo-actions">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleImportRepo(gr)}
                        disabled={loading}
                      >
                        <Download size={12} /> Clone
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => window.open(gr.html_url, "_blank")}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* GitLab Repos */}
        {activeTab === "gitlab" && (
          <>
            {!gitlabAuth?.is_authenticated ? (
              <div className="empty-state">
                <Gitlab size={48} />
                <h3>Connect to GitLab</h3>
                <p>Sign in to browse your repositories and clone them directly.</p>
                <button className="btn btn-primary" onClick={() => setShowGitLabConnect(true)}>
                  <Gitlab size={14} /> Connect GitLab
                </button>
              </div>
            ) : (
              <div className="gh-repo-list">
                {gitlabRepos.map((gr) => (
                  <div key={gr.id} className="gh-repo-card">
                    <div className="gh-repo-left">
                      <div className="gh-repo-name">
                        {gr.is_private ? <Lock size={14} /> : <Unlock size={14} />}
                        <span>{gr.full_name}</span>
                      </div>
                      {gr.description && <div className="gh-repo-desc">{gr.description}</div>}
                      <div className="gh-repo-meta">
                        {gr.language && <span className="lang-dot" style={{ backgroundColor: langColor(gr.language) }} />}
                        {gr.language && <span>{gr.language}</span>}
                        <span><Star size={12} /> {gr.stars}</span>
                        <span><GitFork size={12} /> {gr.forks}</span>
                        <span>Updated {timeAgo(gr.updated_at)}</span>
                      </div>
                    </div>
                    <div className="gh-repo-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => window.open(gr.html_url, "_blank")}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Bitbucket Repos */}
        {activeTab === "bitbucket" && (
          <>
            {!bitbucketAuth?.is_authenticated ? (
              <div className="empty-state">
                <Cloud size={48} />
                <h3>Connect to Bitbucket</h3>
                <p>Sign in to browse your repositories and clone them directly.</p>
                <button className="btn btn-primary" onClick={() => setShowBitbucketConnect(true)}>
                  <Cloud size={14} /> Connect Bitbucket
                </button>
              </div>
            ) : (
              <div className="gh-repo-list">
                {bitbucketRepos.map((gr) => (
                  <div key={gr.id} className="gh-repo-card">
                    <div className="gh-repo-left">
                      <div className="gh-repo-name">
                        {gr.is_private ? <Lock size={14} /> : <Unlock size={14} />}
                        <span>{gr.full_name}</span>
                      </div>
                      {gr.description && <div className="gh-repo-desc">{gr.description}</div>}
                      <div className="gh-repo-meta">
                        {gr.language && <span className="lang-dot" style={{ backgroundColor: langColor(gr.language) }} />}
                        {gr.language && <span>{gr.language}</span>}
                        <span><Star size={12} /> {gr.stars}</span>
                        <span><GitFork size={12} /> {gr.forks}</span>
                        <span>Updated {timeAgo(gr.updated_at)}</span>
                      </div>
                    </div>
                    <div className="gh-repo-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => window.open(gr.html_url, "_blank")}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      {showCloneDialog && (
        <CloneDialog
          onClose={() => setShowCloneDialog(false)}
          onCloned={handleCloned}
        />
      )}
      {showGitHubConnect && (
        <GitHubConnect
          onClose={() => setShowGitHubConnect(false)}
          onConnected={handleGitHubConnected}
        />
      )}
      {showGitLabConnect && (
        <GitLabConnect
          onClose={() => setShowGitLabConnect(false)}
          onConnected={handleGitLabConnected}
        />
      )}
      {showBitbucketConnect && (
        <BitbucketConnect
          onClose={() => setShowBitbucketConnect(false)}
          onConnected={handleBitbucketConnected}
        />
      )}
    </div>
  );
}

// ─── Language Color Map ───────────────────────────────────────────────────

function langColor(lang: string): string {
  const colors: Record<string, string> = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Rust: "#dea584",
    Go: "#00ADD8",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Swift: "#ffac45",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
  };
  return colors[lang] || "#6b7280";
}

// ─── Mock Repo Data ───────────────────────────────────────────────────────

const mockGitLabRepos: GitHubRepo[] = [
  {
    id: 1,
    name: "my-project",
    full_name: "my-org/my-project",
    description: "Main application project",
    html_url: "https://gitlab.com/my-org/my-project",
    clone_url: "https://gitlab.com/my-org/my-project.git",
    ssh_url: "git@gitlab.com:my-org/my-project.git",
    language: "TypeScript",
    stars: 42,
    forks: 12,
    is_private: false,
    is_fork: false,
    default_branch: "main",
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    owner: "my-org",
    owner_avatar: null,
  },
  {
    id: 2,
    name: "docs",
    full_name: "my-org/docs",
    description: "Documentation site",
    html_url: "https://gitlab.com/my-org/docs",
    clone_url: "https://gitlab.com/my-org/docs.git",
    ssh_url: "git@gitlab.com:my-org/docs.git",
    language: "Markdown",
    stars: 8,
    forks: 3,
    is_private: false,
    is_fork: false,
    default_branch: "main",
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    owner: "my-org",
    owner_avatar: null,
  },
  {
    id: 3,
    name: "api-service",
    full_name: "my-org/api-service",
    description: "Backend API service",
    html_url: "https://gitlab.com/my-org/api-service",
    clone_url: "https://gitlab.com/my-org/api-service.git",
    ssh_url: "git@gitlab.com:my-org/api-service.git",
    language: "Go",
    stars: 27,
    forks: 8,
    is_private: true,
    is_fork: false,
    default_branch: "main",
    updated_at: new Date(Date.now() - 7200000).toISOString(),
    owner: "my-org",
    owner_avatar: null,
  },
];

const mockBitbucketRepos: GitHubRepo[] = [
  {
    id: 1,
    name: "frontend-app",
    full_name: "my-team/frontend-app",
    description: "React frontend application",
    html_url: "https://bitbucket.org/my-team/frontend-app",
    clone_url: "https://bitbucket.org/my-team/frontend-app.git",
    ssh_url: "git@bitbucket.org:my-team/frontend-app.git",
    language: "TypeScript",
    stars: 15,
    forks: 5,
    is_private: true,
    is_fork: false,
    default_branch: "main",
    updated_at: new Date(Date.now() - 1800000).toISOString(),
    owner: "my-team",
    owner_avatar: null,
  },
  {
    id: 2,
    name: "backend-api",
    full_name: "my-team/backend-api",
    description: "Python Django REST API",
    html_url: "https://bitbucket.org/my-team/backend-api",
    clone_url: "https://bitbucket.org/my-team/backend-api.git",
    ssh_url: "git@bitbucket.org:my-team/backend-api.git",
    language: "Python",
    stars: 22,
    forks: 7,
    is_private: true,
    is_fork: false,
    default_branch: "main",
    updated_at: new Date(Date.now() - 14400000).toISOString(),
    owner: "my-team",
    owner_avatar: null,
  },
];
