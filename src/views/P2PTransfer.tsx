import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Upload, Download, File, Users, Server,
  Wifi, HardDrive, Clock,
} from "lucide-react";
import type { P2PPeer } from "../types";

/* ─── Helpers ────────────────────────────────────────────── */

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function truncateId(id: string): string {
  if (!id || id.length <= 12) return id || "—";
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(ts: string | number): string {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ─── Types ──────────────────────────────────────────────── */

interface DwebStatus {
  peerId: string;
  port: number;
  hostname: string;
  peersOnline: number;
  [key: string]: unknown;
}

interface ReceivedFile {
  name: string;
  size: number;
  added: string;
}

/* ─── Component ──────────────────────────────────────────── */

export default function P2PTransfer() {
  const [status, setStatus] = useState<DwebStatus | null>(null);
  const [peers, setPeers] = useState<P2PPeer[]>([]);
  const [localPeers, setLocalPeers] = useState<P2PPeer[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<P2PPeer | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendStatus, setSendStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    const [statusData, discoverData, localData, receivedData] = await Promise.all([
      fetchApi<DwebStatus>("/dweb-status"),
      fetchApi<{ peers: P2PPeer[]; count: number }>("/discover"),
      fetchApi<P2PPeer[] | { peers: P2PPeer[] }>("/api/p2p/discover-local"),
      fetchApi<{ files: ReceivedFile[]; count: number }>("/api/p2p/received"),
    ]);

    if (statusData) setStatus(statusData);
    if (discoverData) setPeers(discoverData.peers || []);
    if (localData) {
      setLocalPeers(Array.isArray(localData) ? localData : (localData as { peers: P2PPeer[] }).peers || []);
    }
    if (receivedData) setReceivedFiles(receivedData.files || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSend = async () => {
    if (!selectedPeer || !selectedFile) return;
    setSending(true);
    setSendStatus("Uploading to local server...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadRes = await fetch("/fileshare/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        setSendStatus("Upload to local server failed");
        setSending(false);
        return;
      }

      setSendStatus("Reading file...");
      const base64 = await fileToBase64(selectedFile);

      setSendStatus(`Sending to ${selectedPeer.hostname || selectedPeer.id}...`);
      const peerUrl = `http://${selectedPeer.address}:${selectedPeer.port}/api/p2p/receive`;
      const sendRes = await fetch(peerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileData: base64,
          fromPeerId: status?.peerId || "unknown",
          fromHostname: status?.hostname || "unknown",
        }),
      });

      if (sendRes.ok) {
        setSendStatus("File sent successfully!");
      } else {
        const errText = await sendRes.text().catch(() => "Unknown error");
        setSendStatus(`Send failed: ${errText}`);
      }
    } catch (e) {
      setSendStatus(`Error: ${e}`);
    }
    setSending(false);
  };

  const peerMap = new Map<string, P2PPeer>();
  for (const p of [...peers, ...localPeers]) {
    if (!peerMap.has(p.id)) peerMap.set(p.id, p);
  }
  const uniquePeers = Array.from(peerMap.values());

  const isPeerRecent = (peer: P2PPeer): boolean => {
    if (peer.lastSeen) return Date.now() - peer.lastSeen < 30000;
    return peer.connected;
  };

  const monoStyle: React.CSSProperties = {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: 12,
    background: "rgba(255,255,255,0.05)",
    padding: "2px 6px",
    borderRadius: 4,
  };

  if (loading && !status) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h2>P2P File Transfer</h2>
        </div>
        <div className="loading-state">
          <RefreshCw size={24} className="spin" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>P2P File Transfer</h2>
          <p className="text-muted-sm" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Wifi size={12} />
            Peer: <code style={monoStyle}>{truncateId(status?.peerId || "")}</code>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            Port: {status?.port || "—"}
            <span style={{ color: "var(--text-muted)" }}>·</span>
            {uniquePeers.length} peer{uniquePeers.length !== 1 ? "s" : ""} online
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchData}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="p2p-grid" style={{ marginBottom: 20 }}>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Users size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Peers
          </div>
          <div className="p2p-stat-value">{uniquePeers.length}</div>
          <div className="p2p-stat-sub">Discovered on network</div>
        </div>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Server size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Peer ID
          </div>
          <div className="p2p-stat-value" style={{ fontSize: 16, fontFamily: "'SF Mono', monospace" }}>
            {truncateId(status?.peerId || "")}
          </div>
          <div className="p2p-stat-sub">Local identity</div>
        </div>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <HardDrive size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Received Files
          </div>
          <div className="p2p-stat-value">{receivedFiles.length}</div>
          <div className="p2p-stat-sub">From P2P transfers</div>
        </div>
        <div className="p2p-stat-card">
          <div className="p2p-stat-label">
            <Wifi size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Port
          </div>
          <div className="p2p-stat-value">{status?.port || "—"}</div>
          <div className="p2p-stat-sub">Web IDE port</div>
        </div>
      </div>

      {/* Discovered Peers */}
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <div className="section-header-actions">
          <h3>Discovered Peers ({uniquePeers.length})</h3>
        </div>
        {uniquePeers.length === 0 ? (
          <div className="glass-sm" style={{ padding: 24, textAlign: "center" }}>
            <Wifi size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p className="text-muted-sm">No peers discovered yet. Make sure the relay is running.</p>
          </div>
        ) : (
          <div className="p2p-peer-list">
            {uniquePeers.map(peer => (
              <div
                key={peer.id}
                className="p2p-peer-card"
                onClick={() => setSelectedPeer(peer)}
                style={{
                  cursor: "pointer",
                  borderColor: selectedPeer?.id === peer.id ? "var(--accent-blue)" : undefined,
                  background: selectedPeer?.id === peer.id ? "rgba(59,130,246,0.06)" : undefined,
                }}
              >
                <div className={`p2p-peer-status ${isPeerRecent(peer) ? "online" : "offline"}`} />
                <div className="p2p-peer-info">
                  <div className="p2p-peer-name">{peer.hostname || peer.id}</div>
                  <div className="p2p-peer-detail">
                    <code style={{ fontSize: 11 }}>{truncateId(peer.id)}</code>
                    <span style={{ margin: "0 4px" }}>·</span>
                    {peer.address}:{peer.port}
                    <span style={{ margin: "0 4px" }}>·</span>
                    {peer.platform || "unknown"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {peer.age !== undefined ? `${peer.age}s` : "—"}
                  </span>
                  {selectedPeer?.id === peer.id && (
                    <span className="nav-badge" style={{ fontSize: 10 }}>Selected</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send File */}
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <div className="section-header-actions">
          <h3>Send File</h3>
        </div>
        <div className="glass-sm" style={{ padding: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
                Select File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                style={{
                  width: "100%",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: 8,
                }}
              />
              {selectedFile && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {selectedFile.name} ({formatSize(selectedFile.size)})
                </p>
              )}
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
                Destination Peer
              </label>
              <div
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  color: selectedPeer ? "var(--text-primary)" : "var(--text-muted)",
                  fontFamily: selectedPeer ? "'SF Mono', monospace" : undefined,
                }}
              >
                {selectedPeer
                  ? `${selectedPeer.hostname || truncateId(selectedPeer.id)} (${selectedPeer.address}:${selectedPeer.port})`
                  : "Select a peer first"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={!selectedPeer || !selectedFile || sending}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {sending ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                {sending ? "Sending..." : "Send"}
              </button>
              {sendStatus && (
                <span
                  style={{
                    fontSize: 12,
                    color: sendStatus.startsWith("Error") ? "var(--error)" : "var(--success)",
                  }}
                >
                  {sendStatus}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Received Files */}
      <div className="settings-section">
        <div className="section-header-actions">
          <h3>Received Files ({receivedFiles.length})</h3>
        </div>
        {receivedFiles.length === 0 ? (
          <div className="glass-sm" style={{ padding: 24, textAlign: "center" }}>
            <Download size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p className="text-muted-sm">No files received yet.</p>
          </div>
        ) : (
          <div className="glass-sm" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>File Name</th>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>Size</th>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>Received</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {receivedFiles.map((file, i) => {
                  const cleaned = file.name.replace(/^p2p-from-/, "");
                  let decodedName = cleaned;
                  try { decodedName = decodeURIComponent(cleaned); } catch { /* keep raw */ }
                  return (
                    <tr
                      key={file.name + i}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <File size={14} style={{ color: "var(--accent-blue)", flexShrink: 0 }} />
                          <span>{decodedName}</span>
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        {formatSize(file.size)}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={12} /> {formatDate(file.added)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <a
                          href={`/fileshare/api/download/${file.name}`}
                          className="btn btn-sm btn-secondary"
                          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <Download size={12} /> Download
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
