import { useState, useEffect, useRef } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  Terminal, Code, GitBranch, Globe, Server, Play, Square,
  Plus, RefreshCw, CheckCircle2, FolderGit2,
  ExternalLink, Wrench, Wifi, WifiOff,
  Link2, Unlink, Shield, Monitor, Radio, Users,
  ChevronDown, ChevronRight, List, Save, Activity, Copy,
} from "lucide-react";
import type { Service, P2PNetworkStatus } from "../types";
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
  if (svc.url) return svc.url;
  // For running services with a specific port, point directly to the service's own server
  if (svc.running && svc.port) {
    return `${window.location.origin}/service-proxy/${svc.port}`;
  }
  // Default fallback for built-in pages
  if (svc.name === "My Static Website") return `${window.location.origin}/welcome`;
  if (svc.name === "File Share") return `${window.location.origin}/fileshare`;
  return `${window.location.origin}/welcome`;
}

function getServiceSourceUrl(svc: Service): string | null {
  // For running services, fetch the actual rendered page from the service's own server
  // so the user edits the real content
  if (svc.running && svc.port) {
    return getServiceUrl(svc);
  }
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
  const [showNetworkExpanded, setShowNetworkExpanded] = useState(false);
  const [editingUrlFor, setEditingUrlFor] = useState<string | null>(null);
  const [urlEditValue, setUrlEditValue] = useState("");
  const [previewService, setPreviewService] = useState<Service | null>(null);
  const [previewTab, setPreviewTab] = useState<"preview" | "source" | "customize">("preview");
  const [customizeSource, setCustomizeSource] = useState("");
  const [customizeLoading, setCustomizeLoading] = useState(false);
  const [customizeSaving, setCustomizeSaving] = useState(false);
  const [domainRegistering, setDomainRegistering] = useState(false);
  const [serviceVersion, setServiceVersion] = useState(0);

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
      // Auto-start managed services if not already running
      try {
        const resp = await fetch(`${window.location.origin}/api/services`);
        const data = await resp.json();
        const serviceMap = new Map<string, any>((data?.services || []).map((s: any) => [s.name, s] as [string, any]));

        const defaults = [
          { name: "My Static Website", type: "Static Site", port: 30999 },
          { name: "File Share", type: "File Browser", port: 30998 },
        ];

        for (const def of defaults) {
          if (!serviceMap.has(def.name)) {
            const startResp = await fetch(`${window.location.origin}/api/service/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(def),
            });
            if (startResp.ok) {
              const svcData = await startResp.json();
              if (svcData?.service) {
                setServices(prev => {
                  const next = prev.map(s =>
                    s.name === def.name
                      ? { ...s, port: svcData.service.port, running: true, url: svcData.service.url || `http://localhost:${svcData.service.port}` }
                      : s
                  );
                  try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
                  return next;
                });
              }
            }
          } else {
            const managed = serviceMap.get(def.name);
            if (managed) {
              setServices(prev => {
                const next = prev.map(s =>
                  s.name === def.name
                    ? { ...s, port: managed.port, url: `http://localhost:${managed.port}` }
                    : s
                );
                try { localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(next)); } catch {}
                return next;
              });
            }
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
  const [showServices, setShowServices] = useState(false);
  const [advancedStatus, setAdvancedStatus] = useState<P2PNetworkStatus | null>(null);
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
        // Also populate advancedStatus so P2P Connections info grid
        // has data immediately when expanded
        setAdvancedStatus(statusData);
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
      const [statusData] = await Promise.all([
        fetch("/dweb-status").then(r => r.ok ? r.json() : null).catch(() => null) as Promise<P2PNetworkStatus | null>,
      ]);
      if (!mounted) return;
      if (statusData) setAdvancedStatus(statusData);
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

  const handleAcceptConnection = (sig: string) => {
    const newRemote: RemoteInstance = {
      id: uid(),
      name: `Remote (${sig})`,
      address: sig,
      peerId: `accepted_${uid()}`,
      status: "connected",
      mode: onlineMode === "local" ? "p2p-visible" : onlineMode,
      latency: Math.floor(Math.random() * 60) + 10,
      lastSeen: Date.now(),
      services: [],
    };
    setRemotes(prev => [...prev, newRemote]);
    setIncomingSignals(prev => prev.filter(s => s !== sig));
    setConnectionMsg({ type: "success", text: `Accepted connection from ${sig}` });
  };

  const handleRejectConnection = (sig: string) => {
    setIncomingSignals(prev => prev.filter(s => s !== sig));
    setConnectionMsg({ type: "info", text: `Rejected connection from ${sig}` });
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

  /* ─── Network Section (collapsible) ──────────────────────── */
  const networkSection = (
    <div style={{ marginBottom: 20 }}>
      {/* Pulse beacon keyframes */}
      <style>{`
@keyframes pulse-beacon {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(1.35); }
}
`}</style>
      {/* ── Collapsible Network Bar ── */}
      <div className={showNetworkExpanded ? "glossy-card" : "glass-sm"} style={{
        borderRadius: "var(--radius-sm)", overflow: "hidden",
        border: showNetworkExpanded ? "1px solid var(--border)" : "1px solid transparent",
        padding: 0,
      }}>
        {/* ── Header (always visible) ── */}
        <div
          onClick={() => setShowNetworkExpanded(!showNetworkExpanded)}
          className="glossy-header"
          style={{ cursor: "pointer", userSelect: "none", padding: "8px 14px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", transition: "transform 0.15s", transform: showNetworkExpanded ? "rotate(90deg)" : "none" }}>
              <ChevronRight size={14} />
            </span>
            <Globe size={14} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Network</span>
            {/* Pulse beacon + instance count */}
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
              title={`${totalInstances} total dweb instance(s) — 1 (this device) + ${discoveredPeers.length} discovered + ${uniqueConnectedRemotes.length} connected remote(s)${!networkAvailable ? " (no network)" : ""}`}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: networkAvailable ? "#22c55e" : "#6b7280",
                boxShadow: networkAvailable ? "0 0 6px rgba(34,197,94,0.6)" : "none",
                animation: networkAvailable ? "pulse-beacon 2s infinite" : "none",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {totalInstances}
              </span>
            </span>
          </div>

          {/* Network info in header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 5, fontSize: 12 }}>
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
        {/* Uptime — moved from cards to upper status bar */}
        {advancedStatus && (
          <>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text)" }}
              title={`Server uptime: ${formatUptime(advancedStatus.uptime)}`}>
              <Activity size={14} />
              <strong>{formatUptime(advancedStatus.uptime)}</strong>
            </span>
          </>
        )}
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
        </div>

        {/* ── ALWAYS VISIBLE: Peer ID capsule + Quick action tabs ── */}
        <div style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 13,
        }}>
          {/* Peer ID Capsule */}
          <span
            onClick={() => {
              const id = relayStatus?.peerId || advancedStatus?.peerId || "";
              if (id) navigator.clipboard.writeText(id).catch(() => {});
            }}
            title={`${relayStatus?.peerId || advancedStatus?.peerId || "Peer ID"} — click to copy`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 24,
              background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))",
              border: "1px solid rgba(139,92,246,0.35)",
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 13,
              fontWeight: 600,
              color: "#c4b5fd",
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 500,
              transition: "background 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.background = "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))"}
            onMouseOut={e => e.currentTarget.style.background = "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))"}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: relayStatus?.connected ? "#22c55e" : "#6b7280",
              boxShadow: relayStatus?.connected ? "0 0 8px rgba(34,197,94,0.6)" : "none",
              flexShrink: 0,
            }} />
            <Copy size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
            {relayStatus?.peerId || advancedStatus?.peerId || "connecting..."}
          </span>

          {/* Mode Tabs + Tor + Connect */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {/* Online Mode Switcher */}
            <div className="glossy-card" style={{ display: "flex", borderRadius: "var(--radius-sm)", overflow: "hidden", padding: 0, gap: 0 }}>
              {(["local", "p2p-visible", "p2p-anonymous"] as OnlineMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setOnlineMode(m)}
                  style={{
                    padding: "4px 10px",
                    border: "none",
                    background: onlineMode === m ? modeColor[m] : "transparent",
                    color: onlineMode === m ? "#fff" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: onlineMode === m ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
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
            {/* Tor toggle */}
            {torStatus !== null && (
              <button
                onClick={handleTorToggle}
                disabled={!torStatus.installed || togglingTor}
                style={{
                  padding: "4px 10px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: torStatus.running ? "#7c3aed" : "transparent",
                  color: torStatus.running ? "#fff" : "var(--text-muted)",
                  cursor: torStatus.installed ? "pointer" : "not-allowed",
                  fontSize: 11,
                  fontWeight: torStatus.running ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
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
                <Shield size={11} />
                {togglingTor ? "..." : "Tor"}
                {torStatus.installed && (
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: torStatus.running ? "#a78bfa" : "#6b7280",
                    marginLeft: 1,
                  }} />
                )}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowConnectModal(true)}
              style={{ fontSize: 11, padding: "4px 10px", height: "auto" }}>
              <Link2 size={11} /> Connect
            </button>
          </div>
        </div>

        {/* Collapsed summary (when not expanded) */}
        {!showNetworkExpanded && advancedStatus && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
            {discoveredPeers.length} peer(s) · {uniqueConnectedRemotes.length} connected
          </span>
        )}

        {/* ── Expanded content ── */}
        {showNetworkExpanded && (
        <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--border)", fontSize: 13 }}>
          {/* No repeated status bar — all status info visible in the header above */}
        </div>
      )}
      </div>
    </div>
  );
  const p2pSection = (
      <div className={showAdvancedDetails ? "glossy-card" : "glass-sm"} style={{
        borderRadius: "var(--radius-sm)", marginBottom: 10, overflow: "hidden",
        border: showAdvancedDetails ? "1px solid var(--border)" : "1px solid transparent",
        padding: 0,
      }}>
        {/* ── Header bar: info + Register always visible ── */}
        <div
          onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
          className="glossy-header"
          style={{
            cursor: "pointer", userSelect: "none", padding: "8px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", transition: "transform 0.15s", transform: showAdvancedDetails ? "rotate(90deg)" : "none" }}>
              <ChevronRight size={14} />
            </span>
            <Activity size={14} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>P2P Connections</span>
          </div>

          {/* Network info + Register inline in header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12 }}>
            <span><span style={{ color: "var(--text-muted)" }}>Peer ID</span> <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>{advancedStatus?.peerId || "—"}</code></span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span><span style={{ color: "var(--text-muted)" }}>Port</span> <strong>{advancedStatus?.port || "—"}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span><span style={{ color: "var(--text-muted)" }}>Relay</span> <strong>{advancedStatus?.relayPort || "—"}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span><span style={{ color: "var(--text-muted)" }}>Mode</span> <strong>{advancedStatus?.mode || "—"}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span><span style={{ color: "var(--text-muted)" }}>IPs</span> <strong>{(advancedStatus?.localIPs || []).join(", ") || "—"}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span><span style={{ color: "var(--text-muted)" }}>Platform</span> <strong>{advancedStatus?.platform || advancedStatus?.hostname || "—"}</strong></span>

            {/* Register Peer button */}
            <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto", height: 24, fontSize: 11, padding: "0 10px" }}
              onClick={(e) => {
                e.stopPropagation();
                fetch("/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: `peer-${Date.now()}`,
                    address: `${window.location.hostname}:${window.location.port}`,
                    publicKey: "auto-registered",
                  }),
                }).then(r => r.json()).then(d => {
                  if (d.status === "ok") setConnectionMsg({ type: "success", text: `Peer registered: ${d.peerId}` });
                }).catch(e => setConnectionMsg({ type: "error", text: `Registration failed: ${e}` }));
              }}>
              <Wifi size={10} /> Register
            </button>
            {/* Refresh button */}
            <button className="btn btn-secondary btn-sm" style={{ height: 24, fontSize: 11, padding: "0 10px" }}
              onClick={(e) => {
                e.stopPropagation();
                fetch("/dweb-status").then(r => r.ok && r.json()).then(d => d && setAdvancedStatus(d)).catch(() => {});
              }} disabled={advancedRefreshing}>
              <RefreshCw size={10} className={advancedRefreshing ? "spin" : ""} />
            </button>
            {/* New Instance button */}
            <button className="btn btn-secondary btn-sm" style={{ height: 24, fontSize: 11, padding: "0 10px" }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const resp = await fetch("/api/instance/spawn", { method: "POST" });
                  const data = await resp.json();
                  if (data.status === "ok") {
                    setConnectionMsg({ type: "success", text: `Opened new instance on port ${data.port}` });
                    window.open(data.url, "_blank");
                  } else {
                    setConnectionMsg({ type: "error", text: `Failed: ${data.error}` });
                  }
                } catch (err) {
                  setConnectionMsg({ type: "error", text: `Failed to spawn: ${err}` });
                }
              }}>
              <Plus size={10} /> New Instance
            </button>

            {!showAdvancedDetails && advancedStatus && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
                {discoveredPeers.length} peer(s) · {uniqueConnectedRemotes.length} connected
              </span>
            )}
          </div>
        </div>

        {/* ── Expanded content: parallel columns ── */}
        {showAdvancedDetails && (
          <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--border)", fontSize: 13 }}>

            {/* ── Incoming Requests (full width if any) ── */}
            {incomingSignals.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Users size={12} /> Incoming Requests ({incomingSignals.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {incomingSignals.map((sig, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "6px 10px", borderRadius: "var(--radius-sm)",
                      background: "rgba(139,92,246,0.1)", fontSize: 11, border: "1px solid rgba(139,92,246,0.2)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Users size={12} style={{ color: "#8b5cf6" }} />
                        <span>Connection request from <strong>{sig}</strong></span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => handleAcceptConnection(sig)}
                          style={{ fontSize: 10, color: "#22c55e", padding: "2px 10px" }}>Accept</button>
                        <button className="btn btn-sm" onClick={() => handleRejectConnection(sig)}
                          style={{ fontSize: 10, color: "#ef4444", padding: "2px 10px" }}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Parallel columns: Discoverable Peers | Connected Remotes ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

              {/* ── LEFT: Discoverable Peers ── */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Radio size={12} /> Discoverable Peers ({discoveredPeers.length})
                </div>
                {discoveredPeers.length === 0 ? (
                  <div style={{ padding: "8px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 10 }}>
                    No peers discovered yet. Click <strong>Refresh</strong> to scan.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(discoveredPeers.length / PEERS_PER_PAGE));
                      const safePage = Math.min(peerPage, totalPages - 1);
                      const pagePeers = discoveredPeers.slice(safePage * PEERS_PER_PAGE, (safePage + 1) * PEERS_PER_PAGE);
                      return (
                        <>
                          {pagePeers.map(p => {
                            const svcExpanded = expandedServices.has(p.id);
                            return (
                              <div key={p.id} style={{ padding: "3px 0" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                                  <span style={{ fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {p.hostname || p.id.slice(0, 12)}
                                  </span>
                                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{p.address}:{p.port}</span>
                                  {p.services?.length > 0 && (
                                    <span onClick={() => {
                                      setExpandedServices(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; });
                                    }} style={{ color: "var(--text-muted)", fontSize: 10, cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
                                      <ChevronRight size={8} style={{ transition: "transform 0.15s", transform: svcExpanded ? "rotate(90deg)" : "none" }} />
                                      {p.services.length}
                                    </span>
                                  )}
                                  <button className="btn btn-sm" onClick={() => {
                                    handleConnectDirect(`${p.address}:${p.port}`, p.hostname || p.id);
                                    sendRelaySignal(p.id, "offer").catch(() => {});
                                  }} title="Send connection request"
                                    style={{ fontSize: 10, padding: "1px 6px", color: "#22c55e" }}>
                                    <Link2 size={8} />
                                  </button>
                                </div>
                                {svcExpanded && p.services?.length > 0 && (
                                  <div style={{ marginLeft: 14, marginTop: 2, padding: "3px 6px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", fontSize: 9, display: "flex", flexDirection: "column", gap: 2 }}>
                                    {p.services.map((svc, i) => (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <Server size={8} style={{ color: "var(--text-muted)" }} />
                                        <span>{svc}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {totalPages > 1 && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--border-subtle)" }}>
                              <button className="btn btn-sm" disabled={safePage === 0}
                                onClick={() => setPeerPage(safePage - 1)}
                                style={{ fontSize: 9, padding: "1px 6px", opacity: safePage === 0 ? 0.4 : 1 }}>◀ Prev</button>
                              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{safePage + 1}/{totalPages}</span>
                              <button className="btn btn-sm" disabled={safePage >= totalPages - 1}
                                onClick={() => setPeerPage(safePage + 1)}
                                style={{ fontSize: 9, padding: "1px 6px", opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}>Next ▶</button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── RIGHT: Connected Remotes ── */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Link2 size={12} /> Connected Remotes ({remotes.length})
                </div>
                {remotes.length === 0 ? (
                  <div style={{ padding: "8px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                    No remote instances. Send a <strong>Request</strong> to a peer.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 320, overflowY: "auto" }}>
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(remotes.length / REMOTES_PER_PAGE));
                      const safePage = Math.min(remotePage, totalPages - 1);
                      const pageRemotes = remotes.slice(safePage * REMOTES_PER_PAGE, (safePage + 1) * REMOTES_PER_PAGE);
                      return (
                        <>
                          {pageRemotes.map(r => (
                            <div key={r.id} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "5px 8px", borderRadius: "var(--radius-sm)", fontSize: 11,
                              background: r.status === "connected" ? "rgba(34,197,94,0.05)" : "transparent",
                              border: r.status === "connected" ? "1px solid rgba(34,197,94,0.15)" : "1px solid transparent",
                            }}>
                              <span style={{
                                width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                                background: r.status === "connected" ? "#22c55e" : r.status === "connecting" ? "#eab308" : r.status === "error" ? "#ef4444" : "#6b7280",
                                boxShadow: r.status === "connected" ? "0 0 3px rgba(34,197,94,0.4)" : "none",
                              }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                                  <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 4, background: r.mode === "p2p-visible" ? "rgba(34,197,94,0.15)" : "rgba(139,92,246,0.15)", color: r.mode === "p2p-visible" ? "#22c55e" : "#8b5cf6", fontWeight: 500 }}>
                                    {r.mode === "p2p-visible" ? "Vis" : r.mode === "p2p-anonymous" ? "Anon" : "Relay"}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                                  <span>{r.address}</span>
                                  {r.status === "connected" && <span style={{ color: "#22c55e" }}>· {r.latency}ms</span>}
                                  {r.status === "disconnected" && <span style={{ color: "#6b7280" }}>· Offline</span>}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                                {r.status === "disconnected" ? (
                                  <button className="btn btn-icon btn-sm" onClick={() => handleConnectDirect(r.address, r.name)}
                                    title="Reconnect" style={{ color: "#22c55e" }}><Link2 size={10} /></button>
                                ) : (
                                  <button className="btn btn-icon btn-sm" onClick={() => handleDisconnectRemote(r.id)}
                                    title="Disconnect" style={{ color: "#ef4444" }}><Unlink size={10} /></button>
                                )}
                                <button className="btn btn-icon btn-sm" onClick={() => handleRemoveRemote(r.id)}
                                  title="Remove" style={{ color: "var(--text-muted)" }}>✕</button>
                              </div>
                            </div>
                          ))}
                          {totalPages > 1 && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--border-subtle)" }}>
                              <button className="btn btn-sm" disabled={safePage === 0}
                                onClick={() => setRemotePage(safePage - 1)}
                                style={{ fontSize: 9, padding: "1px 6px", opacity: safePage === 0 ? 0.4 : 1 }}>◀ Prev</button>
                              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{safePage + 1}/{totalPages}</span>
                              <button className="btn btn-sm" disabled={safePage >= totalPages - 1}
                                onClick={() => setRemotePage(safePage + 1)}
                                style={{ fontSize: 9, padding: "1px 6px", opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}>Next ▶</button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
  );

  /* ─── Runtime Detection Section (compact) ────────────────── */
  const runtimeSection = (
    <div className="glossy-card provider-config-card" style={{ marginBottom: 20, padding: 0 }}>
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
              onClick={() => {
                if (svc.running) {
                  setPreviewService(svc);
                  setPreviewTab("preview");
                } else {
                  setEditService(svc as Service & { dir?: string });
                }
              }}
              title={svc.running ? "Click to preview this service" : "Click to edit service configuration"}
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

  /* ─── Service Preview Modal ────────────────────────────── */
  const servicePreviewModal = previewService ? (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setPreviewService(null); }}
    >
      <div className="glass" style={{
        width: 760, maxWidth: "100%", maxHeight: "90vh",
        padding: 0, borderRadius: "var(--radius-lg)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={15} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{previewService.name}</span>
            <span className="pill-port">:{previewService.port}</span>
            {isDefaultService(previewService.name) && (
              <span className="pill-badge">built-in</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-sm" style={{ height: 26, fontSize: 11, padding: "0 10px" }}
              onClick={() => { window.open(getServiceUrl(previewService), '_blank'); }}>
              <ExternalLink size={11} /> Open
            </button>
            <button className="btn btn-primary btn-sm" style={{ height: 26, fontSize: 11, padding: "0 10px" }}
              onClick={() => setPreviewService(null)}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {(["preview", "source", "customize"] as const).map(tab => (
            <button key={tab}
              onClick={() => {
                setPreviewTab(tab);
                if (tab === "source" || tab === "customize") {
                  setCustomizeLoading(true);
                  const srcUrl = getServiceSourceUrl(previewService);
                  if (srcUrl) {
                    fetch(srcUrl).then(r => r.text()).then(html => {
                      setCustomizeSource(html);
                      setCustomizeLoading(false);
                    }).catch(() => {
                      setCustomizeSource("<!-- Failed to load source -->");
                      setCustomizeLoading(false);
                    });
                  } else {
                    setCustomizeSource("<!-- No source URL available for this service -->");
                    setCustomizeLoading(false);
                  }
                }
              }}
              style={{
                flex: 1, padding: "10px 16px", border: "none", cursor: "pointer",
                background: previewTab === tab ? "rgba(59,130,246,0.1)" : "transparent",
                color: previewTab === tab ? "var(--accent-blue)" : "var(--text-muted)",
                fontWeight: previewTab === tab ? 600 : 400, fontSize: 12,
                borderBottom: previewTab === tab ? "2px solid var(--accent-blue)" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {tab === "preview" ? "👁 Preview" : tab === "source" ? "📄 Source" : "✏️ Customize"}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {previewTab === "preview" && (
            <iframe
              key={`preview-${previewService.name}-${serviceVersion}`}
              src={getServiceUrl(previewService)}
              style={{ width: "100%", height: 500, border: "none", display: "block", background: "#fff" }}
              title={`${previewService.name} preview`}
              sandbox="allow-scripts allow-same-origin"
            />
          )}
          {previewTab === "source" && (
            <div style={{ padding: 16 }}>
              {customizeLoading ? (
                <div className="loading-pulse" style={{ padding: "20px 0" }}><span /></div>
              ) : (
                <pre style={{
                  fontSize: 11, lineHeight: 1.5, overflow: "auto", maxHeight: 440,
                  background: "rgba(0,0,0,0.3)", padding: 12, borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>{customizeSource}</pre>
              )}
            </div>
          )}
          {previewTab === "customize" && (
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                Edit the HTML source below and save to update this service's page.
              </p>
              {customizeLoading ? (
                <div className="loading-pulse" style={{ padding: "20px 0" }}><span /></div>
              ) : (
                <>
                  <textarea
                    value={customizeSource}
                    onChange={(e) => setCustomizeSource(e.target.value)}
                    style={{
                      width: "100%", height: 360, fontSize: 11, fontFamily: "'Courier New', monospace",
                      background: "rgba(0,0,0,0.3)", color: "var(--text-primary)",
                      border: "1px solid rgba(255,255,255,0.1)", borderRadius: "var(--radius-sm)",
                      padding: 12, resize: "vertical", outline: "none",
                    }}
                    spellCheck={false}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => setPreviewService(null)}
                      style={{ height: 28, fontSize: 11, padding: "0 14px" }}>
                      Cancel
                    </button>
                    <button className="btn btn-primary btn-sm"
                      disabled={customizeSaving}
                      onClick={async () => {
                        setCustomizeSaving(true);
                        try {
                          const resp = await fetch("/api/service/customize", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: previewService.name, content: customizeSource }),
                          });
                          const data = await resp.json();
                          if (data.status === "ok") {
                            setConnectionMsg({ type: "success", text: `"${previewService.name}" page updated!` });
                            setServiceVersion(v => v + 1);
                            setPreviewTab("preview");
                          } else {
                            setConnectionMsg({ type: "error", text: data.error || "Save failed" });
                          }
                        } catch (err: any) {
                          setConnectionMsg({ type: "error", text: `Save failed: ${err.message}` });
                        }
                        setCustomizeSaving(false);
                      }}
                      style={{ height: 28, fontSize: 11, padding: "0 14px" }}>
                      {customizeSaving ? "Saving..." : "💾 Save Changes"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div style={{
          display: "flex", gap: 8, padding: "10px 16px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Service URL: <code style={{ fontSize: 10 }}>{getServiceUrl(previewService)}</code>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-sm"
              disabled={domainRegistering}
              onClick={async () => {
                setDomainRegistering(true);
                try {
                  const domainName = previewService.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "my-service";
                  // Register domain
                  const regResp = await fetch("/api/domain/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: domainName, tier: "free" }),
                  });
                  const regData = await regResp.json();
                  if (regResp.ok || regResp.status === 409) {
                    // Already exists or created — bind it
                    const bindResp = await fetch("/api/domain/bind", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: domainName, service_name: previewService.name }),
                    });
                    const bindData = await bindResp.json();
                    if (bindResp.ok) {
                      setConnectionMsg({ type: "success", text: `✨ Hosted at https://${domainName}.dweb !` });
                    } else {
                      setConnectionMsg({ type: "error", text: bindData.error || "Bind failed" });
                    }
                  } else {
                    setConnectionMsg({ type: "error", text: regData.error || "Registration failed" });
                  }
                } catch (err: any) {
                  setConnectionMsg({ type: "error", text: `Domain error: ${err.message}` });
                }
                setDomainRegistering(false);
              }}
              style={{ height: 28, fontSize: 11, padding: "0 12px" }}>
              <Globe size={11} /> {domainRegistering ? "Claiming..." : "Host on .dweb"}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  /* ─── Render ────────────────────────────────────────────── */
  return (
    <div className="view-container dashboard">
      <div className="view-header">
      </div>

      {/* Connection notification toast */}
      {connectionMsg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          padding: "10px 16px", borderRadius: "var(--radius-sm)",
          background: connectionMsg.type === "success" ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08))" : connectionMsg.type === "error" ? "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.08))" : "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.08))",
          border: `1px solid ${connectionMsg.type === "success" ? "rgba(34,197,94,0.3)" : connectionMsg.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
          color: connectionMsg.type === "success" ? "#22c55e" : connectionMsg.type === "error" ? "#ef4444" : "#3b82f6",
          fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          cursor: "pointer",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }} onClick={() => setConnectionMsg(null)}>
          {connectionMsg.type === "success" ? "✓" : connectionMsg.type === "error" ? "✗" : "ℹ"} {connectionMsg.text}
        </div>
      )}

      {networkSection}

      {p2pSection}

      {/* ── Services Bar (collapsible) ── */}
      <div className={"glossy-card"} style={{
        overflow: "hidden",
        marginBottom: 20,
        padding: "12px 16px",
        border: showServices ? "1px solid var(--border)" : "1px solid transparent",
      }}>
        <div
          onClick={() => setShowServices(!showServices)}
          className="services-bar-top"
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          <div className="services-bar-title">
            <span style={{ display: "flex", transition: "transform 0.15s", transform: showServices ? "rotate(90deg)" : "none", marginRight: 4 }}>
              <ChevronRight size={14} />
            </span>
            <Server size={15} />
            <span>Services</span>
            {services.length > 0 && (
              <span className="services-bar-count">
                {services.filter(s => s.running).length}/{services.length} active
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn btn-primary btn-sm" style={{ height: 28, fontSize: 13, padding: "0 12px", gap: 4 }}
              onClick={(e) => { e.stopPropagation(); setShowAddModal(true); }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
        {showServices && servicesPillBar}
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

      {servicePreviewModal}
    </div>
  );
}
