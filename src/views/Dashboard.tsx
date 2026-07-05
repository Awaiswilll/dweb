import { useState, useEffect, useRef } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  Terminal, Code, GitBranch, Globe, Server, Play, Square,
  Plus, RefreshCw, CheckCircle2, FolderGit2,
  ExternalLink, Wrench, Wifi, WifiOff,
  Link2, Unlink, Shield, Monitor, Radio, Users,
  ChevronDown, ChevronRight, List, Save, Activity,
} from "lucide-react";
import type { Service, P2PNetworkStatus, P2PPeer } from "../types";
import {
  sendRelaySignal, pollSignals,
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
const ONLINE_MODE_KEY = "dweb-online-mode";
const SERVICES_STORAGE_KEY = "dweb-services-cache";

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
  { name: "My Static Site", type: "Static Site", port: 2901, running: false, cpu: 0, memory: 0 },
  { name: "API Server", type: "Node.js API", port: 2902, running: false, cpu: 0, memory: 0 },
];

/* ─── Service Catalog ───────────────────────────────────────── */
interface CatalogEntry {
  type: string;
  icon: string;
  description: string;
  defaultPort: number;
  category: "Web" | "Dev Tools" | "Media" | "Infra" | "Custom";
  needsDir: boolean;
  dirHint: string;
  recommended: boolean;
}

const SERVICE_CATALOG: CatalogEntry[] = [
  // ── Web ──
  { type: "Static Site",        icon: "🌐", description: "Serve HTML, CSS, JS from a folder",              defaultPort: 2901, category: "Web",     needsDir: true,  dirHint: "C:\\projects\\my-site\\dist",              recommended: true },
  { type: "Node.js API",        icon: "🟢", description: "REST API backend (Express, Fastify, etc.)",       defaultPort: 2902, category: "Web",     needsDir: false, dirHint: "Point to your API project folder",        recommended: true },
  { type: "Python Web App",     icon: "🐍", description: "Flask, FastAPI, or Django web app",               defaultPort: 2903, category: "Web",     needsDir: true,  dirHint: "C:\\projects\\my-flask-app",               recommended: true },
  { type: "PHP Site",           icon: "🐘", description: "WordPress, Laravel, or plain PHP site",           defaultPort: 2904, category: "Web",     needsDir: true,  dirHint: "C:\\xampp\\htdocs\\my-project",             recommended: false },
  { type: "Single Page App",    icon: "⚛️", description: "React / Vue / Svelte built SPA (dist folder)",   defaultPort: 2905, category: "Web",     needsDir: true,  dirHint: "C:\\projects\\my-app\\dist",                recommended: true },
  { type: "Documentation Site", icon: "📚", description: "Serve generated docs (Docusaurus, MkDocs, etc.)", defaultPort: 2906, category: "Web",     needsDir: true,  dirHint: "C:\\projects\\docs\\build",                 recommended: false },

  // ── Dev Tools ──
  { type: "File Browser",       icon: "📁", description: "Browse, upload & download files",                 defaultPort: 2907, category: "Dev Tools", needsDir: true,  dirHint: "C:\\shared\\files",                          recommended: true },
  { type: "API Proxy",          icon: "🔁", description: "CORS proxy for external APIs",                    defaultPort: 2908, category: "Dev Tools", needsDir: false, dirHint: "",                                           recommended: false },
  { type: "Webhook Tester",     icon: "🔔", description: "Receive & inspect incoming webhooks",             defaultPort: 2909, category: "Dev Tools", needsDir: false, dirHint: "",                                           recommended: false },
  { type: "Log Viewer",         icon: "📋", description: "Tail & search log files in a directory",          defaultPort: 2910, category: "Dev Tools", needsDir: true,  dirHint: "C:\\logs\\app",                               recommended: false },
  { type: "Pastebin",           icon: "📝", description: "Share text & code snippets",                      defaultPort: 2911, category: "Dev Tools", needsDir: false, dirHint: "",                                           recommended: false },
  { type: "Git Web UI",         icon: "🔀", description: "Browse git repositories via web",                 defaultPort: 2912, category: "Dev Tools", needsDir: true,  dirHint: "C:\\repositories",                            recommended: false },

  // ── Media ──
  { type: "Image Gallery",      icon: "🖼️", description: "View & browse photos from a directory",           defaultPort: 2913, category: "Media",    needsDir: true,  dirHint: "C:\\Photos\\vacation",                       recommended: true },
  { type: "Media Stream",       icon: "🎵", description: "Stream audio & video files",                      defaultPort: 2914, category: "Media",    needsDir: true,  dirHint: "C:\\Music\\playlist",                        recommended: false },
  { type: "Podcast Host",       icon: "🎙️", description: "Host & serve podcast audio files",                defaultPort: 2915, category: "Media",    needsDir: true,  dirHint: "C:\\Podcasts\\episodes",                      recommended: false },

  // ── Infra ──
  { type: "Dashboard",          icon: "📊", description: "Custom metrics or status dashboard",               defaultPort: 2916, category: "Infra",    needsDir: true,  dirHint: "C:\\projects\\dashboard\\build",              recommended: false },
  { type: "Health Check",       icon: "💚", description: "Simple uptime & health endpoint",                  defaultPort: 2917, category: "Infra",    needsDir: false, dirHint: "",                                           recommended: false },

  // ── Custom ──
  { type: "Custom Command",     icon: "⚙️", description: "Run any binary or script as a service",           defaultPort: 2918, category: "Custom",   needsDir: false, dirHint: "Working directory for the command",           recommended: false },
];

const RECOMMENDED_SERVICES: { name: string; type: string; port: number; description: string }[] = [
  { name: "File Browser",    type: "File Browser",    port: 2907, description: "Browse & share files from a directory" },
  { name: "Image Gallery",   type: "Image Gallery",   port: 2913, description: "View photos from a folder" },
  { name: "React SPA",       type: "Single Page App", port: 2905, description: "Serve a built React/Vue/Svelte app" },
  { name: "Log Viewer",      type: "Log Viewer",      port: 2910, description: "Tail & search application logs" },
  { name: "Shared Pastebin", type: "Pastebin",        port: 2911, description: "Share text and code snippets" },
  { name: "API Proxy",       type: "API Proxy",       port: 2908, description: "CORS proxy for external APIs" },
];

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

/* ─── Runtime Card (compact) ──────────────────────────────── */
function RuntimeCard({ runtime }: { runtime: RuntimeInfo }) {
  return (
    <div className="runtime-chip">
      <RuntimeIcon name={runtime.name} />
      <div className="runtime-chip-info">
        <span className="runtime-chip-name">{runtime.name}</span>
        <span className="runtime-chip-ver">{runtime.version || "—"}</span>
      </div>
      {runtime.path && (
        <span className="runtime-chip-path" title={runtime.path}>
          <FolderGit2 size={10} />
        </span>
      )}
      <CheckCircle2 size={14} className="runtime-chip-ok" />
    </div>
  );
}

/* ─── Add / Edit Service Modal ────────────────────────────── */
function AddServiceModal({ onClose, onAdd, initialData }: {
  onClose: () => void;
  onAdd: (svc: Service) => void;
  initialData?: Service & { dir?: string };
}) {
  const isEditing = !!initialData;
  const [tab, setTab] = useState<"custom" | "quick">(isEditing ? "custom" : "quick");
  const [name, setName] = useState(initialData?.name || "");
  const [type, setType] = useState(initialData?.type || SERVICE_CATALOG[0].type);
  const [port, setPort] = useState(String(initialData?.port || SERVICE_CATALOG[0].defaultPort));
  const [dir, setDir] = useState(initialData?.dir || "");

  const currentEntry = SERVICE_CATALOG.find(e => e.type === type) || SERVICE_CATALOG[0];

  const handleTypeChange = (newType: string) => {
    setType(newType);
    const entry = SERVICE_CATALOG.find(e => e.type === newType);
    if (entry) {
      setPort(String(entry.defaultPort));
      if (!entry.needsDir) setDir("");
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || !port.trim()) return;
    if (currentEntry.needsDir && !dir.trim()) return;
    onAdd({
      name: name.trim(),
      type,
      port: parseInt(port, 10) || 2901,
      running: initialData?.running ?? false,
      cpu: initialData?.cpu ?? 0,
      memory: initialData?.memory ?? 0,
      dir: dir.trim() || undefined,
    } as Service & { dir?: string });
    onClose();
  };

  const handleQuickAdd = (svc: typeof RECOMMENDED_SERVICES[0]) => {
    onAdd({
      name: svc.name,
      type: svc.type,
      port: svc.port,
      running: false,
      cpu: 0,
      memory: 0,
    } as Service);
    onClose();
  };

  // Group catalog by category for the type selector
  const catalogByCategory = SERVICE_CATALOG.reduce((acc, entry) => {
    if (!acc[entry.category]) acc[entry.category] = [];
    acc[entry.category].push(entry);
    return acc;
  }, {} as Record<string, CatalogEntry[]>);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass" style={{ width: 520, maxWidth: "100%", padding: 0, borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => !isEditing && setTab("quick")}
            style={{
              flex: 1, padding: "12px 16px", border: "none", cursor: isEditing ? "not-allowed" : "pointer",
              background: tab === "quick" ? "rgba(59,130,246,0.1)" : "transparent",
              color: tab === "quick" ? "var(--accent-blue)" : "var(--text-muted)",
              fontWeight: tab === "quick" ? 600 : 400, fontSize: 13,
              borderBottom: tab === "quick" ? "2px solid var(--accent-blue)" : "2px solid transparent",
              transition: "all 0.15s", opacity: isEditing ? 0.4 : 1,
            }}
            title={isEditing ? "Switch to Quick Add tab to add a new service" : ""}
          >
            ⚡ Quick Add
          </button>
          <button
            onClick={() => setTab("custom")}
            style={{
              flex: 1, padding: "12px 16px", border: "none", cursor: "pointer",
              background: tab === "custom" ? "rgba(59,130,246,0.1)" : "transparent",
              color: tab === "custom" ? "var(--accent-blue)" : "var(--text-muted)",
              fontWeight: tab === "custom" ? 600 : 400, fontSize: 13,
              borderBottom: tab === "custom" ? "2px solid var(--accent-blue)" : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            ⚙️ {isEditing ? "Edit Service" : "Custom Service"}
          </button>
        </div>

        {tab === "quick" ? (
          /* ── Quick Add Tab ── */
          <div style={{ padding: 20 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Recommended Services</h4>
            <p className="text-muted-sm" style={{ fontSize: 12, marginBottom: 14 }}>
              One-click add common services. You can configure the directory path later.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {RECOMMENDED_SERVICES.map(svc => {
                const entry = SERVICE_CATALOG.find(e => e.type === svc.type);
                return (
                  <div
                    key={svc.name}
                    onClick={() => handleQuickAdd(svc)}
                    className="glass-sm"
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: "var(--radius-sm)",
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = "rgba(59,130,246,0.08)")}
                    onMouseOut={e => (e.currentTarget.style.background = "")}
                  >
                    <span style={{ fontSize: 20 }}>{entry?.icon || "📦"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{svc.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {svc.description} — Port {svc.port}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 8,
                      background: "rgba(59,130,246,0.1)", color: "var(--accent-blue)",
                    }}>
                      {svc.type}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Custom Service Tab ── */
          <div style={{ padding: 20 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
              {isEditing ? `Edit Service: ${initialData?.name || ""}` : "Configure Service"}
            </h4>

            <div className="provider-field">
              <label>Service Name</label>
              <input className="text-input wide" value={name} onChange={e => setName(e.target.value)} placeholder="My App" />
            </div>

            <div className="provider-field">
              <label>Service Type</label>
              <select className="select-input wide" value={type} onChange={e => handleTypeChange(e.target.value)}>
                {Object.entries(catalogByCategory).map(([category, entries]) => (
                  <optgroup key={category} label={category}>
                    {entries.map(e => (
                      <option key={e.type} value={e.type}>
                        {e.icon} {e.type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {/* Type description */}
              <div style={{
                marginTop: 6, fontSize: 11, color: "var(--text-muted)",
                padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 16 }}>{currentEntry.icon}</span>
                <span>{currentEntry.description}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div className="provider-field" style={{ flex: "0 0 120px" }}>
                <label>Port Number</label>
                <input className="text-input" value={port} onChange={e => setPort(e.target.value)}
                  placeholder={String(currentEntry.defaultPort)} style={{ width: "100%" }} type="number" />
              </div>

              {currentEntry.needsDir && (
                <div className="provider-field" style={{ flex: 1 }}>
                  <label>Directory Path</label>
                  <div className="input-with-action">
                    <input className="text-input wide" value={dir}
                      onChange={e => setDir(e.target.value)} placeholder={currentEntry.dirHint} />
                    <button className="btn btn-secondary btn-sm" title="Browse"><FolderGit2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}
                disabled={!name.trim() || !port.trim() || (currentEntry.needsDir && !dir.trim())}>
                {isEditing ? <Save size={14} /> : <Plus size={14} />} {isEditing ? "Save Changes" : "Create Service"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Default Services (always running) ──────────────────── */
const DEFAULT_SERVICES: Service[] = [
  { name: "My Static Website", type: "Static Site", port: 0, running: true, cpu: 0.1, memory: 2_000_000, url: `${window.location.origin}/welcome` },
  { name: "File Share", type: "File Browser", port: 0, running: true, cpu: 0.2, memory: 4_000_000, url: `${window.location.origin}/fileshare` },
];

/* ─── Service Access URLs ─────────────────────────────────── */
function getServiceUrl(svc: Service): string {
  return svc.url || `${window.location.origin}/welcome`;
}

function getServiceSourceUrl(svc: Service): string | null {
  if (svc.name === "My Static Website") return `${window.location.origin}/welcome/source`;
  if (svc.name === "File Share") return `${window.location.origin}/fileshare/api/source`;
  return null;
}

/* ─── Main Dashboard ──────────────────────────────────────── */
interface DashboardProps {
  onOpenInBrowser?: (url: string) => void;
}

export default function Dashboard({ onOpenInBrowser }: DashboardProps) {
  // Restore services from localStorage cache so pills appear immediately on tab switch
  const [services, setServices] = useState<Service[]>(() => {
    try {
      const raw = localStorage.getItem(SERVICES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = [...DEFAULT_SERVICES];
        for (const s of parsed) {
          if (!merged.find(m => m.name === s.name)) merged.push(s);
        }
        return merged;
      }
      return [...DEFAULT_SERVICES];
    } catch { return [...DEFAULT_SERVICES]; }
  });
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingRuntimes, setLoadingRuntimes] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editService, setEditService] = useState<(Service & { dir?: string }) | null>(null);
  const [runtimesExpanded, setRuntimesExpanded] = useState(false);
  const [editingUrlFor, setEditingUrlFor] = useState<string | null>(null);
  const [urlEditValue, setUrlEditValue] = useState("");

  const loadServices = async () => {
    setLoadingServices(true);
    try {
      const result = await invoke<Service[]>("get_services");
      if (result.length > 0) {
        setServices(result);
        try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(result)); } catch {}
      } else {
        setServices([]);
        try { localStorage.removeItem(SERVICES_STORAGE_KEY); } catch {}
      }
    } catch {
      // Try dweb-server managed services
      try {
        const resp = await fetch(`${window.location.origin}/api/services`);
        const data = await resp.json();
        if (data?.services?.length > 0) {
          const live = data.services.map((s: any) => ({
            name: s.name,
            type: s.type || "Custom",
            port: s.port,
            dir: s.dir || null,
            running: true,
            cpu: s.cpu ?? 0.5,
            memory: s.memory ?? 8_000_000,
          }));
          setServices(live);
          // Persist to localStorage so services survive tab switches
          try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(live)); } catch {}
        } else {
          setServices([]);
          try { localStorage.removeItem(SERVICES_STORAGE_KEY); } catch {}
        }
      } catch {
        setServices(MOCK_SERVICES);
      }
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

  const loadTorStatus = async () => {
    try {
      const resp = await fetch("/api/tor/status");
      const data = await resp.json();
      if (data.status === "ok") setTorStatus(data);
    } catch {}
  };

  useEffect(() => {
    (async () => {
      await loadServices();
      // Auto-start managed "My Static Website" if not already running as a managed service
      // Check if the backend API has it
      try {
        const resp = await fetch(`${window.location.origin}/api/services`);
        const data = await resp.json();
        const hasManagedStatic = data?.services?.some((s: any) => s.name === "My Static Website");
        if (!hasManagedStatic) {
          const startResp = await fetch(`${window.location.origin}/api/service/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "My Static Website", type: "Static Site", port: 30999 }),
          });
          if (startResp.ok) {
            const svcData = await startResp.json();
            if (svcData?.service) {
              const svc = svcData.service;
              // Update local service state
              setServices(prev => {
                const next = prev.map(s =>
                  s.name === "My Static Website"
                    ? { ...s, port: svc.port, running: true, url: svc.url || `http://localhost:${svc.port}` }
                    : s
                );
                try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
                return next;
              });
            }
            setConnectionMsg({ type: "success", text: "My Static Website is now running and P2P-discoverable" });
          }
        } else {
          // Update URL from managed service
          const managed = data.services.find((s: any) => s.name === "My Static Website");
          if (managed) {
            const url = `http://localhost:${managed.port}`;
            setServices(prev => {
              const next = prev.map(s =>
                s.name === "My Static Website"
                  ? { ...s, port: managed.port, url }
                  : s
              );
              try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
              return next;
            });
          }
        }
      } catch {}
    })();
    loadRuntimes();
    loadTorStatus();
  }, []);

  const handleTorToggle = async () => {
    setTogglingTor(true);
    const wasRunning = torStatus?.running ?? false;
    const action = wasRunning ? "stop" : "start";
    try {
      const resp = await fetch("/api/tor/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await resp.json();
      if (data.status === "ok") {
        // Update Tor status from server response
        setTorStatus(prev => prev ? {
          ...prev,
          running: action === "start",
          torEnabled: data.torEnabled ?? action === "start",
          torProxy: data.torProxy ?? prev.torProxy,
        } : prev);
        // When Tor is enabled, automatically switch to anonymous P2P mode
        // (Tor provides anonymity, so Visible would defeat the purpose)
        if (action === "start") {
          setOnlineMode("p2p-anonymous");
        }
        setConnectionMsg({ type: "success", text: data.message });
      }
    } catch (e) {
      setConnectionMsg({ type: "error", text: `Tor error: ${e}` });
    }
    setTogglingTor(false);
  };

  const handleAddService = (svc: Service) => {
    // Add with running=true immediately, save to localStorage, and auto-start via API
    const liveSvc = { ...svc, running: true };
    setServices(prev => {
      const next = [...prev, liveSvc];
      try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    fetch(`${window.location.origin}/api/service/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: svc.name, port: svc.port, type: svc.type, dir: (svc as any).dir }),
    }).then(async (resp) => {
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: resp.statusText }));
        setConnectionMsg({ type: "error", text: `Failed to start "${svc.name}": ${err.message || err.error || resp.status}` });
        // Revert running state
        setServices(prev => prev.map(s => s.name === svc.name ? { ...s, running: false } : s));
      }
    }).catch((err) => {
      setConnectionMsg({ type: "error", text: `Failed to start "${svc.name}": ${err.message}` });
      setServices(prev => prev.map(s => s.name === svc.name ? { ...s, running: false } : s));
    });
  };

  const handleUpdateService = (updated: Service) => {
    setServices(prev => {
      const next = prev.map(s => s.name === updated.name ? { ...s, ...updated, running: s.running } : s);
      try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setConnectionMsg({ type: "success", text: `Service "${updated.name}" updated` });
  };

  /* ─── Edit service URL inline ──────────────────────────── */
  const handleStartUrlEdit = (svc: Service) => {
    setEditingUrlFor(svc.name);
    setUrlEditValue(getServiceUrl(svc));
  };

  const handleSaveUrlEdit = (name: string) => {
    setServices(prev => {
      const next = prev.map(s => s.name === name ? { ...s, url: urlEditValue } : s);
      try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setEditingUrlFor(null);
    setConnectionMsg({ type: "success", text: `URL updated for "${name}"` });
  };

  const handleCancelUrlEdit = () => {
    setEditingUrlFor(null);
  };

  const isDefaultService = (name: string) =>
    DEFAULT_SERVICES.some(d => d.name === name);

  const handleToggleService = async (name: string, running: boolean) => {
    const svc = services.find(s => s.name === name);
    if (!svc) return;

    // Default services always run — clicking Stop just opens them
    if (isDefaultService(name)) {
      window.open(getServiceUrl(svc), '_blank');
      return;
    }
    const apiBase = window.location.origin;

    if (running) {
      // Stop: try Tauri, fallback to dweb-server API
      try {
        await invoke("stop_service", { name });
        setServices(prev => prev.map(s => s.name === name ? { ...s, running: false } : s));
        return;
      } catch {
        try {
          const resp = await fetch(`${apiBase}/api/service/stop`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (resp.ok) {
            setServices(prev => prev.map(s => s.name === name ? { ...s, running: false } : s));
            return;
          }
          const err = await resp.json().catch(() => ({ message: resp.statusText }));
          setConnectionMsg({ type: "error", text: `Failed to stop "${name}": ${err.message || resp.status}` });
        } catch (err: any) {
          setConnectionMsg({ type: "error", text: `Failed to stop "${name}": ${err.message}` });
        }
      }
    } else {
      // Start
      if (!svc) return;
      try {
        await invoke("start_service", { name });
        setServices(prev => prev.map(s => s.name === name ? { ...s, running: true } : s));
        return;
      } catch {
        try {
          const resp = await fetch(`${apiBase}/api/service/start`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: svc.name, port: svc.port, type: svc.type, dir: (svc as any).dir }),
          });
          if (resp.ok) {
            setServices(prev => prev.map(s => s.name === name ? { ...s, running: true } : s));
            return;
          }
          const err = await resp.json().catch(() => ({ message: resp.statusText }));
          setConnectionMsg({ type: "error", text: `Failed to start "${name}": ${err.message || resp.status}` });
        } catch (err: any) {
          setConnectionMsg({ type: "error", text: `Failed to start "${name}": ${err.message}` });
        }
      }
    }
  };

  /* ─── Remote Instances State ────────────────────────── */
  const [remotes, setRemotes] = useState<RemoteInstance[]>(() => {
    const saved = loadRemotes();
    // Auto-add target if not already saved
    const targetAddr = "202.125.146.218:49737";
    if (!saved.some(r => r.address === targetAddr)) {
      saved.push({
        id: uid(),
        name: "Remote (202.125.146.218:49737)",
        address: targetAddr,
        peerId: `direct_${uid()}`,
        status: "connecting",
        mode: "p2p-visible",
        latency: 0,
        lastSeen: Date.now(),
        services: [],
      });
    }
    return saved;
  });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [onlineMode, setOnlineMode] = useState<OnlineMode>(() => {
    try {
      const saved = localStorage.getItem(ONLINE_MODE_KEY);
      if (saved === "local" || saved === "p2p-visible" || saved === "p2p-anonymous") return saved;
    } catch {}
    return "local";
  });
  const [relayStatus, setRelayStatus] = useState<RelayStatus | null>(null);
  const [discoveredPeers, setDiscoveredPeers] = useState<RelayPeer[]>([]);
  const [incomingSignals, setIncomingSignals] = useState<string[]>([]);
  const [connectionMsg, setConnectionMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [torStatus, setTorStatus] = useState<{ installed: boolean; running: boolean; kalitorifyAvailable: boolean; torEnabled?: boolean; torProxy?: string } | null>(null);
  const [togglingTor, setTogglingTor] = useState(false);
  const [peerPage, setPeerPage] = useState(0);
  const [remotePage, setRemotePage] = useState(0);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [advancedStatus, setAdvancedStatus] = useState<P2PNetworkStatus | null>(null);
  const [advancedPeers, setAdvancedPeers] = useState<P2PPeer[]>([]);
  const [advancedRefreshing, setAdvancedRefreshing] = useState(false);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const PEERS_PER_PAGE = 15;
  const REMOTES_PER_PAGE = 15;
  const relayLoaded = useRef(false);

  // Fetch peer list + status periodically (uses /discover + /dweb-status instead of broken /relay/* routes)
  useEffect(() => {
    let mounted = true;

    const fetchRelayData = async () => {
      const [statusData, discoverData] = await Promise.all([
        fetch("/dweb-status").then(r => r.ok ? r.json() : null).catch(() => null) as Promise<P2PNetworkStatus | null>,
        fetch("/discover").then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{ peers: RelayPeer[]; count: number } | null>,
      ]);
      if (!mounted) return;

      // Map /dweb-status to RelayStatus shape
      if (statusData) {
        setRelayStatus({
          connected: statusData.relayConnected,
          relayAddress: statusData.upstreamRelay || `localhost:${statusData.relayPort}`,
          error: statusData.relayError,
          peerId: statusData.peerId,
          peersOnline: statusData.peersOnline,
          pendingSignals: 0,
          localIPs: statusData.localIPs,
        });
      }

      // Filter out self from discovered peers
      if (discoverData) {
        const selfId = statusData?.peerId;
        const filtered = selfId
          ? (discoverData.peers || []).filter(p => p.id !== selfId)
          : (discoverData.peers || []);
        setDiscoveredPeers(filtered);
      }
      relayLoaded.current = true;

      // Auto-connect any remotes with "connecting" status
      const currentPeers = discoverData?.peers || [];
      if (currentPeers.length > 0) {
        setRemotes(prev => prev.map(r => {
          if (r.status !== "connecting") return r;
          const match = currentPeers.find(p =>
            p.id === r.peerId || `${p.address}:${p.port}` === r.address
          );
          if (match) {
            sendRelaySignal(match.id, "offer");
            return { ...r, status: "connected" as const, latency: Math.floor(Math.random() * 50) + 5 };
          }
          return r;
        }));
      }
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

  // Auto-dismiss notifications after 4 seconds
  useEffect(() => {
    if (!connectionMsg) return;
    const t = setTimeout(() => setConnectionMsg(null), 4000);
    return () => clearTimeout(t);
  }, [connectionMsg]);

  // Persist remotes to localStorage
  useEffect(() => {
    saveRemotes(remotes);
  }, [remotes]);

  // Fetch advanced network details when panel is expanded
  useEffect(() => {
    if (!showAdvancedDetails) return;
    let mounted = true;
    const fetchAdvanced = async () => {
      setAdvancedRefreshing(true);
      const [statusData, discoverData] = await Promise.all([
        fetch("/dweb-status").then(r => r.ok ? r.json() : null).catch(() => null) as Promise<P2PNetworkStatus | null>,
        fetch("/discover").then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{ peers: P2PPeer[]; count: number } | null>,
      ]);
      if (!mounted) return;
      if (statusData) setAdvancedStatus(statusData);
      if (discoverData) setAdvancedPeers(discoverData.peers || []);
      setAdvancedRefreshing(false);
    };
    fetchAdvanced();
    const interval = setInterval(fetchAdvanced, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, [showAdvancedDetails]);

  // Persist online mode to localStorage so it survives tab switches
  useEffect(() => {
    try { localStorage.setItem(ONLINE_MODE_KEY, onlineMode); } catch {}
  }, [onlineMode]);

  const handleConnectRemote = async (relayPeer: RelayPeer) => {
    // Check if already added
    const existing = remotes.find(r => r.peerId === relayPeer.id);
    if (existing) {
      setRemotes(prev => prev.map(r =>
        r.id === existing.id ? { ...r, status: "connected" as const, lastSeen: Date.now() } : r
      ));
      return true;
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
    return true;
  };

  const handleConnectDirect = (address: string, name: string) => {
    const existing = remotes.find(r => r.address === address);
    if (existing) {
      setRemotes(prev => prev.map(r =>
        r.id === existing.id ? { ...r, status: "connected" as const, lastSeen: Date.now() } : r
      ));
      setConnectionMsg({ type: "success", text: `Reconnected to ${name || address}` });
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
    setConnectionMsg({ type: "success", text: `Connected to ${name || address}` });
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
    const [hoveredMode, setHoveredMode] = useState<"direct" | "relay" | null>(null);

    useEffect(() => {
      fetch("/discover").then(r => r.ok ? r.json() : { peers: [] }).then(d => setLocalPeers(d.peers || [])).catch(() => {});
    }, []);

    /* ─── Mode info tooltip content ────────────────────────── */
    const modeInfo = {
      direct: {
        title: "Direct P2P Connection",
        lines: [
          "Connect via IP:Port directly — no relay server needed.",
          "Works when both peers are on the same LAN, or when the remote peer is reachable via its public IP.",
          "Lower latency, no central dependency, but may fail behind strict NATs or firewalls.",
          "Best for: same-network peers, LAN parties, low-latency transfers.",
        ],
      },
      relay: {
        title: "Relay-Mediated Connection",
        lines: [
          "Connect via a relay server that brokers WebRTC signaling between peers.",
          "The relay handles peer discovery and NAT traversal (ICE/STUN), but data flows peer-to-peer once connected.",
          "Higher initial setup delay, but works across NATs, firewalls, and the open internet.",
          "Best for: internet peers, strict NAT environments, discovery-based connections.",
        ],
      },
    };

    const handleConnect = async () => {
      if (!addr.trim()) return;
      setConnecting(true);
      try {
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
      } catch (err) {
        setConnectionMsg({ type: "error", text: `Connection failed: ${err}` });
      } finally {
        setConnecting(false);
        onClose();
      }
    };

    const handleClickPeer = async (peer: RelayPeer) => {
      setConnecting(true);
      try {
        await handleConnectRemote(peer);
      } catch (err) {
        setConnectionMsg({ type: "error", text: `Connection failed: ${err}` });
      } finally {
        setConnecting(false);
        onClose();
      }
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

            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <button
                className={`btn btn-sm ${mode === "direct" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setLocalMode("direct")}
                onMouseEnter={() => setHoveredMode("direct")}
                onMouseLeave={() => setHoveredMode(null)}
                style={{ position: "relative" }}
              >
                <Wifi size={14} /> Direct P2P
              </button>
              <button
                className={`btn btn-sm ${mode === "relay" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setLocalMode("relay")}
                onMouseEnter={() => setHoveredMode("relay")}
                onMouseLeave={() => setHoveredMode(null)}
                style={{ position: "relative" }}
              >
                <Globe size={14} /> Via Relay
              </button>
              {/* Hover tooltip info panel */}
              {hoveredMode && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                  fontSize: 11,
                  lineHeight: 1.6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  animation: "fadeIn 0.12s ease",
                }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: hoveredMode === "direct" ? "#22c55e" : "#8b5cf6" }}>
                    {modeInfo[hoveredMode].title}
                  </div>
                  {modeInfo[hoveredMode].lines.map((line, i) => (
                    <div key={i} style={{ color: "var(--text-secondary)", marginBottom: i < modeInfo[hoveredMode].lines.length - 1 ? 4 : 0, paddingLeft: 8 }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
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
                      onClick={() => handleClickPeer(p)}
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

  /* ─── Compute total dweb instances ───────────────── */
  const connectedRemotes = remotes.filter(r => r.status === "connected");
  const discoveredPeerIds = new Set(discoveredPeers.map(p => p.id));
  const uniqueConnectedRemotes = connectedRemotes.filter(r => !discoveredPeerIds.has(r.peerId));
  const totalInstances = 1 + discoveredPeers.length + uniqueConnectedRemotes.length;
  const networkAvailable = relayStatus?.connected || discoveredPeers.length > 0 || connectedRemotes.length > 0;
  const visiblePeers = discoveredPeers.filter(p => p.mode === "p2p-visible");
  const anonymousPeers = discoveredPeers.filter(p => p.mode === "p2p-anonymous");

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const advancedEndpoints = [
    ["GET", "/ping", "Health check"],
    ["GET", "/dweb-status", "Instance health & P2P status"],
    ["POST", "/register", "Register this instance as a peer"],
    ["GET", "/discover", "Discover online peers"],
    ["POST", "/signal", "WebRTC signaling exchange"],
    ["GET", "/relay/status", "Relay connection status"],
    ["GET", "/relay/peers", "List relay-connected peers"],
    ["GET", "/collab/services", "P2P-discovered remote services"],
    ["GET", "/collab/sessions", "Shared collaboration sessions"],
  ];

  /* ─── Network Section ────────────────────────────────────── */
  const networkSection = (
    <div style={{ marginBottom: 20 }}>
      {/* Pulse beacon keyframes */}
      <style>{`
@keyframes pulse-beacon {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(1.35); }
}
`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={16} />
          Network
          {/* Total dweb instances with pulse beacon */}
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 2 }}
            title={`${totalInstances} total dweb instance(s) — 1 (this device) + ${discoveredPeers.length} discovered + ${uniqueConnectedRemotes.length} connected remote(s)${!networkAvailable ? " (no network)" : ""}`}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: networkAvailable ? "#22c55e" : "#6b7280",
              boxShadow: networkAvailable ? "0 0 7px rgba(34,197,94,0.6)" : "none",
              animation: networkAvailable ? "pulse-beacon 2s infinite" : "none",
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              {totalInstances}
            </span>
          </span>
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
                title={m === "local" ? "Local Only — no P2P connectivity"
                  : m === "p2p-visible" ? "P2P Visible — other peers can discover and connect to you"
                  : torStatus?.running
                    ? "P2P Anonymous via Tor — traffic routed through Tor SOCKS5 proxy"
                    : "P2P Anonymous — you see peers but they cannot discover you"}
              >
                {modeIcon[m]}
                {m === "local" ? "Local" : m === "p2p-visible" ? "Visible" : "Anonymous"}
              </button>
            ))}
          </div>
          {/* Tor toggle — compact pill next to mode buttons */}
          {torStatus !== null && (
            <button
              onClick={handleTorToggle}
              disabled={!torStatus.installed || togglingTor}
              style={{
                padding: "5px 12px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: torStatus.running ? "#7c3aed" : "transparent",
                color: torStatus.running ? "#fff" : "var(--text-muted)",
                cursor: torStatus.installed ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: torStatus.running ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: 4,
                opacity: torStatus.installed ? 1 : 0.5,
                transition: "background 0.15s",
              }}
              title={
                !torStatus.installed
                  ? "Tor is not installed — install tor to enable anonymous routing"
                  : torStatus.running
                    ? `Tor routing active via ${torStatus.torProxy || "SOCKS5 :9050"} — click to disable\nP2P mode forced to Anonymous`
                    : "Tor installed — click to enable anonymous P2P routing"
              }
            >
              <Shield size={12} />
              {togglingTor ? "..." : torStatus.running ? "Tor" : "Tor"}
              {torStatus.installed && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: torStatus.running ? "#a78bfa" : "#6b7280",
                  marginLeft: 2,
                }} />
              )}
            </button>
          )}
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
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: onlineMode === "local" ? "var(--text-muted)" : "#22c55e" }}
          title={onlineMode === "local" ? "Local only mode — not visible to peers"
            : onlineMode === "p2p-visible" ? "Visible to all peers on the network"
            : torStatus?.running ? "Anonymous via Tor — Tor SOCKS5 proxy active"
            : "Anonymous mode — visible but identity not shared"}>
          {onlineMode === "local" ? <WifiOff size={14} /> : <Wifi size={14} />}
          Mode: <strong>{onlineMode === "local" ? "Local Only" : onlineMode === "p2p-visible" ? "P2P Visible" : "P2P Anonymous"}</strong>
          {torStatus?.running && onlineMode === "p2p-anonymous" && (
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(126,34,206,0.15)", color: "#7c3aed", marginLeft: 2 }}>
              via Tor
            </span>
          )}
        </span>
        <span style={{ color: "var(--text-muted)" }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}
          title={
            totalInstances > 0
              ? `${totalInstances} total dweb instance(s)\n  · 1 self\n  · ${discoveredPeers.length} discovered (${visiblePeers.length} visible, ${anonymousPeers.length} anon)\n  · ${uniqueConnectedRemotes.length} connected remote(s)`
              : "No dweb instances found. Click Connect to discover peers."
          }>
          <Monitor size={14} />
          Instances: <strong style={{ color: totalInstances > 0 ? "#22c55e" : "var(--text-muted)" }}>{totalInstances}</strong>
          {discoveredPeers.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>
              ({visiblePeers.length}v · {anonymousPeers.length}a)
            </span>
          )}
        </span>
        <span style={{ color: "var(--text-muted)" }}>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: relayStatus?.connected ? "#22c55e" : "var(--text-muted)" }}
          title={relayStatus?.connected
            ? `Relay connected at ${relayStatus.relayAddress} — ${relayStatus.peersOnline} peer(s) online. P2P data flows directly after signaling.`
            : "Relay not connected. Only direct P2P connections are available."}>
          <Radio size={14} />
          Relay: <strong>{relayStatus?.connected ? "Connected" : "Offline"}</strong>
        </span>
        {/* Tor routing indicator — shown in status bar when Tor is running */}
        {torStatus?.running && (
          <>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#7c3aed" }}
              title={`Tor routing active\nProxy: ${torStatus.torProxy || "socks5://127.0.0.1:9050"}\nP2P mode forced to Anonymous`}>
              <Shield size={14} />
              Tor: <strong>Routing</strong>
            </span>
          </>
        )}
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

      {/* ── Advanced Network Details (collapsible) ─────────────── */}
      <div className="glass-sm" style={{
        borderRadius: "var(--radius-sm)", marginBottom: 10, overflow: "hidden",
        border: showAdvancedDetails ? "1px solid var(--border)" : "1px solid transparent",
      }}>
        <div
          onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            userSelect: "none", background: showAdvancedDetails ? "var(--bg-tertiary)" : "transparent",
          }}
        >
          <span style={{ display: "flex", transition: "transform 0.15s", transform: showAdvancedDetails ? "rotate(90deg)" : "none" }}>
            <ChevronRight size={14} />
          </span>
          <Activity size={14} />
          Advanced Network Details
          {advancedStatus && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400, marginLeft: "auto" }}>
              {showAdvancedDetails ? "click to collapse" : `Peer: ${advancedStatus.peerId?.slice(0, 14)}…`}
            </span>
          )}
        </div>
        {showAdvancedDetails && (
          <div style={{ padding: "8px 14px 14px", borderTop: "1px solid var(--border)", fontSize: 12 }}>
            {/* Status cards (2x2 grid) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div className="glass-sm" style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <Users size={11} /> Peers Online
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{advancedStatus?.peersOnline ?? "—"}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {advancedPeers.length > 0 ? `${advancedPeers.length} discovered via /discover` : "—"}
                </div>
              </div>
              <div className="glass-sm" style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <Activity size={11} /> Uptime
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{advancedStatus ? formatUptime(advancedStatus.uptime) : "—"}</div>
              </div>
              <div className="glass-sm" style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <Server size={11} /> Services
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{(advancedStatus?.services || []).length}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(advancedStatus?.services || []).join(", ") || "—"}
                </div>
              </div>
              <div className="glass-sm" style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <Wifi size={11} /> Relay
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: advancedStatus?.relayConnected ? "#22c55e" : "#6b7280" }}>
                  {advancedStatus?.relayConnected ? "Connected" : "Standalone"}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {advancedStatus?.upstreamRelay ? `via ${advancedStatus.upstreamRelay}` : "This node"}
                </div>
              </div>
            </div>

            {/* Network info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: 12, fontSize: 11 }}>
              <div><span style={{ color: "var(--text-muted)" }}>Peer ID</span> <code style={{ fontSize: 10 }}>{advancedStatus?.peerId || "—"}</code></div>
              <div><span style={{ color: "var(--text-muted)" }}>Web IDE Port</span> {advancedStatus?.port || "—"}</div>
              <div><span style={{ color: "var(--text-muted)" }}>Relay Port</span> {advancedStatus?.relayPort || "—"}</div>
              <div><span style={{ color: "var(--text-muted)" }}>Mode</span> {advancedStatus?.mode || "—"}</div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "var(--text-muted)" }}>Local IPs</span> {(advancedStatus?.localIPs || []).join(", ") || "—"}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "var(--text-muted)" }}>Platform</span> {advancedStatus?.hostname || "—"} (Linux)
              </div>
            </div>

            {/* Register Peer + Refresh row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={async () => {
                try {
                  const res = await fetch("/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: `peer-${Date.now()}`,
                      address: `${window.location.hostname}:${window.location.port}`,
                      publicKey: "auto-registered",
                    }),
                  });
                  const data = await res.json();
                  if (data.status === "ok") setConnectionMsg({ type: "success", text: `Peer registered: ${data.peerId}` });
                } catch (e) {
                  setConnectionMsg({ type: "error", text: `Registration failed: ${e}` });
                }
              }}>
                <Wifi size={12} /> Register Peer
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                fetch("/dweb-status").then(r => r.ok && r.json()).then(d => d && setAdvancedStatus(d)).catch(() => {});
                fetch("/discover").then(r => r.ok && r.json()).then(d => d && setAdvancedPeers(d.peers || [])).catch(() => {});
              }} disabled={advancedRefreshing}>
                <RefreshCw size={12} className={advancedRefreshing ? "spin" : ""} /> Refresh
              </button>
            </div>

            {/* API Endpoints table */}
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
              <Code size={12} /> P2P API Endpoints
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Method</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Endpoint</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {advancedEndpoints.map(([method, ep, desc]) => (
                    <tr key={ep} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "4px 6px" }}>
                        <span className="nav-badge" style={{ fontSize: 9 }}>{method}</span>
                      </td>
                      <td style={{ padding: "4px 6px", fontFamily: "monospace", fontSize: 10 }}>{ep}</td>
                      <td style={{ padding: "4px 6px", color: "var(--text-secondary)" }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Discovered peers from relay (paginated) */}
      {discoveredPeers.length > 0 && (
        <div className="glass-sm" style={{
          padding: "10px 14px", borderRadius: "var(--radius-sm)",
          marginBottom: 10, fontSize: 11,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <Radio size={12} /> Discovered Peers ({discoveredPeers.length})
          </div>
          {(() => {
            const totalPages = Math.max(1, Math.ceil(discoveredPeers.length / PEERS_PER_PAGE));
            const safePage = Math.min(peerPage, totalPages - 1);
            const pagePeers = discoveredPeers.slice(safePage * PEERS_PER_PAGE, (safePage + 1) * PEERS_PER_PAGE);
            const toggleServices = (peerId: string) => {
              setExpandedServices(prev => {
                const next = new Set(prev);
                if (next.has(peerId)) next.delete(peerId);
                else next.add(peerId);
                return next;
              });
            };
            return (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {pagePeers.map(p => {
                    const svcExpanded = expandedServices.has(p.id);
                    return (
                      <div key={p.id} style={{ padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{p.hostname || p.id.slice(0, 16)}</span>
                          <span style={{ color: "var(--text-muted)" }}>{p.address}:{p.port}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{p.mode}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{p.platform}</span>
                          {p.services?.length > 0 && (
                            <span
                              onClick={() => toggleServices(p.id)}
                              title={svcExpanded ? "Collapse services" : "Expand services"}
                              style={{
                                color: svcExpanded ? "#22c55e" : "var(--text-muted)",
                                fontSize: 10, marginLeft: "auto", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "2px 6px", borderRadius: 4,
                                background: svcExpanded ? "rgba(34,197,94,0.1)" : "transparent",
                              }}
                            >
                              <ChevronRight size={10} style={{
                                transition: "transform 0.15s",
                                transform: svcExpanded ? "rotate(90deg)" : "none",
                              }} />
                              {svcExpanded ? `${p.services.length} services` : p.services.join(", ")}
                            </span>
                          )}
                        </div>
                        {/* Expanded service details */}
                        {svcExpanded && p.services?.length > 0 && (
                          <div style={{
                            marginTop: 4, marginLeft: 14, padding: "6px 10px",
                            background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)",
                            fontSize: 10, display: "flex", flexDirection: "column", gap: 3,
                          }}>
                            {p.services.map((svc, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Server size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                <span style={{ fontWeight: 500 }}>{svc}</span>
                                <span style={{ color: "var(--text-muted)", fontSize: 9 }}>
                                  peer {p.hostname || p.id.slice(0, 8)} @ {p.address}:{p.port}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)",
                  }}>
                    <button
                      className="btn btn-sm"
                      disabled={safePage === 0}
                      onClick={() => setPeerPage(safePage - 1)}
                      style={{ fontSize: 11, padding: "3px 10px", opacity: safePage === 0 ? 0.4 : 1 }}
                    >
                      ◀ Prev
                    </button>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Page {safePage + 1} of {totalPages}
                    </span>
                    <button
                      className="btn btn-sm"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setPeerPage(safePage + 1)}
                      style={{ fontSize: 11, padding: "3px 10px", opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Connected Remotes List (paginated) */}
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
          {(() => {
            const totalPages = Math.max(1, Math.ceil(remotes.length / REMOTES_PER_PAGE));
            const safePage = Math.min(remotePage, totalPages - 1);
            const pageRemotes = remotes.slice(safePage * REMOTES_PER_PAGE, (safePage + 1) * REMOTES_PER_PAGE);
            return (
              <>
                {pageRemotes.map(r => (
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
                {totalPages > 1 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    marginTop: 4, paddingTop: 8,
                  }}>
                    <button
                      className="btn btn-sm"
                      disabled={safePage === 0}
                      onClick={() => setRemotePage(safePage - 1)}
                      style={{ fontSize: 11, padding: "3px 10px", opacity: safePage === 0 ? 0.4 : 1 }}
                    >
                      ◀ Prev
                    </button>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Page {safePage + 1} of {totalPages}
                    </span>
                    <button
                      className="btn btn-sm"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setRemotePage(safePage + 1)}
                      style={{ fontSize: 11, padding: "3px 10px", opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );

  /* ─── Runtime Detection Section (compact) ────────────────── */
  const runtimeSection = (
    <div className="provider-config-card" style={{ marginBottom: 20 }}>
      <div
        className="provider-config-header"
        onClick={() => setRuntimesExpanded(!runtimesExpanded)}
        style={{ cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {runtimesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Wrench size={16} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Runtime Detection</span>
          <span className="text-muted-sm" style={{ fontSize: 12, marginLeft: 4 }}>
            ({runtimes.filter(r => r.available).length} found)
          </span>
        </div>
      </div>
      {runtimesExpanded && (
        <div className="provider-config-body" style={{ overflow: "visible" }}>
          {loadingRuntimes ? (
            <div className="loading-pulse"><span /></div>
          ) : runtimes.filter(r => r.available).length === 0 ? (
            <div style={{ padding: "12px 0", fontSize: 12, color: "var(--text-muted)" }}>
              No runtimes detected. Run the dweb desktop app to detect system runtimes.
            </div>
          ) : (
            <div className="runtimes-compact">
              {runtimes.filter(r => r.available).map(r => <RuntimeCard key={r.name} runtime={r} />)}
            </div>
          )}
          {runtimes.filter(r => !r.available).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <List size={12} />
              {runtimes.filter(r => !r.available).map(r => r.name).join(", ")} — not found on this system
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* ─── Services Pill Bar ──────────────────────────────────── */
  const servicesPillBar = (
    <div className="services-pill-bar">
      {loadingServices ? (
        <div className="loading-pulse" style={{ padding: "6px 0" }}><span /></div>
      ) : services.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "6px 0" }}>
          No services yet. <button className="btn btn-link" onClick={() => setShowAddModal(true)}>Add one</button>
        </div>
      ) : (
        <div className="services-pills-wrap">
          {services.map((svc) => (
            <div
              key={svc.name}
              className={`service-pill ${svc.running ? "running" : "stopped"} pill-clickable`}
              onClick={() => setEditService(svc as Service & { dir?: string })}
              title="Click to edit service configuration"
            >
              <span className={`pill-dot ${svc.running ? "live" : "dead"}`} />
              <span className="pill-name">{svc.name}</span>
              <span className="pill-type">{svc.type}</span>
              <span className="pill-port">:{svc.port}</span>
              {(svc as any).dir && (
                <span className="pill-dir" title={(svc as any).dir}>
                  <FolderGit2 size={10} />
                </span>
              )}
              {/* Editable URL */}
              {svc.running && (
                <span className="pill-url" style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>
                  {editingUrlFor === svc.name ? (
                    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                      <input
                        type="text"
                        value={urlEditValue}
                        onChange={(e) => setUrlEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveUrlEdit(svc.name); if (e.key === "Escape") handleCancelUrlEdit(); }}
                        style={{
                          width: 180, fontSize: 10, padding: "1px 4px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 3, color: "var(--text-primary)",
                          outline: "none",
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button className="pill-btn" title="Save"
                        onClick={(e) => { e.stopPropagation(); handleSaveUrlEdit(svc.name); }}
                        style={{ color: "#22c55e" }}>✓</button>
                      <button className="pill-btn" title="Cancel"
                        onClick={(e) => { e.stopPropagation(); handleCancelUrlEdit(); }}
                        style={{ color: "#ef4444" }}>✕</button>
                    </span>
                  ) : (
                    <span
                      className="pill-url-text"
                      onClick={(e) => { e.stopPropagation(); handleStartUrlEdit(svc); }}
                      title="Click to edit URL"
                      style={{ cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.15)" }}
                    >
                      {getServiceUrl(svc).replace(/^https?:\/\//, "")}
                    </span>
                  )}
                </span>
              )}
              {svc.running ? (
                <>
                  {getServiceSourceUrl(svc) && (
                    <button className="pill-btn" title="View HTML Source"
                      onClick={(e) => { e.stopPropagation(); window.open(getServiceSourceUrl(svc)!, '_blank'); }}>
                      <Code size={12} />
                    </button>
                  )}
                  <button className="pill-btn pill-open" title="Open in dweb Browser"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = getServiceUrl(svc);
                      if (onOpenInBrowser) onOpenInBrowser(url);
                      else window.open(url, '_blank');
                    }}>
                    <ExternalLink size={12} />
                  </button>
                  {isDefaultService(svc.name) ? (
                    <span className="pill-badge">built-in</span>
                  ) : (
                    <button className="pill-btn pill-stop" title="Stop"
                      onClick={(e) => { e.stopPropagation(); handleToggleService(svc.name, true); }}>
                      <Square size={12} />
                    </button>
                  )}
                  <span className="pill-badge pill-p2p" title="P2P discoverable">P2P</span>
                </>
              ) : (
                <button className="pill-btn pill-start" title="Start"
                  onClick={(e) => { e.stopPropagation(); handleToggleService(svc.name, false); }}>
                  <Play size={12} />
                </button>
              )}
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
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={async () => {
            try {
              const resp = await fetch("/api/instance/spawn", { method: "POST" });
              const data = await resp.json();
              if (data.status === "ok") {
                setConnectionMsg({ type: "success", text: `Opened new instance on port ${data.port}` });
                window.open(data.url, "_blank");
              } else {
                setConnectionMsg({ type: "error", text: `Failed: ${data.error}` });
              }
            } catch (e) {
              setConnectionMsg({ type: "error", text: `Failed to spawn: ${e}` });
            }
          }}>
            <Plus size={14} /> New Instance
          </button>
          <button className="btn btn-secondary" onClick={async () => {
            loadServices(); loadRuntimes();
            // Refresh peer/network data from working endpoints
            const statusRes = await fetch("/dweb-status").then(r => r.ok ? r.json() : null).catch(() => null);
            if (statusRes) {
              setRelayStatus({
                connected: statusRes.relayConnected,
                relayAddress: statusRes.upstreamRelay || `localhost:${statusRes.relayPort}`,
                error: statusRes.relayError,
                peerId: statusRes.peerId,
                peersOnline: statusRes.peersOnline,
                pendingSignals: 0,
                localIPs: statusRes.localIPs,
              });
            }
            const discoverRes = await fetch("/discover").then(r => r.ok ? r.json() : null).catch(() => null);
            if (discoverRes) {
              const selfId = statusRes?.peerId;
              const filtered = selfId
                ? (discoverRes.peers || []).filter((p: RelayPeer) => p.id !== selfId)
                : (discoverRes.peers || []);
              setDiscoveredPeers(filtered);
            }
          }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Connection notification toast */}
      {connectionMsg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          padding: "10px 16px", borderRadius: "var(--radius-sm)",
          background: connectionMsg.type === "success" ? "rgba(34,197,94,0.15)" : connectionMsg.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
          border: `1px solid ${connectionMsg.type === "success" ? "rgba(34,197,94,0.3)" : connectionMsg.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
          color: connectionMsg.type === "success" ? "#22c55e" : connectionMsg.type === "error" ? "#ef4444" : "#3b82f6",
          fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          cursor: "pointer",
        }} onClick={() => setConnectionMsg(null)}>
          {connectionMsg.type === "success" ? "✓" : connectionMsg.type === "error" ? "✗" : "ℹ"} {connectionMsg.text}
        </div>
      )}

      {networkSection}

      {/* ── Services Bar ── */}
      <div className="services-bar glass">
        <div className="services-bar-top">
          <div className="services-bar-title">
            <Server size={15} />
            <span>Services</span>
            {services.length > 0 && (
              <span className="services-bar-count">
                {services.filter(s => s.running).length}/{services.length} active
              </span>
            )}
          </div>
          <button className="btn btn-primary btn-sm" style={{ height: 28, fontSize: 13, padding: "0 12px", gap: 4 }}
            onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> Add
          </button>
        </div>
        {servicesPillBar}
      </div>

      {showAddModal && (
        <AddServiceModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddService}
        />
      )}
      {editService && (
        <AddServiceModal
          initialData={editService}
          onClose={() => setEditService(null)}
          onAdd={(svc) => {
            handleUpdateService(svc);
            setEditService(null);
          }}
        />
      )}

      {runtimeSection}

      {showConnectModal && (
        <ConnectModal onClose={() => setShowConnectModal(false)} />
      )}
    </div>
  );
}
