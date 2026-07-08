import { Globe, Gauge, Bot, Settings, Menu, Network, Zap, BookOpen, Wifi } from "lucide-react";
import { useState, useEffect } from "react";
import type { View } from "../types";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

interface DwebStatus {
  peerId?: string;
  hostname?: string;
  peersOnline?: number;
  mode?: string;
  [key: string]: unknown;
}

const navItems: { id: View; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: <Gauge size={20} /> },
  { id: "browser", label: "Browser", icon: <Globe size={20} /> },
  { id: "ai-agent", label: "AI Agent", icon: <Bot size={20} /> },
  { id: "domains", label: "Domains", icon: <Network size={20} /> },
  { id: "docs", label: "Docs", icon: <BookOpen size={20} /> },
  { id: "settings", label: "Settings", icon: <Settings size={20} /> },
];

function truncatePeerId(id: string): string {
  if (!id || id.length <= 24) return id || "—";
  return `${id.slice(0, 20)}...${id.slice(-10)}`;
}

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState<DwebStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const resp = await fetch("/dweb-status", { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) return;
        const data = await resp.json() as DwebStatus;
        if (mounted) setStatus(data);
      } catch {
        // Server not reachable
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Zap size={22} className="logo-icon" />
          {!collapsed && <h1 className="sidebar-title">dweb</h1>}
        </div>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
          <Menu size={16} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentView === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
          >
            {item.icon}
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {status?.peersOnline !== undefined && (
          <div className="sidebar-status" style={{ padding: "8px 16px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span className={`status-dot ${(status.peersOnline ?? 0) > 0 ? "online" : "offline"}`} />
            <span style={{ color: "var(--text-secondary)" }}>
              {(status.peersOnline ?? 0) > 0
                ? `${status.peersOnline} peer${status.peersOnline !== 1 ? "s" : ""}`
                : "Offline"}
            </span>
            {status.mode && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
                {status.mode === "local" ? "Local" : status.mode === "p2p-visible" ? "Visible" : "Anon"}
              </span>
            )}
          </div>
        )}
        <div className="sidebar-version">v0.1.0</div>
        {status?.peerId && (
          <div
            className="sidebar-node-id"
            title={`Your Peer ID: ${status.peerId}`}
            onClick={() => { if (status?.peerId) { navigator.clipboard.writeText(status.peerId).catch(() => {}); } }}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Wifi size={10} style={{ color: "var(--accent-blue)", flexShrink: 0 }} />
            {truncatePeerId(status.peerId)}
          </div>
        )}
        {!status?.peerId && (
          <div className="sidebar-node-id" title="Connecting to server...">connecting...</div>
        )}
      </div>
    </aside>
  );
}
