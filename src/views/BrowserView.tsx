import { useState, useCallback, useEffect, useRef } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  ArrowLeft, ArrowRight, RefreshCw, Shield,
  ExternalLink, Home, X, Info, Search,
} from "lucide-react";
import type { DomainRecord } from "../types";

interface BrowserViewProps {
  initialUrl?: string;
  navId?: number;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isDwebUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("dweb://");
}

function dwebDomain(url: string): string {
  return url.replace(/^dweb:\/\//i, "").replace(/\.dweb$/i, "");
}

export default function BrowserView({ initialUrl, navId }: BrowserViewProps) {
  const [url, setUrl] = useState(() => {
    try { return localStorage.getItem("dweb_browser_url") || initialUrl || ""; } catch { return initialUrl || ""; }
  });
  const [loading, setLoading] = useState(false);
  const [contentHtml, setContentHtml] = useState("");
  const [resolvedDomain, setResolvedDomain] = useState<DomainRecord | null>(null);
  const [title, setTitle] = useState("dweb Browser");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showInfo, setShowInfo] = useState(false);

  // Persist URL across view switches
  useEffect(() => {
    if (url) { try { localStorage.setItem("dweb_browser_url", url); } catch {} }
  }, [url]);

  const navigate = useCallback(async (targetUrl?: string) => {
    const raw = (targetUrl || url).trim();
    if (!raw) {
      setTitle("dweb Browser");
      setContentHtml("");
      setResolvedDomain(null);
      setLoading(false);
      return;
    }

    // For http/https: open in system browser, not here
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      window.open(raw, "_blank");
      return;
    }

    if (!isDwebUrl(raw)) {
      // Treat as dweb:// search — prefix it
      const prefixed = `dweb://${raw.replace(/\.dweb$/, "")}.dweb`;
      return navigate(prefixed);
    }

    setUrl(raw);
    setLoading(true);
    setContentHtml("");
    setResolvedDomain(null);

    try {
      // Try Tauri IPC first, fall back to HTTP API
      let info: any = null;
      try {
        info = await invoke<DomainRecord>("resolve_domain", { domain: dwebDomain(raw) });
      } catch {
        try {
          const res = await fetch(`/api/domain/resolve?name=${encodeURIComponent(dwebDomain(raw))}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === "ok" && data.record) {
              info = data.record;
              info.address = data.address || (info.address ? String(info.address).split(":")[0] : info.address);
              info.port = data.port || info.port;
              info.path = data.path || "/";
              info.resolvedUrl = data.url || null;
              info.peerId = data.peerId || null;
              info.via = data.via || null;
            }
          }
        } catch {}
      }

      if (info) {
        setResolvedDomain(info);
        const address = info.address || "";
        const port = info.port || "";
        const path = info.path || "/";
        // A direct P2P resolution has no LAN address (deliberately — see
        // resolveDomainAcrossPeers on the backend) but still has a port
        // and peerId, which is enough to fetch over the data channel.
        // Fall back to a synthetic placeholder URL only for display and
        // for path-extraction on the backend; it is never actually
        // dialed by the frontend itself.
        const resolvedUrl = info.resolvedUrl || (address && port ? `http://${address}:${port}${path}` : null);
        const displayUrl = resolvedUrl || (info.peerId ? `dweb://${dwebDomain(raw)}${path}` : null);
        const canAttemptFetch = !!(resolvedUrl || (info.peerId && port));

        if (canAttemptFetch) {
          try {
            const fetchTargetUrl = resolvedUrl || `http://peer${path}`;
            const params = new URLSearchParams({ url: fetchTargetUrl });
            if (info.peerId) params.set("peerId", info.peerId);
            if (port) params.set("port", String(port));
            const proxyRes = await fetch(`/api/proxy/fetch?${params.toString()}`);
            if (proxyRes.ok) {
              const html = await proxyRes.text();
              setContentHtml(`<base href="${escapeHtml(displayUrl || "")}/">${html}`);
              setTitle(`${dwebDomain(raw)}.dweb`);
            } else {
              // Proxy failed — show resolved info
              setContentHtml(`<div class="dweb-page">
                <div class="dweb-page-header">
                  <h2>${escapeHtml(dwebDomain(raw))}.dweb</h2>
                  <span class="dweb-status-badge active">Resolved</span>
                </div>
                <div class="dweb-meta glass">
                  <div class="meta-row"><span>Domain:</span><code>${escapeHtml(dwebDomain(raw))}.dweb</code></div>
                  ${info.owner_key ? `<div class="meta-row"><span>Owner:</span><code>${escapeHtml(info.owner_key)}</code></div>` : ""}
                  ${address ? `<div class="meta-row"><span>Address:</span><code>${escapeHtml(address)}:${escapeHtml(String(port))}</code></div>` : `<div class="meta-row"><span>Peer:</span><code>${escapeHtml(info.peerId || "")}</code></div>`}
                  <div class="meta-row"><span>Path:</span><code>${escapeHtml(path)}</code></div>
                  ${displayUrl ? `<div class="meta-row"><span>URL:</span><code>${escapeHtml(displayUrl)}</code></div>` : ""}
                </div>
                <p>Content proxying returned HTTP ${proxyRes.status}. The peer may be offline or unreachable right now.</p>
              </div>`);
              setTitle(`${dwebDomain(raw)}.dweb`);
            }
          } catch {
            setContentHtml(`<div class="dweb-page">
              <div class="dweb-page-header">
                <h2>${escapeHtml(dwebDomain(raw))}.dweb</h2>
                <span class="dweb-status-badge active">Resolved</span>
              </div>
              <div class="dweb-meta glass">
                <div class="meta-row"><span>Domain:</span><code>${escapeHtml(dwebDomain(raw))}.dweb</code></div>
                ${address ? `<div class="meta-row"><span>Address:</span><code>${escapeHtml(address)}:${escapeHtml(String(port))}</code></div>` : `<div class="meta-row"><span>Peer:</span><code>${escapeHtml(info.peerId || "")}</code></div>`}
                <div class="meta-row"><span>Path:</span><code>${escapeHtml(path)}</code></div>
              </div>
              <p>Cannot reach this peer right now.</p>
            </div>`);
            setTitle(`${dwebDomain(raw)}.dweb`);
          }
        } else {
          setContentHtml(`<div class="dweb-page">            <div class="dweb-page-header"><h2>${escapeHtml(dwebDomain(raw))}.dweb</h2></div>
            <p>Domain resolved but no active host found.</p>
            <p class="text-muted">The owner may be offline. Try again later.</p>
          </div>`);
          setTitle(`${dwebDomain(raw)}.dweb`);
        }
      } else {
        setContentHtml(`<div class="dweb-page">
          <div class="dweb-error-card glass">
            <h3>⚠️ Domain Not Found</h3>
            <p>"${escapeHtml(dwebDomain(raw))}.dweb" could not be resolved on this instance or any connected peer.</p>
            <div class="dweb-recommendations">
              <h4>Try this:</h4>
              <ul>
                <li><strong>Check the Domains tab</strong> — register a new .dweb domain</li>
                <li><strong>Connect to peers</strong> — use the P2P Connections panel</li>
                <li><strong>Verify spelling</strong> — domain names use lowercase letters, numbers, and hyphens</li>
              </ul>
            </div>
          </div>
        </div>`);
        setTitle(dwebDomain(raw));
      }
    } catch (e) {
      setContentHtml(`<div class="dweb-page error">
        <h3>Navigation Failed</h3>
        <p>${escapeHtml(String(e))}</p>
        <p class="text-muted">The request could not be completed. Check the URL and try again.</p>
      </div>`);
    } finally {
      setLoading(false);
      setHistory(prev => [...prev.slice(0, historyIndex + 1), raw]);
      setHistoryIndex(prev => prev + 1);
    }
  }, [url, historyIndex]);

  // Navigate to initialUrl from Dashboard/Domains
  const initialHandled = useRef(false);
  useEffect(() => {
    if (!initialUrl) return;
    if (initialHandled.current) return;
    initialHandled.current = true;
    const t = setTimeout(() => navigate(initialUrl), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl, navId]);

  const goBack = () => {
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    const prevUrl = history[newIdx];
    setHistoryIndex(newIdx);
    setUrl(prevUrl);
    // Navigate without updating history again
    setTimeout(() => {
      setLoading(true);
      setContentHtml("");
      setResolvedDomain(null);
      navigate(prevUrl);
    }, 0);
  };

  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    const nextUrl = history[newIdx];
    setHistoryIndex(newIdx);
    setUrl(nextUrl);
    setTimeout(() => {
      setLoading(true);
      setContentHtml("");
      setResolvedDomain(null);
      navigate(nextUrl);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") navigate();
  };

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  return (
    <div className="view-container browser-view" style={{ padding: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ─── Toolbar ──────────────────────────────────────── */}
      <div className="browser-toolbar" style={{ padding: "6px 8px", flexShrink: 0 }}>
        <div className="toolbar-left">
          <button className="btn btn-icon" disabled={!canGoBack} onClick={goBack} title="Back">
            <ArrowLeft size={16} />
          </button>
          <button className="btn btn-icon" disabled={!canGoForward} onClick={goForward} title="Forward">
            <ArrowRight size={16} />
          </button>
          <button className="btn btn-icon" onClick={() => navigate()} title="Refresh">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button className="btn btn-icon" title="Home" onClick={() => {
            setUrl("");
            setContentHtml("");
            setResolvedDomain(null);
            setTitle("dweb Browser");
            setLoading(false);
            setHistory([]);
            setHistoryIndex(-1);
          }}>
            <Home size={16} />
          </button>
        </div>

        {/* Address bar */}
        <div className="url-bar">
          <div className="url-scheme-icon">
            {isDwebUrl(url) ? <Shield size={14} /> : <Search size={14} />}
          </div>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a dweb:// URL (e.g. dweb://my-site.dweb)"
            className="url-input"
            style={{ border: "none", flex: 1, outline: "none" }}
          />
          {resolvedDomain && (
            <div className="url-security" title="P2P resolved">
              <Shield size={12} />
              <span>P2P</span>
            </div>
          )}
        </div>

        <div className="toolbar-right">
          <button className="btn btn-icon" onClick={() => setShowInfo(!showInfo)} title="Domain info">
            <Info size={16} />
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              if (isDwebUrl(url)) {
                // For dweb:// URLs, try to construct the resolved URL
                navigate();
              } else if (url) {
                window.open(url, "_blank");
              } else {
                window.open(window.location.origin, "_blank");
              }
            }}
            title={url ? "Open in system browser" : "Open dweb in system browser"}
            style={{ fontWeight: 500, gap: 4 }}
          >
            <ExternalLink size={14} />
            <span>Browser</span>
          </button>
        </div>
      </div>

      {/* ─── Domain Info Panel ─────────────────────────────── */}
      {showInfo && resolvedDomain && (
        <div className="security-info-panel glass" style={{ margin: "0 8px 8px" }}>
          <div className="security-info-header">
            <Shield size={16} />
            <h4>Domain Info — {resolvedDomain.name}.dweb</h4>
            <button className="btn btn-icon btn-xs" onClick={() => setShowInfo(false)}><X size={12} /></button>
          </div>
          <div className="security-info-grid">
            <div className="security-item">
              <span className="security-label">Domain</span>
              <code className="security-value">{resolvedDomain.name}.dweb</code>
            </div>
            {resolvedDomain.owner_key && (
              <div className="security-item">
                <span className="security-label">Owner</span>
                <code className="security-value">{resolvedDomain.owner_key.slice(0, 16)}…</code>
              </div>
            )}
            {resolvedDomain.address && (
              <div className="security-item">
                <span className="security-label">Address</span>
                <code className="security-value">{resolvedDomain.address}:{resolvedDomain.port || 80}</code>
              </div>
            )}
            {resolvedDomain.path && (
              <div className="security-item">
                <span className="security-label">Path</span>
                <code className="security-value">{resolvedDomain.path}</code>
              </div>
            )}
            {resolvedDomain.expires && (
              <div className="security-item">
                <span className="security-label">Expires</span>
                <span className="security-value">{new Date(resolvedDomain.expires).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Content Area ─────────────────────────────────── */}
      <div className="browser-content" style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div className="loading-state">
            <div className="loader-spinner" />
            <p>Resolving via DHT…</p>
          </div>
        ) : !url ? (
          /* Welcome / empty state */
          <div className="dweb-welcome" style={{
            textAlign: "center", padding: "48px 24px", overflow: "auto",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            <Shield size={48} style={{ color: "var(--accent-blue)", opacity: 0.4 }} />
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>dweb Browser</h2>
            <p style={{ color: "var(--text-muted)", maxWidth: 400, lineHeight: 1.6, fontSize: 14 }}>
              Enter a <strong>dweb://</strong> URL above to browse decentralized sites hosted on the P2P network.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span className="badge badge-blue">P2P</span>
              <span className="badge badge-green">Encrypted</span>
              <span className="badge badge-purple">Decentralized</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              For regular websites, use <strong>Browser</strong> button to open in your system browser.
            </p>
          </div>
        ) : contentHtml ? (
          <iframe
            className="sandboxed-frame"
            sandbox="allow-scripts"
            srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none';">
  <base href="dweb://${resolvedDomain?.name || 'domain'}.dweb/">
</head>
<body>${contentHtml}</body>
</html>`}
            title={resolvedDomain?.name || "dweb:// page"}
            style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
          />
        ) : (
          /* Content without proxy (resolved info) */
          <div
            className="browser-render"
            style={{ flex: 1, overflow: "auto", padding: 20 }}
            dangerouslySetInnerHTML={{
              __html: `<div class="dweb-page">
                <div class="dweb-page-header">
                  <h2>${escapeHtml(title)}</h2>
                  ${resolvedDomain ? '<span class="dweb-status-badge active">Resolved</span>' : ""}
                </div>
                <p>Enter a dweb:// URL in the address bar to browse.</p>
              </div>`,
            }}
          />
        )}
      </div>
    </div>
  );
}
