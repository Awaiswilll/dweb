import { useState, useEffect, useCallback } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import { useNotifications } from "../components/Notifications";
import {
  Globe, RefreshCw, Users, Server, Zap, Wifi, WifiOff,
  Clock, Activity, ArrowUpRight, ArrowDownLeft, Info,
} from "lucide-react";
import type { P2PNetworkStatus, P2PPeer } from "../types";

const API_BASE = "";

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export default function P2PDashboard() {
  const { addNotification } = useNotifications();
  const [status, setStatus] = useState<P2PNetworkStatus | null>(null);
  const [peers, setPeers] = useState<P2PPeer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [peerCount, setPeerCount] = useState(0);
  const [bandwidthUp] = useState("0 B/s");
  const [bandwidthDown] = useState("0 B/s");

  const fetchData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);

    const [statusData, discoverData] = await Promise.all([
      fetchApi<P2PNetworkStatus>("/dweb-status"),
      fetchApi<{ peers: P2PPeer[]; count: number }>("/discover"),
    ]);

    if (statusData) setStatus(statusData);
    if (discoverData) {
      setPeers(discoverData.peers || []);
      setPeerCount(discoverData.count || 0);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchData(), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const registerPeer = useCallback(async () => {
    try {
      const res = await fetch(`/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `peer-${Date.now()}`,
          address: `${window.location.hostname}:${window.location.port}`,
          publicKey: "auto-registered",
        }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        addNotification({ type: "success", title: "Peer Registered", message: `Peer ID: ${data.peerId}` });
        fetchData();
      }
    } catch (e) {
      addNotification({ type: "error", title: "Registration Failed", message: String(e) });
    }
  }, [addNotification, fetchData]);

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (loading && !status) {
    return (
      <div className="view-container">
        <div className="view-header"><h2>P2P Network</h2></div>
        <div className="loading-state"><RefreshCw size={24} className="spin" /><p>Loading network status...</p></div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>P2P Network</h2>
          <p className="text-muted-sm">Real-time peer-to-peer network status and connected peers</p>
        </div>
        <div className="header-actions" style={{ gap: 8 }}>
          <label className="toggle" title="Auto-refresh every 10s">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <button className="btn btn-secondary" onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={registerPeer}>
            <Wifi size={14} /> Register Peer
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="p2p-grid" style={{ marginBottom: 20 }}>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Users size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Peers Online
          </div>
          <div className="p2p-stat-value">{peerCount}</div>
          <div className="p2p-stat-sub">Registered on this relay</div>
        </div>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Activity size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Uptime
          </div>
          <div className="p2p-stat-value">{status ? formatUptime(status.uptime) : "—"}</div>
          <div className="p2p-stat-sub">Server running since last start</div>
        </div>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Server size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Services
          </div>
          <div className="p2p-stat-value">{(status?.services || []).length}</div>
          <div className="p2p-stat-sub">{(status?.services || []).join(", ")}</div>
        </div>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Wifi size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Relay Status
          </div>
          <div className="p2p-stat-value" style={{ color: status?.relayConnected ? "#22c55e" : "#6b7280" }}>
            {status?.relayConnected ? "Connected" : "Standalone"}
          </div>
          <div className="p2p-stat-sub">
            {status?.upstreamRelay ? `Upstream: ${status.upstreamRelay}` : "This node is the relay"}
          </div>
        </div>
      </div>

      {/* Network Info */}
      <div className="settings-section">
        <div className="section-header-actions">
          <h3>Network Information</h3>
        </div>
        <div className="p2p-grid">
          <div className="setting-row" style={{ gridColumn: "1 / -1" }}>
            <div className="setting-info">
              <label>Peer ID</label>
              <span className="text-muted-sm">{status?.peerId || "—"}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label>Web IDE Port</label>
              <span className="text-muted-sm">{status?.port || "—"}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label>Relay Port</label>
              <span className="text-muted-sm">{status?.relayPort || "—"}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label>Mode</label>
              <span className="text-muted-sm">{status?.mode || "—"}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label>Local IPs</label>
              <span className="text-muted-sm">{(status?.localIPs || []).join(", ")}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label>Platform</label>
              <span className="text-muted-sm">{status?.hostname || "—"} (Linux)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Peers */}
      <div className="settings-section">
        <div className="section-header-actions">
          <h3>Peers on Network ({peers.length})</h3>
        </div>
        {peers.length === 0 ? (
          <div className="glass-sm" style={{ padding: 24, textAlign: "center" }}>
            <WifiOff size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p className="text-muted-sm">No peers connected. Click "Register Peer" to add a test peer.</p>
            <p className="text-muted-sm" style={{ marginTop: 4, fontSize: 11 }}>
              Install dweb on another machine and point it to this relay at port {status?.relayPort || 49746}
            </p>
          </div>
        ) : (
          <div className="p2p-peer-list">
            {peers.map(peer => (
              <div key={peer.id} className="p2p-peer-card">
                <div className={`p2p-peer-status ${peer.connected ? "online" : "offline"}`} />
                <div className="p2p-peer-info">
                  <div className="p2p-peer-name">{peer.id}</div>
                  <div className="p2p-peer-detail">
                    {peer.address} — {peer.platform} — v{peer.version}
                  </div>
                </div>
                <div className="p2p-peer-latency">
                  {peer.latency ? `${peer.latency}ms` : "—"}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {peer.services?.map(s => (
                    <span key={s} className="nav-badge" style={{ fontSize: 9 }}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API Endpoints Reference */}
      <div className="settings-section">
        <div className="section-header-actions">
          <h3>P2P API Endpoints</h3>
        </div>
        <div className="glass-sm" style={{ padding: 16 }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Endpoint</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Method</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["/ping", "GET", "Health check"],
                ["/status", "GET", "Full instance status"],
                ["/register", "POST", "Register a peer"],
                ["/discover", "GET", "Discover online peers"],
                ["/signal", "POST", "WebRTC signaling"],
                ["/dweb-status", "GET", "Instance health"],
                ["/collab/services", "GET", "Hosted services"],
                ["/collab/sessions", "GET", "Shared sessions"],
              ].map(([ep, method, desc]) => (
                <tr key={ep} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{ep}</td>
                  <td style={{ padding: "6px 8px" }}><span className="nav-badge">{method}</span></td>
                  <td style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
