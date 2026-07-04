import { useState, useRef, useEffect } from "react";
import {
  Terminal, Loader2, Rocket, ExternalLink, Copy,
  GitBranch, RefreshCw, Play, Trash2, Globe,
  Box, Cpu, History, ChevronDown, ChevronUp,
  Clock, MessageSquare, Sun, Moon, Download,
  PlayCircle,
} from "lucide-react";

/* ─── System Context ────────────────────────────────────
   This gets prepended to every opencode command so opencode
   immediately understands the dweb environment. */
const DWEB_CONTEXT = `You are operating inside **dweb** — a self-hosted P2P dev portal running at http://localhost:19999/. 

ENVIRONMENT:
- Repo: github.com/Awaiswilll/dweb (dev branch)
- Stack: React+Vite+TypeScript frontend, Node.js backend (dweb.cjs)
- Ports: Web IDE=19999, P2P Relay=49736, TCP Proxy=49738
- Default services: My Static Website (/welcome), File Share (/fileshare)
- Project files at: /home/awais/dweb/
- Build: \`npm run build\`, Dev: \`npm run dev\`, Test: \`npm test\`

CAPABILITIES:
- You can BUILD web apps and get them HOSTED at /project/:name
- You can run npm scripts, edit files, explore the repo
- The AI Agent UI is at / (click "AI Agent" in sidebar)
- Quick actions: build, test, status, dev, host, clean

Respond helpfully and concisely.`;

/* ─── Types ────────────────────────────────────────────── */
interface HistoryEntry {
  id: string;
  prompt: string;
  response: string;
  model: string;
  timestamp: number;
}

interface OpenCodeModel {
  id: string; label: string; provider: string; free: boolean;
}

interface OllamaModel {
  name: string; size: number; modified?: string; details?: { family?: string; parameter_size?: string; };
}

interface OllamaStatus {
  installed: boolean; running: boolean; platform: string;
  models: OllamaModel[]; modelCount: number; port: number;
  apiEndpoint: string; suggestedModel: string;
}

/* ─── Quick Actions ─────────────────────────────────────── */
const QUICK_ACTIONS = [
  { id: "build",  label: "Run Build",   icon: <Play size={15} />, prompt: "run npm run build in the dweb repo and fix any errors" },
  { id: "test",   label: "Run Tests",   icon: <RefreshCw size={15} />, prompt: "run npm test in the dweb repo and fix any failures" },
  { id: "status", label: "Repo Status", icon: <GitBranch size={15} />, prompt: "show the current state of the dweb repo, its architecture, branch, recent changes, and what can be built next" },
  { id: "dev",    label: "Dev Setup",   icon: <Cpu size={15} />, prompt: "explain the development setup, hot reload, key files, and how to start developing" },
  { id: "host",   label: "Build & Host",icon: <Globe size={15} />, prompt: "build a simple web application that can be hosted on dweb. Generate complete code files." },
  { id: "clean",  label: "Clean Build", icon: <Trash2 size={15} />, prompt: "clean all build artifacts and rebuild the dweb project from scratch" },
];

/* ─── Storage helpers ──────────────────────────────────── */
const HISTORY_KEY = "dweb-oc-history";
const MODEL_KEY = "dweb-oc-model";
const FONT_SIZE_KEY = "dweb-font-size";

type FontSize = "normal" | "large" | "xlarge";

const FONT_SCALES: Record<FontSize, number> = { normal: 1, large: 1.1, xlarge: 1.25 };

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(h: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50))); } catch {}
}
function loadModel(): string {
  return localStorage.getItem(MODEL_KEY) || "opencode/deepseek-v4-flash-free";
}
function saveModel(m: string) {
  try { localStorage.setItem(MODEL_KEY, m); } catch {}
}
function loadFontSize(): FontSize {
  const v = localStorage.getItem(FONT_SIZE_KEY);
  if (v === "large" || v === "xlarge") return v;
  return "normal";
}
function saveFontSize(s: FontSize) {
  try { localStorage.setItem(FONT_SIZE_KEY, s); } catch {}
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AIAgent() {
  // ── Repo context ──
  const [repoInfo, setRepoInfo] = useState<{ repo: string; branch: string; commit: string; files: number } | null>(null);

  // ── Opencode ──
  const [ocAvailable, setOcAvailable] = useState<boolean | null>(null);
  const [ocVersion, setOcVersion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [activeModel, setActiveModel] = useState(loadModel);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  // ── Models ──
  const [models, setModels] = useState<OpenCodeModel[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // ── History ──
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  // ── Ollama (local AI) ──
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [showOllama, setShowOllama] = useState(false);
  const [useOllama, setUseOllama] = useState(false);
  const [ollamaModel, setOllamaModel] = useState("qwen2.5-coder:7b");
  const [ollamaActionMsg, setOllamaActionMsg] = useState("");

  // ── User preferences ──
  const [fontSize, setFontSize] = useState<FontSize>(loadFontSize);

  // ── Published projects ──
  const [published, setPublished] = useState<{ name: string; url: string; route: string }[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Apply font-size scale to root
  useEffect(() => {
    const scale = FONT_SCALES[fontSize];
    document.documentElement.style.setProperty("--dweb-font-scale", String(scale));
    // Also bump body font-size directly for elements that don't use CSS vars
    document.body.style.fontSize = `${13 * scale}px`;
  }, [fontSize]);

  // Auto-scroll output
  useEffect(() => {
    if (showOutput && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, showOutput]);

  // On mount: load everything + send system context to opencode
  useEffect(() => {
    fetch("/api/repo/status").then(r => r.json()).then(d => { if (d.status === "ok") setRepoInfo(d); }).catch(() => {});
    fetch("/api/opencode/status").then(r => r.json()).then(d => { setOcAvailable(d.available); setOcVersion(d.version || ""); }).catch(() => setOcAvailable(false));
    fetch("/api/opencode/models").then(r => r.json()).then(d => { if (d.status === "ok") setModels(d.models || []); }).catch(() => {});
    fetch("/api/projects").then(r => r.json()).then(d => { if (d.status === "ok" && d.projects) setPublished(d.projects); }).catch(() => {});

    // Auto-send system context to warm up the agent
    if (!sessionStorage.getItem("dweb-context-sent")) {
      sessionStorage.setItem("dweb-context-sent", "1");
      fetch("/api/opencode/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: DWEB_CONTEXT, model: activeModel, context: true }),
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fetch Ollama status ── */
  const fetchOllamaStatus = async () => {
    setOllamaLoading(true);
    try {
      const resp = await fetch("/api/ollama/status");
      const data = await resp.json();
      if (data.status === "ok") {
        setOllamaStatus(data);
        // Auto-hide the action message after success
        if (data.installed) setOllamaActionMsg("");
      }
    } catch {}
    setOllamaLoading(false);
  };

  // Fetch on mount & poll when panel is open
  useEffect(() => {
    fetchOllamaStatus();
    const interval = setInterval(fetchOllamaStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  /* ── Install Ollama ── */
  const handleInstallOllama = async () => {
    setOllamaActionMsg("Installing Ollama...");
    try {
      const resp = await fetch("/api/ollama/install", { method: "POST" });
      const data = await resp.json();
      setOllamaActionMsg(data.message || data.error || "Done");
      await fetchOllamaStatus();
    } catch (e) {
      setOllamaActionMsg(`Error: ${e}`);
    }
  };

  /* ── Start Ollama ── */
  const handleStartOllama = async () => {
    setOllamaActionMsg("Starting Ollama...");
    try {
      const resp = await fetch("/api/ollama/start", { method: "POST" });
      const data = await resp.json();
      setOllamaActionMsg(data.message || data.error || "Done");
      await fetchOllamaStatus();
    } catch (e) {
      setOllamaActionMsg(`Error: ${e}`);
    }
  };

  /* ── Pull Ollama model ── */
  const handlePullOllamaModel = async () => {
    setOllamaActionMsg(`Pulling ${ollamaModel}...`);
    try {
      const resp = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ollamaModel }),
      });
      const data = await resp.json();
      setOllamaActionMsg(data.message || data.error || "Done");
      // Poll for model list changes
      setTimeout(fetchOllamaStatus, 5000);
    } catch (e) {
      setOllamaActionMsg(`Error: ${e}`);
    }
  };

  /* ── Toggle Ollama mode ── */
  const handleToggleOllama = () => {
    setUseOllama(prev => !prev);
  };

  /* ── Cycle font size ── */
  const cycleFontSize = () => {
    const sizes: FontSize[] = ["normal", "large", "xlarge"];
    const idx = sizes.indexOf(fontSize);
    const next = sizes[(idx + 1) % sizes.length];
    setFontSize(next);
    saveFontSize(next);
  };

  /* ── Run opencode prompt (with hidden system context) ── */
  const handleRun = async (customPrompt?: string) => {
    const userCmd = (customPrompt || prompt).trim();
    if (!userCmd) return;
    // Prepend system context so opencode understands the environment
    const fullCmd = `${DWEB_CONTEXT}\n\nUSER REQUEST:\n${userCmd}`;
    setCurrentPrompt(userCmd);
    setOutput("");
    setShowOutput(true);
    setRunning(true);
    setPrompt("");
    setShowHistory(false);
    setShowModelPicker(false);
    try {
      const resp = await fetch("/api/opencode/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: fullCmd,
          model: useOllama ? `ollama/${ollamaModel}` : activeModel,
          useOllama,
        }),
      });
      const data = await resp.json();
      const text = data.output || "(no output)";
      const display = data.status === "error"
        ? `⚠️ Command failed:\n\n${text}`
        : text;

      setOutput(display);

      // Save to history
      const entry: HistoryEntry = {
        id: genId(),
        prompt: userCmd,
        response: text,
        model: activeModel,
        timestamp: Date.now(),
      };
      setHistory(prev => {
        const next = [entry, ...prev];
        saveHistory(next);
        return next;
      });
    } catch (e) {
      setOutput(`❌ Network error: ${e}`);
    }
    setRunning(false);
  };

  /* ── Re-run a history entry ── */
  const handleReRun = (entry: HistoryEntry) => {
    setActiveModel(entry.model);
    saveModel(entry.model);
    setPrompt(entry.prompt);
    handleRun(entry.prompt);
  };

  /* ── Load history entry into prompt ── */
  const handleLoadPrompt = (entry: HistoryEntry) => {
    setPrompt(entry.prompt);
    setShowHistory(false);
  };

  /* ── Clear history ── */
  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  /* ── Quick action ── */
  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    handleRun(action.prompt);
  };

  /* ── Handle Enter key ── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleRun();
    }
  };

  /* ── Select model ── */
  const handleSelectModel = (model: OpenCodeModel) => {
    setActiveModel(model.id);
    saveModel(model.id);
    setShowModelPicker(false);
  };

  /* ── Publish last output ── */
  const handlePublish = async () => {
    if (!output.trim()) return;
    setPublishing(true);
    const codeBlocks = output.match(/```[\s\S]*?```/g) || [];
    const files = codeBlocks.map((block, i) => {
      const lines = block.split("\n");
      const header = lines[0].replace("```", "").trim();
      const lang = header.split(" ")[0] || "txt";
      const content = lines.slice(1, -1).join("\n");
      const ext: Record<string, string> = {
        javascript: "js", js: "js", typescript: "ts", ts: "ts",
        html: "html", css: "css", python: "py", py: "py",
        jsx: "jsx", tsx: "tsx", json: "json", yaml: "yaml", yml: "yml",
        markdown: "md", md: "md", bash: "sh", sh: "sh",
      };
      return { path: `file_${i + 1}.${ext[lang] || "txt"}`, content, language: lang };
    });
    if (files.length === 0) {
      setOutput(prev => prev + "\n\n---\n⚠ No code blocks found in the output.");
      setPublishing(false);
      return;
    }
    try {
      const projectName = `app-${Date.now().toString(36)}`;
      const resp = await fetch("/api/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, type: "Web App", files }),
      });
      const data = await resp.json();
      if (data.status === "ok") {
        setPublished(prev => [{ name: projectName, url: data.url, route: data.project.route }, ...prev]);
        setOutput(prev => prev + `\n\n---\n✅ Published → ${data.url}`);
      } else {
        setOutput(prev => prev + `\n\n---\n❌ Publish failed: ${data.error}`);
      }
    } catch (e) {
      setOutput(prev => prev + `\n\n---\n❌ Publish error: ${e}`);
    }
    setPublishing(false);
  };

  /* ── Copy output to clipboard ── */
  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      // brief visual feedback
      const btn = document.getElementById("copy-output-btn");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = ""; }, 1200); }
    } catch {}
  };

  /* ── Clear output ── */
  const handleClear = () => { setOutput(""); setShowOutput(false); };

  /* ── Categorize models for display ── */
  const freeModels = models.filter(m => m.free);
  const proModels = models.filter(m => !m.free);

  const scale = FONT_SCALES[fontSize];

  /* ── Inline font-size helper ── */
  const fs = (px: number) => `${Math.round(px * scale)}px`;

  /* ── Render ── */
  return (
    <div className="view-container ai-agent-view" style={{ fontSize: fs(14) }}>
      {/* ─── HEADER ─────────────────────────────────────── */}
      <div className="view-header" style={{ paddingBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Terminal size={22} style={{ color: "var(--accent-blue)" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: fs(18) }}>dweb Opencode Agent</h2>
            <p className="text-muted-sm" style={{ margin: 0, fontSize: fs(12), display: "flex", alignItems: "center", gap: 6 }}>
              <GitBranch size={12} />
              {repoInfo ? `${repoInfo.repo} / ${repoInfo.branch} · ${repoInfo.commit} · ${repoInfo.files} files` : "Loading repo..."}
            </p>
          </div>
        </div>
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Font size toggle */}
          <button className="btn btn-icon btn-sm" onClick={cycleFontSize}
            title={`Font size: ${fontSize}`}
            style={{ position: "relative" }}>
            {fontSize === "xlarge" ? <Sun size={15} /> : <Moon size={15} />}
            <span style={{
              position: "absolute", top: -2, right: -2,
              fontSize: 8, background: "var(--accent-blue)",
              borderRadius: "50%", width: 12, height: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, color: "#fff",
            }}>
              {fontSize === "normal" ? "1" : fontSize === "large" ? "2" : "3"}
            </span>
          </button>

          {/* Model selector */}
          <div style={{ position: "relative" }}>
            <button className="btn btn-sm" onClick={() => setShowModelPicker(!showModelPicker)}
              style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: fs(12),
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                color: activeModel.includes("free") ? "#22c55e" : "#818cf8",
              }}>
              <Cpu size={13} />
              {activeModel.split("/").pop()?.replace(/-/g, " ") || "model"}
              {showModelPicker ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showModelPicker && (
              <div className="glass-sm" style={{
                position: "absolute", top: "100%", right: 0, zIndex: 100,
                width: 340, maxHeight: 400, overflow: "auto",
                marginTop: 4, padding: 8, borderRadius: "var(--radius-sm)",
                fontSize: fs(13),
              }}>
                {/* Free models */}
                <div style={{ fontSize: fs(11), fontWeight: 600, color: "#22c55e", marginBottom: 4, paddingLeft: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                  Free Models ({freeModels.length})
                </div>
                {freeModels.map(m => (
                  <div key={m.id} onClick={() => handleSelectModel(m)}
                    style={{
                      padding: "7px 10px", borderRadius: 4, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      background: activeModel === m.id ? "rgba(34,197,94,0.1)" : "transparent",
                      color: activeModel === m.id ? "#22c55e" : "var(--text-primary)",
                    }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: fs(13) }}>{m.label}</div>
                      <div style={{ fontSize: fs(11), color: "var(--text-muted)" }}>{m.provider}</div>
                    </div>
                    {activeModel === m.id && <span style={{ fontSize: fs(11), color: "#22c55e" }}>active</span>}
                  </div>
                ))}
                {/* Pro/Paid models */}
                {proModels.length > 0 && (
                  <>
                    <div style={{ fontSize: fs(11), fontWeight: 600, color: "#818cf8", marginTop: 8, marginBottom: 4, paddingLeft: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                      Pro Models ({proModels.length})
                    </div>
                    {proModels.map(m => (
                      <div key={m.id} onClick={() => handleSelectModel(m)}
                        style={{
                          padding: "7px 10px", borderRadius: 4, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 8,
                          background: activeModel === m.id ? "rgba(129,140,248,0.1)" : "transparent",
                          color: activeModel === m.id ? "#818cf8" : "var(--text-primary)",
                          opacity: 0.7,
                        }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: fs(13) }}>{m.label}</div>
                          <div style={{ fontSize: fs(11), color: "var(--text-muted)" }}>{m.provider}</div>
                        </div>
                        {activeModel === m.id && <span style={{ fontSize: fs(11), color: "#818cf8" }}>active</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Opencode status */}
          <div className="glass-sm" style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: fs(12),
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: ocAvailable === null ? "#6b7280" : ocAvailable ? "#22c55e" : "#ef4444",
            }} />
            <span>opencode</span>
            {ocAvailable === true && <span style={{ color: "#22c55e", fontSize: fs(11) }}>v{ocVersion}</span>}
          </div>

          {/* Ollama toggle */}
          <div style={{ position: "relative" }}>
            <button className="btn btn-sm" onClick={() => setShowOllama(!showOllama)}
              title="Local AI (Ollama)"
              style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: fs(12),
                background: useOllama
                  ? "rgba(34,197,94,0.15)"
                  : ollamaStatus?.installed
                    ? "rgba(99,102,241,0.1)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  useOllama
                    ? "rgba(34,197,94,0.3)"
                    : ollamaStatus?.installed
                      ? "rgba(99,102,241,0.2)"
                      : "rgba(255,255,255,0.08)"
                }`,
                color: useOllama ? "#22c55e" : "var(--text-primary)",
              }}>
              <Cpu size={13} />
              <span>{useOllama ? "Ollama ON" : "Ollama"}</span>
              {ollamaLoading ? (
                <Loader2 size={11} className="spin" />
              ) : (
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: !ollamaStatus ? "#6b7280"
                    : ollamaStatus.running ? "#22c55e"
                    : ollamaStatus.installed ? "#f59e0b"
                    : "#6b7280",
                  flexShrink: 0,
                }} />
              )}
              {showOllama ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showOllama && (
              <div className="glass-sm" style={{
                position: "absolute", top: "100%", right: 0, zIndex: 100,
                width: 320, marginTop: 4, padding: 10, borderRadius: "var(--radius-sm)",
                fontSize: fs(12),
              }}>
                {/* Status line */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    <Cpu size={14} /> Local AI (Ollama)
                  </span>
                  <span style={{
                    fontSize: fs(11), padding: "2px 8px", borderRadius: 10,
                    background: !ollamaStatus ? "rgba(107,114,128,0.2)" : "transparent",
                    color: !ollamaStatus ? "#6b7280"
                      : ollamaStatus.running ? "#22c55e"
                      : ollamaStatus.installed ? "#f59e0b"
                      : "#6b7280",
                  }}>
                    {!ollamaStatus ? "Checking..."
                      : ollamaStatus.running ? "Running"
                      : ollamaStatus.installed ? "Stopped"
                      : "Not installed"}
                  </span>
                </div>

                {/* Platform info */}
                {ollamaStatus && (
                  <div style={{ fontSize: fs(11), color: "var(--text-muted)", marginBottom: 8 }}>
                    Platform: {ollamaStatus.platform} · Port: {ollamaStatus.port}
                    {ollamaStatus.modelCount > 0 && ` · ${ollamaStatus.modelCount} model${ollamaStatus.modelCount !== 1 ? "s" : ""} loaded`}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  {!ollamaStatus?.installed && (
                    <button className="btn btn-sm" onClick={handleInstallOllama}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: fs(11), padding: "4px 10px",
                        background: "rgba(99,102,241,0.15)",
                        border: "1px solid rgba(99,102,241,0.25)",
                      }}>
                      <Download size={12} /> Install
                    </button>
                  )}
                  {ollamaStatus?.installed && !ollamaStatus?.running && (
                    <button className="btn btn-sm" onClick={handleStartOllama}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: fs(11), padding: "4px 10px",
                        background: "rgba(34,197,94,0.15)",
                        border: "1px solid rgba(34,197,94,0.25)",
                        color: "#22c55e",
                      }}>
                      <PlayCircle size={12} /> Start
                    </button>
                  )}
                  {ollamaStatus?.running && (
                    <>
                      <button className="btn btn-sm" onClick={handlePullOllamaModel}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          fontSize: fs(11), padding: "4px 10px",
                          background: "rgba(245,158,11,0.15)",
                          border: "1px solid rgba(245,158,11,0.25)",
                          color: "#f59e0b",
                        }}>
                        <Download size={12} /> Pull Model
                      </button>
                      <label style={{
                        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                        fontSize: fs(11), padding: "4px 8px",
                        color: useOllama ? "#22c55e" : "var(--text-muted)",
                      }}>
                        <input type="checkbox" checked={useOllama} onChange={handleToggleOllama}
                          style={{ accentColor: "#22c55e" }} />
                        Use for prompts
                      </label>
                    </>
                  )}
                </div>

                {/* Model selector (when running) */}
                {ollamaStatus?.running && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <select value={ollamaModel} onChange={e => setOllamaModel(e.target.value)}
                      style={{
                        flex: 1, padding: "4px 6px", fontSize: fs(11),
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}>
                      <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (recommended)</option>
                      <option value="qwen2.5-coder:1.5b">qwen2.5-coder:1.5b (faster)</option>
                      <option value="qwen2.5:7b">qwen2.5:7b</option>
                      <option value="llama3.2:3b">llama3.2:3b</option>
                      <option value="llama3.2:1b">llama3.2:1b (fastest)</option>
                      <option value="codellama:7b">codellama:7b</option>
                      <option value="deepseek-coder:6.7b">deepseek-coder:6.7b</option>
                      <option value="mistral:7b">mistral:7b</option>
                      {ollamaStatus.models.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                    {ollamaStatus.modelCount > 0 && (
                      <span style={{ fontSize: fs(10), color: "var(--text-muted)" }}>
                        +{ollamaStatus.models.length} local
                      </span>
                    )}
                  </div>
                )}

                {/* Action status message */}
                {ollamaActionMsg && (
                  <div style={{
                    marginTop: 6, padding: "4px 8px", borderRadius: "var(--radius-sm)",
                    fontSize: fs(11), background: "rgba(255,255,255,0.04)",
                    color: ollamaActionMsg.startsWith("Error") ? "#ef4444" : "#22c55e",
                    wordBreak: "break-word",
                  }}>
                    {ollamaActionMsg}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* History toggle */}
          <button className="btn btn-icon btn-sm" onClick={() => setShowHistory(!showHistory)}
            title="Conversation history">
            <History size={16} />
          </button>
        </div>
      </div>

      {/* ─── HISTORY PANEL ──────────────────────────────── */}
      {showHistory && (
        <div className="glass-sm" style={{
          marginBottom: 8, padding: 8, borderRadius: "var(--radius-sm)",
          maxHeight: 320, overflow: "auto",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 6, fontSize: fs(12), color: "var(--text-muted)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <History size={13} /> Conversation History ({history.length})
            </span>
            {history.length > 0 && (
              <button onClick={handleClearHistory} style={{
                background: "none", border: "none", color: "#ef4444", cursor: "pointer",
                fontSize: fs(11), padding: "2px 6px",
              }}>
                Clear all
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: fs(12), color: "var(--text-muted)", fontStyle: "italic", padding: "8px 4px" }}>
              No history yet. Run a prompt to get started.
            </div>
          ) : (
            history.map(entry => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "7px 8px", borderRadius: 4, cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
                onClick={() => handleLoadPrompt(entry)}
              >
                <MessageSquare size={13} style={{ marginTop: 3, flexShrink: 0, color: "var(--text-muted)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: fs(13), fontWeight: 500, whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {entry.prompt}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, marginTop: 2,
                    fontSize: fs(11), color: "var(--text-muted)",
                  }}>
                    <Clock size={11} /> {formatTime(entry.timestamp)}
                    <span style={{ color: entry.model.includes("free") ? "#22c55e" : "#818cf8" }}>
                      {entry.model.split("/").pop()?.slice(0, 22)}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); handleReRun(entry); }}
                      style={{
                        background: "none", border: "none", color: "var(--accent-blue)",
                        cursor: "pointer", fontSize: fs(11), padding: 0,
                      }}>
                      Re-run
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── QUICK ACTIONS ──────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
        {QUICK_ACTIONS.map(action => (
          <button key={action.id} className="btn btn-sm" onClick={() => handleQuickAction(action)} disabled={running}
            style={{
              padding: "5px 12px", fontSize: fs(12), cursor: "pointer",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
            {action.icon} {action.label}
          </button>
        ))}
      </div>

      {/* ─── PROMPT INPUT ───────────────────────────────── */}
      <div className="glass-sm" style={{ marginBottom: 8, padding: 10, borderRadius: "var(--radius-sm)" }}>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask opencode to build, fix, or explore... e.g. 'build a React todo app with Express backend'"
          disabled={running} rows={3}
          style={{
            width: "100%", resize: "vertical",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontFamily: "inherit", fontSize: fs(14),
            outline: "none", boxSizing: "border-box",
          }}
        />
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginTop: 8, gap: 8,
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn btn-sm btn-primary" onClick={() => handleRun()}
              disabled={running || !prompt.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: fs(13) }}>
              {running ? <Loader2 size={15} className="spin" /> : <Terminal size={15} />}
              {running ? "Running..." : "Run in opencode"}
            </button>
            {output && (
              <>
                <button className="btn btn-sm btn-secondary" onClick={handleClear}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: fs(13) }}>
                  <Trash2 size={15} /> Clear
                </button>
                <button className="btn btn-sm" onClick={handlePublish} disabled={publishing}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: fs(13),
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e",
                  }}>
                  {publishing ? <Loader2 size={15} className="spin" /> : <Rocket size={15} />}
                  {publishing ? "Publishing..." : "Host on dweb"}
                </button>
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: fs(11), color: activeModel.includes("free") ? "#22c55e" : "#818cf8" }}>
              <Cpu size={11} style={{ display: "inline", marginRight: 2 }} />
              {activeModel.split("/").pop()?.replace(/-/g, " ") || "model"}
            </span>
            <span style={{ fontSize: fs(11), color: "var(--text-muted)" }}>
              {running ? "Running..." : prompt.length > 0 ? `${prompt.length}c` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ─── OUTPUT ─────────────────────────────────────── */}
      {showOutput && (
        <div className="glass-sm" style={{ marginBottom: 8, borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 12px",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            fontSize: fs(12), color: "var(--text-muted)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Terminal size={13} />
              {currentPrompt.slice(0, 60)}{currentPrompt.length > 60 ? "..." : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{output.length} bytes</span>
              {output && (
                <button id="copy-output-btn" onClick={handleCopyOutput}
                  title="Copy output to clipboard"
                  style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                    fontSize: fs(11), padding: "2px 6px", borderRadius: 3,
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseOut={e => { e.currentTarget.style.background = "none"; }}>
                  <Copy size={12} />
                </button>
              )}
            </div>
          </div>
          <div ref={outputRef} style={{
            maxHeight: 420, overflow: "auto",
            padding: 14,
            fontFamily: "'Courier New', monospace",
            fontSize: fs(13), lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            color: output.startsWith("⚠") || output.startsWith("❌") ? "#ef4444" : "#22c55e",
          }}>
            {running && !output ? (
              <span style={{ color: "#6b7280" }}>Running opencode...</span>
            ) : output ? output : (
              <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                No output yet. Type a prompt and click "Run in opencode".
              </span>
            )}
            {running && <span className="blink" style={{ marginLeft: 4 }}>▌</span>}
          </div>
        </div>
      )}

      {/* ─── PUBLISHED PROJECTS ─────────────────────────── */}
      {published.length > 0 && (
        <div className="glass-sm" style={{ padding: 10, borderRadius: "var(--radius-sm)" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5, marginBottom: 6,
            fontSize: fs(12), color: "var(--text-muted)",
          }}>
            <Rocket size={14} />
            <span style={{ fontWeight: 600 }}>Hosted on dweb</span>
            <span>({published.length})</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {published.map(p => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener"
                className="glass-sm" style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "5px 10px", borderRadius: "var(--radius-sm)",
                  fontSize: fs(12), color: "#22c55e", textDecoration: "none",
                  border: "1px solid rgba(34,197,94,0.15)",
                }}>
                <Box size={12} />
                {p.name.length > 25 ? p.name.slice(0, 22) + "..." : p.name}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
