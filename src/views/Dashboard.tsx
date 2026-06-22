import { useState, useEffect, useRef } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  Terminal, Code, GitBranch, Globe, Server, Play, Square,
  Plus, RefreshCw, CheckCircle2, XCircle, FolderGit2,
  ExternalLink, Wrench, Activity, Zap, Wifi, WifiOff,
  Link2, Unlink, Shield, Monitor, Radio, Users,
} from "lucide-react";
import type { Service } from "../types";
import {
  getRelayStatus, getRelayPeers, sendRelaySignal, pollSignals,
  type RelayPeer, type RelayStatus,
} from "../relay-client";

/* ─── Remote Instance Types ────────────────────────── */
interface RemoteInstance {
  id: string;
  name: string;
  address: string;
  peerId: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  mode: "p2p-visible" | "p2p-anonymous" | "relay";
  latency: number;
  lastSeen: number;
  services: string[];
}

type OnlineMode = "local" | "p2p-visible" | "p2p-anonymous";

const REMOTE_STORAGE_KEY = "dweb-remote-instances";

function loadRemotes(): RemoteInstance[] {
  try {
    const raw = localStorage.getItem(REMOTE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRemotes(remotes: RemoteInstance[]) {
  try { localStorage.setItem(REMOTE_STORAGE_KEY, JSON.stringify(remotes)); } catch {}
}

/* ─── Quick ID generator ───────────────────────────── */
function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}



/* ─── Types ───────────────────────────────────────────────── */
interface RuntimeInfo {
  name: string;
  version: string;
  available: boolean;
  path: string;
}

const MOCK_RUNTIMES: RuntimeInfo[] = [
  { name: "Node.js", version: "v20.11.0", available: true, path: "C:\\Program Files\\nodejs\\node.exe" },
  { name: "Python", version: "3.12.1", available: true, path: "C:\\Python312\\python.exe" },
  { name: "Git", version: "2.43.0", available: true, path: "C:\\Program Files\\Git\\bin\\git.exe" },
  { name: "PHP", version: "8.3.2", available: false, path: "" },
  { name: "Java", version: "21.0.1", available: false, path: "" },
  { name: "Go", version: "1.22.0", available: false, path: "" },
  { name: "Rust", version: "1.77.0", available: false, path: "" },
  { name: "Docker", version: "", available: false, path: "" },
];

const MOCK_SERVICES: Service[] = [
  { name: "My Static Site", type: "Static Site", port: 8080, running: true, cpu: 2.1, memory: 45_000_000 },
  { name: "API Server", type: "Node.js API", port: 3001, running: false, cpu: 0, memory: 0 },
];

const SERVICE_TYPES = ["Static Site", "Node.js API", "Python Web App", "PHP Site", "Custom Command"];

/* ─── Runtime Icon ────────────────────────────────────────── */
function RuntimeIcon({ name }: { name: string }): React.ReactNode {
  const size = 20;
  switch (name) {
    case "Node.js":  return <Terminal size={size} />;
    case "Python":   return <Code size={size} />;
    case "Git":      return <GitBranch size={size} />;
    case "PHP":      return <Globe size={size} />;
    case "Java":     return <Server size={size} />;
    case "Go":       return <Terminal size={size} />;
    case "Rust":     return <Wrench size={size} />;
    case "Docker":   return <Server size={size} />;
    default:         return <Code size={size} />;
  }
}

/* ─── Runtime Card ────────────────────────────────────────── */
function RuntimeCard({ runtime }: { runtime: RuntimeInfo }) {
  return (
    <div
      className="stat-card"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          className="stat-icon"
          style={{ width: 36, height: 36, fontSize: 18, background: "rgba(59,130,246,0.1)", color: "var(--accent-blue)" }}
        >
          <RuntimeIcon name={runtime.name} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{runtime.name}</div>
          <span className="text-muted-sm">{runtime.version || "—"}</span>
        </div>
        {runtime.available ? (
          <CheckCircle2 size={16} color="var(--success)" />
        ) : (
          <XCircle size={16} color="var(--text-muted)" />
        )}
      </div>
      {runtime.path && (
        <div className="text-muted-sm" style={{ fontSize: 11, wordBreak: "break-all", display: "flex", alignItems: "center", gap: 4 }}>
          <FolderGit2 size={11} />
          {runtime.path}
        </div>
      )}
    </div>
  );
}

/* ─── Add Service Modal ───────────────────────────────────── */
function AddServiceModal({ onClose, onAdd }: { onClose: () => void; onAdd: (svc: Service) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(SERVICE_TYPES[0]);
  const [port, setPort] = useState("8080");
  const [dir, setDir] = useState("");

  const handleSubmit = () => {
    if (!name.trim() || !port.trim()) return;
    onAdd({
      name: name.trim(),
      type,
      port: parseInt(port, 10) || 8080,
      running: false,
      cpu: 0,
      memory: 0,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass" style={{ width: 420, maxWidth: "100%", padding: 24, borderRadius: "var(--radius-lg)" }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, fontWeight: 600 }}>Add Service</h3>

        <div className="provider-field">
          <label>Service Name</label>
          <input className="text-input wide" value={name} onChange={e => setName(e.target.value)} placeholder="My App" />
        </div>

        <div className="provider-field">
          <label>Service Type</label>
          <select className="select-input wide" value={type} onChange={e => setType(e.target.value)}>
            {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="provider-field">
          <label>Port Number</label>
          <input className="text-input" value={port} onChange={e => setPort(e.target.value)} placeholder="8080" style={{ width: 120 }} type="number" />
        </div>

        <div className="provider-field">
          <label>Directory Path</label>
          <div className="input-with-action">
            <input className="text-input wide" value={dir} onChange={e => setDir(e.target.value)} placeholder="C:\\projects\\my-app" />
            <button className="btn btn-secondary btn-sm" title="Browse"><FolderGit2 size={14} /></button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || !port.trim()}>
            <Plus size={14} /> Create Service
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ──────────────────────────────────────── */
export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingRuntimes, setLoadingRuntimes] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadServices = async () => {
    setLoadingServices(true);
    try {
      const result = await invoke<Service[]>("get_services");
      setServices(result.length > 0 ? result : MOCK_SERVICES);
    } catch {
      setServices(MOCK_SERVICES);
    } finally {
      setLoadingServices(false);
    }
  };

  const loadRuntimes = async () => {
    setLoadingRuntimes(true);
    try {
      const result = await invoke<RuntimeInfo[]>("detect_runtimes");
      setRuntimes(result.length > 0 ? result : MOCK_RUNTIMES);
    } catch {
      setRuntimes(MOCK_RUNTIMES);
    } finally {
      setLoadingRuntimes(false);
    }
  };

  useEffect(() => {
    loadServices();
    loadRuntimes();
  }, []);

  const handleAddService = (svc: Service) => {
    setServices(prev => [...prev, svc]);
  };

  const handleToggleService = async (name: string, running: boolean) => {
    try {
      if (running) {
        await invoke("stop_service", { name });
      } else {
        await invoke("start_service", { name });
      }
    } catch { /* ignore in browser mode */ }
    setServices(prev => prev.map(s => s.name === name ? { ...s, running: !s.running } : s));
  };

  /* ─── Remote Instances State ────────────────────────── */
  const [remotes, setRemotes] = useState<RemoteInstance[]>(() => loadRemotes());
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [onlineMode, setOnlineMode] = useState<OnlineMode>("local");
  const [peerCount, setPeerCount] = useState(0);
  const [relayStatus, setRelayStatus] = useState<RelayStatus | null>(null);
  const [discoveredPeers, setDiscoveredPeers] = useState<RelayPeer[]>([]);
  const [incomingSignals, setIncomingSignals] = useState<string[]>([]);
  const relayLoaded = useRef(false);

  // Fetch relay status + peer list periodically
  useEffect(() => {
    let mounted = true;

    const fetchRelayData = async () => {
      const [status, peers] = await Promise.all([
        getRelayStatus(),
        getRelayPeers(),
      ]);
      if (!mounted) return;
      setRelayStatus(status);
      setDiscoveredPeers(peers);
      if (status) setPeerCount(status.peersOnline);
      relayLoaded.current = true;
    };

    const fetchSignals = async () => {
      if (!mounted) return;
      const signals = await pollSignals();
      if (signals.length > 0) {
        setIncomingSignals(prev => [
          ...signals.map(s => `${s.fromPeerId}:${s.type}`),
          ...prev,
        ].slice(0, 20));
      }
    };

    fetchRelayData();
    const interval = setInterval(fetchRelayData, 15000);
    const sigInterval = setInterval(fetchSignals, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(sigInterval);
    };
  }, []);

  // Persist remotes to localStorage
  useEffect(() => {
    saveRemotes(remotes);
  }, [remotes]);

  const handleConnectRemote = async (relayPeer: RelayPeer) => {
    // Check if already added
    const existing = remotes.find(r => r.peerId === relayPeer.id);
    if (existing) {
      setRemotes(prev => prev.map(r =>
        r.id === existing.id ? { ...r, status: "connected" as const, lastSeen: Date.now() } : r
      ));
      return;
    }
    const newRemote: RemoteInstance = {
      id: uid(),
      name: relayPeer.hostname || `Remote (${relayPeer.id.slice(0, 12)}...)`,
      address: `${relayPeer.address}:${relayPeer.port}`,
      peerId: relayPeer.id,
      status: "connected",
      mode: relayPeer.mode,
      latency: Math.floor(Math.random() * 50) + 5,
      lastSeen: Date.now(),
      services: relayPeer.services || [],
    };
    setRemotes(prev => [...prev, newRemote]);
    // Send an initial signal to the peer
    await sendRelaySignal(relayPeer.id, "offer");
  };

  const handleConnectDirect = (address: string, name: string) => {
    const existing = remotes.find(r => r.address === address);
    if (existing) {
      setRemotes(prev => prev.map(r =>
        r.id === existing.id ? { ...r, status: "connected" as const, lastSeen: Date.now() } : r
      ));
      return;
    }
    const newRemote: RemoteInstance = {
      id: uid(),
      name: name || `Remote (${address})`,
      address,
      peerId: `direct_${uid()}`,
      status: "connected",
      mode: onlineMode === "local" ? "p2p-visible" : onlineMode,
      latency: Math.floor(Math.random() * 50) + 5,
      lastSeen: Date.now(),
      services: [],
    };
    setRemotes(prev => [...prev, newRemote]);
  };

  const handleDisconnectRemote = (id: string) => {
    setRemotes(prev => prev.map(r =>
      r.id === id ? { ...r, status: "disconnected" as const, latency: 0 } : r
    ));
  };

  const handleRemoveRemote = (id: string) => {
    setRemotes(prev => prev.filter(r => r.id !== id));
  };

  const modeColor: Record<OnlineMode, string> = {
    local: "#6b7280",
    "p2p-visible": "#22c55e",
    "p2p-anonymous": "#8b5cf6",
  };
  const modeIcon: Record<OnlineMode, React.ReactNode> = {
    local: <WifiOff size={14} />,
    "p2p-visible": <Wifi size={14} />,
    "p2p-anonymous": <Shield size={14} />,
  };

  /* ─── Connect to Remote Modal ────────────────────────────── */
  function ConnectModal({ onClose }: { onClose: () => void }) {
    const [addr, setAddr] = useState("");
    const [label, setLabel] = useState("");
    const [mode, setLocalMode] = useState<"direct" | "relay">("direct");
    const [connecting, setConnecting] = useState(false);
    const [localPeers, setLocalPeers] = useState<RelayPeer[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
      getRelayPeers().then(peers => setLocalPeers(peers));
    }, []);

    const handleConnect = async () => {
      if (!addr.trim()) return;
      setConnecting(true);
      if (mode === "relay") {
        // Find peer by ID or address
        const peer = localPeers.find(p =>
          p.id === addr.trim() || `${p.address}:${p.port}` === addr.trim()
        );
        if (peer) {
          await handleConnectRemote(peer);
        } else {
          // Send signal to arbitrary peer ID
          await sendRelaySignal(addr.trim(), "offer");
          handleConnectDirect(addr.trim(), label.trim());
        }
      } else {
        handleConnectDirect(addr.trim(), label.trim());
      }
      setConnecting(false);
      onClose();
    };

    const filteredPeers = localPeers.filter(p =>
      !searchTerm || p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address.includes(searchTerm)
    );

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal glass" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-header">
            <h3><Link2 size={16} /> Connect to Remote Instance</h3>
            <button className="btn btn-icon" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="text-muted-sm" style={{ fontSize: 12 }}>
              Connect to another dweb instance on your network or the internet.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className={`btn btn-sm ${mode === "direct" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setLocalMode("direct")}
              >
                <Wifi size={14} /> Direct P2P
              </button>
              <button
                className={`btn btn-sm ${mode === "relay" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setLocalMode("relay")}
              >
                <Globe size={14} /> Via Relay
              </button>
            </div>

            {mode === "relay" && relayStatus?.connected && (
              <div className="glass-sm" style={{
                padding: "8px 12px", borderRadius: "var(--radius-sm)",
                fontSize: 12, color: "var(--text-muted)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <Radio size={12} color="#22c55e" />
                Connected to relay at <strong>{relayStatus.relayAddress}</strong>
                {" · "}{relayStatus.peersOnline} peer(s) online
              </div>
            )}

            {mode === "relay" && !relayStatus?.connected && (
              <div className="glass-sm" style={{
                padding: "8px 12px", borderRadius: "var(--radius-sm)",
                fontSize: 12, color: "#eab308", border: "1px solid rgba(234,179,8,0.3)",
              }}>
                ⚠ Relay not connected. Peers will be discovered via direct IP only.
              </div>
            )}

            {/* Relay peer browser */}
            {mode === "relay" && localPeers.length > 0 && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "block" }}>
                  Discovered Peers
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Filter peers..."
                  className="text-input"
                  style={{ width: "100%", marginBottom: 6, fontSize: 12, padding: "6px 10px" }}
                />
                <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {filteredPeers.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleConnectRemote(p)}
                      className="glass-sm"
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: "var(--radius-sm)",
                        cursor: "pointer", fontSize: 12,
                        transition: "background 0.1s",
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = "rgba(59,130,246,0.1)")}
                      onMouseOut={e => (e.currentTarget.style.background = "")}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{p.hostname || p.id.slice(0, 16)}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {p.address}:{p.port} · {p.mode} · {p.platform}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: p.services?.length ? "var(--text-muted)" : "#6b7280" }}>
                        {p.services?.length || 0} services
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual address input */}
            <div className="selector-group">
              <label>{mode === "relay" ? "Or enter Peer ID / Address" : "Address"}</label>
              <input
                type="text"
                value={addr}
                onChange={e => setAddr(e.target.value)}
                placeholder={mode === "direct" ? "IP:Port (e.g. 192.168.1.20:49737)" : "Peer ID (e.g. dweb-rex)"}
                className="select-input"
                style={{ width: "100%" }}
              />
            </div>
            <div className="selector-group">
              <label>Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder='e.g. "Office Server"'
                className="select-input"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConnect} disabled={connecting || (!addr.trim() && mode === "direct")}>
                {connecting ? "Connecting..." : <><Link2 size={14} /> Connect</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Network Section ────────────────────────────────────── */
  const networkSection = (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={16} /> Network
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Relay indicator */}
          {relayStatus && (
            <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: relayStatus.connected ? "#22c55e" : "#6b7280" }}>
              <Radio size={12} />
              {relayStatus.connected ? "Relay: " + relayStatus.peersOnline + " peers" : "No relay"}
            </span>
          )}
          {/* Online Mode Switcher */}
          <div className="glass-sm" style={{ display: "flex", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
            {(["local", "p2p-visible", "p2p-anonymous"] as OnlineMode[]).map(m => (
              <button
                key={m}
                onClick={() => setOnlineMode(m)}
                style={{
                  padding: "5px 12px",
                  border: "none",
                  background: onlineMode === m ? modeColor[m] : "transparent",
                  color: onlineMode === m ? "#fff" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: onlineMode === m ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "background 0.15s",
                }}
                title={m === "local" ? "Local Only" : m === "p2p-visible" ? "P2P Visible" : "P2P Anonymous"}
              >
                {modeIcon[m]}
                {m === "local" ? "Local" : m === "p2p-visible" ? "Visible" : "Anonymous"}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowConnectModal(true)}>
            <Link2 size={12} /> Connect
          </button>
        </div>
      </div>

      {/* Network status bar */}
      <div className="glass-sm" style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "8px 14px", borderRadius: "var(--radius-sm)",
        marginBottom: 10, fontSize: 12,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: onlineMode === "local" ? "var(--text-muted)" : "#22c55e" }}>
          {onlineMode === "local" ? <WifiOff size={14} /> : <Wifi size={14} />}
          Mode: <strong>{onlineMode === "local" ? "Local Only" : onlineMode === "p2p-visible" ? "P2P Visible" : "P2P Anonymous"}</strong>
        </span>
        <span style={{ color: "var(--text-muted)" }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Monitor size={14} />
          Peers: <strong style={{ color: peerCount > 0 ? "#22c55e" : "var(--text-muted)" }}>{peerCount}</strong>
        </span>
        <span style={{ color: "var(--text-muted)" }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: relayStatus?.connected ? "#22c55e" : "var(--text-muted)" }}>
          <Radio size={14} />
          Relay: <strong>{relayStatus?.connected ? "Connected" : "Offline"}</strong>
        </span>
        {incomingSignals.length > 0 && (
          <>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#8b5cf6" }}>
              <Users size={14} />
              Signals: <strong>{incomingSignals.length}</strong>
            </span>
          </>
        )}
      </div>

      {/* Discovered peers from relay */}
      {discoveredPeers.length > 0 && (
        <div className="glass-sm" style={{
          padding: "10px 14px", borderRadius: "var(--radius-sm)",
          marginBottom: 10, fontSize: 11,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <Radio size={12} /> Discovered Peers ({discoveredPeers.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {discoveredPeers.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{p.hostname || p.id.slice(0, 16)}</span>
                <span style={{ color: "var(--text-muted)" }}>{p.address}:{p.port}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{p.mode}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{p.platform}</span>
                {p.services?.length > 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: "auto" }}>
                    {p.services.join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Remotes List */}
      {remotes.length === 0 ? (
        <div className="glass-sm" style={{
          padding: "20px", textAlign: "center", borderRadius: "var(--radius)", color: "var(--text-muted)", fontSize: 13,
        }}>
          <Link2 size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p>No remote instances connected.</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Click <strong>Connect</strong> to discover and connect to peers.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {remotes.map(r => (
            <div key={r.id} className="glass-sm" style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: "var(--radius-sm)",
              border: r.status === "connected" ? "1px solid rgba(34,197,94,0.2)" : "1px solid transparent",
            }}>
              {/* Status dot */}
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: r.status === "connected" ? "#22c55e"
                  : r.status === "connecting" ? "#eab308"
                  : r.status === "error" ? "#ef4444" : "#6b7280",
                boxShadow: r.status === "connected" ? "0 0 6px rgba(34,197,94,0.4)" : "none",
              }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  {r.name}
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 8,
                    background: r.mode === "p2p-visible" ? "rgba(34,197,94,0.15)" : "rgba(139,92,246,0.15)",
                    color: r.mode === "p2p-visible" ? "#22c55e" : "#8b5cf6",
                    fontWeight: 500,
                  }}>
                    {r.mode === "p2p-visible" ? "Visible" : r.mode === "p2p-anonymous" ? "Anonymous" : "Relay"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span>{r.address}</span>
                  {r.status === "connected" && <span style={{ color: "#22c55e" }}>● {r.latency}ms</span>}
                  {r.status === "disconnected" && <span style={{ color: "#6b7280" }}>Offline</span>}
                  {r.services.length > 0 && (
                    <span style={{ color: "var(--text-muted)" }}>
                      — {r.services.slice(0, 2).join(", ")}{r.services.length > 2 ? ` +${r.services.length - 2}` : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {r.status === "disconnected" ? (
                  <button className="btn btn-icon btn-sm" onClick={() => handleConnectDirect(r.address, r.name)}
                    title="Reconnect" style={{ color: "#22c55e" }}>
                    <Link2 size={14} />
                  </button>
                ) : (
                  <button className="btn btn-icon btn-sm" onClick={() => handleDisconnectRemote(r.id)}
                    title="Disconnect" style={{ color: "#ef4444" }}>
                    <Unlink size={14} />
                  </button>
                )}
                <button className="btn btn-icon btn-sm" onClick={() => handleRemoveRemote(r.id)}
                  title="Remove" style={{ color: "var(--text-muted)" }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ─── Runtime Detection Section ──────────────────────────── */
  const runtimeSection = (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Wrench size={16} /> Runtime Detection
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={loadRuntimes}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {loadingRuntimes ? (
        <div className="loading-pulse"><span /></div>
      ) : runtimes.length === 0 ? (
        <div className="empty-state-inline glass" style={{ borderRadius: "var(--radius)" }}>
          <h4>No runtimes detected</h4>
          <p className="text-muted-sm">Run the dweb desktop app to detect system runtimes.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {runtimes.map(r => <RuntimeCard key={r.name} runtime={r} />)}
        </div>
      )}
    </div>
  );

  /* ─── Services Tab ───────────────────────────────────────── */
  const servicesTab = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Server size={16} /> Your Services
        </h4>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add Service
        </button>
      </div>

      {loadingServices ? (
        <div className="loading-pulse"><span /></div>
      ) : services.length === 0 ? (
        <div className="empty-state glass">
          <Zap size={48} className="empty-icon" />
          <h3>No services yet</h3>
          <p>Add your first service to get started.</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={14} /> Add Service
            </button>
          </div>
        </div>
      ) : (
        <div className="service-grid">
          {services.map((svc) => (
            <div key={svc.name} className={`service-card glass ${svc.running ? "running" : "stopped"}`}>
              <div className="service-indicator">
                <span className={`indicator-dot ${svc.running ? "live" : "dead"}`} />
              </div>
              <div className="service-info">
                <div className="service-name-row">
                  <h4>{svc.name}</h4>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                    {svc.type}
                  </span>
                  <span className={`service-status-badge ${svc.running ? "running" : "stopped"}`}>
                    {svc.running ? "Running" : "Stopped"}
                  </span>
                </div>
                <div className="service-meta-row">
                  <span className="meta-item"><Server size={12} /> Port {svc.port}</span>
                  {svc.running && (
                    <>
                      <span className="meta-item"><Activity size={12} /> CPU: {svc.cpu.toFixed(1)}%</span>
                      <span className="meta-item"><Zap size={12} /> RAM: {(svc.memory / 1024 / 1024).toFixed(0)}MB</span>
                    </>
                  )}
                </div>
                {svc.running && (
                  <div className="service-usage-bar">
                    <div className="usage-track">
                      <div className="usage-fill cpu" style={{ width: `${Math.min(svc.cpu, 100)}%` }} />
                    </div>
                    <div className="usage-track">
                      <div className="usage-fill mem" style={{ width: `${Math.min(svc.memory / (1024 * 1024 * 10) * 100, 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="service-actions">
                {svc.running ? (
                  <>
                    <button className="btn btn-sm btn-outline" title="Open in Browser">
                      <ExternalLink size={14} />
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleToggleService(svc.name, true)}>
                      <Square size={14} />
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-success" onClick={() => handleToggleService(svc.name, false)}>
                    <Play size={14} /> Start
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ─── Render ────────────────────────────────────────────── */
  return (
    <div className="view-container dashboard">
      <div className="view-header">
        <div>
          <h2>Services & Runtimes</h2>
          <p className="text-muted-sm">Manage your services and detected system runtimes</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => { loadServices(); loadRuntimes(); }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {networkSection}

      {runtimeSection}

      <div className="panel-tabs">
        <button className="panel-tab active">
          <Server size={16} /> Services
        </button>
      </div>

      <div className="panel-content glass">
        {servicesTab}
      </div>

      {showAddModal && (
        <AddServiceModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddService}
        />
      )}

      {showConnectModal && (
        <ConnectModal onClose={() => setShowConnectModal(false)} />
      )}
    </div>
  );
}
