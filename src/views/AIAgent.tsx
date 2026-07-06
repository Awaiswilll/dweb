import { useState, useRef, useEffect } from "react";
import {
  Terminal, Loader2, Rocket, ExternalLink, Copy,
  GitBranch, RefreshCw, Play, Trash2, Globe,
  Box, Cpu, History, ChevronDown, ChevronUp,
  Clock, MessageSquare, Sun, Moon, Download,
  PlayCircle, Square,
} from "lucide-react";

/* ─── System Context ────────────────────────────────────
   This gets prepended to every opencode command so opencode
   immediately understands the dweb environment. */
const DWEB_CONTEXT = `You are operating inside **dweb** — a self-hosted P2P dev portal running at http://localhost:49737/. 

ENVIRONMENT:
- Repo: github.com/Awaiswilll/dweb (dev branch)
- Stack: React+Vite+TypeScript frontend, Node.js backend (dweb.cjs)
- Ports: HTTP=49737, P2P Relay=49736, TCP Proxy=49738
- Project files at: /home/awais/dweb/
- Build: \`npm run build\`, Dev: \`npm run dev\`, Test: \`npm test\`

CAPABILITIES:
- You can BUILD web apps and get them HOSTED at /project/:name
- You can MANAGE SERVICES: GET /api/services to list, POST /api/service/start to start, POST /api/service/stop to stop
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
  isWSL?: boolean; detectedVia?: string | null; recommended?: boolean;
  models: OllamaModel[]; modelCount: number; port: number;
  apiEndpoint: string; suggestedModel: string;
}

/* ─── Quick Actions ─────────────────────────────────────── */
const QUICK_ACTIONS = [
  { id: "hello-dweb", label: "Hello dweb", icon: <Globe size={15} />, prompt: "INSTANT_PUBLISH" },
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
const SESSION_KEY = "dweb-oc-session"; // Persisted across tab switches within SPA

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
  const eventSourceRef = useRef<EventSource | null>(null);

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

  // ── Connect to SSE stream for a session ────────────────
  const connectSSE = useRef<(sessionId: string, userCmd: string) => void>(null);

  // On mount: load everything + reconnect to active session if any
  useEffect(() => {
    fetch("/api/repo/status").then(r => r.json()).then(d => { if (d.status === "ok") setRepoInfo(d); }).catch(() => {});
    fetch("/api/opencode/status").then(r => r.json()).then(d => { setOcAvailable(d.available); setOcVersion(d.version || ""); }).catch(() => setOcAvailable(false));
    fetch("/api/opencode/models").then(r => r.json()).then(d => { if (d.status === "ok") setModels(d.models || []); }).catch(() => {});
    fetch("/api/projects").then(r => r.json()).then(d => { if (d.status === "ok" && d.projects) setPublished(d.projects); }).catch(() => {});

    // ── Reconnect to active session (survive tab switches) ──
    const savedSessionId = sessionStorage.getItem(SESSION_KEY);
    if (savedSessionId) {
      fetch(`/api/opencode/session/${savedSessionId}`)
        .then(r => r.json())
        .then(data => {
          if (data.status === "ok" && data.session) {
            const s = data.session;
            setOutput(s.output || "");
            setShowOutput(true);
            setCurrentPrompt(s.command || "");
            setRunning(s.running);
            if (s.running) {
              // Session still running — reconnect to SSE stream
              const cmd = s.command || "";
              connectSSE.current?.(savedSessionId, cmd);
            } else {
              // Session already finished — stored for reference
              sessionStorage.removeItem(SESSION_KEY);
            }
          } else {
            sessionStorage.removeItem(SESSION_KEY);
          }
        })
        .catch(() => sessionStorage.removeItem(SESSION_KEY));
    }

    // Cleanup EventSource on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
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
        // Auto-enable Ollama mode when running and not already set
        if (data.running) {
          setUseOllama(prev => prev === false ? true : prev);
        }
      }
    } catch {}
    setOllamaLoading(false);
  };

  // Fetch on mount & poll only when the Ollama panel is open
  useEffect(() => {
    if (!showOllama) return;
    fetchOllamaStatus();
    const interval = setInterval(fetchOllamaStatus, 8000);
    return () => clearInterval(interval);
  }, [showOllama]);

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

  /* ── Connect to SSE stream for a session ──────────────── */
  const doConnectSSE = (sessionId: string, userCmd: string) => {
    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource(`/api/opencode/session-stream/${sessionId}`);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      // SSE connection established
    });

    es.addEventListener("output", (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.text) {
          setOutput(prev => prev + parsed.text + "\n");
        }
      } catch {}
    });

    es.addEventListener("done", (event: MessageEvent) => {
      try {
        const evtData = JSON.parse(event.data);
        // event data has final output, error, duration
        // We re-fetch from server for the exact full output
        fetch(`/api/opencode/session/${sessionId}`)
          .then(r => r.json())
          .then(d => {
            const finalOutput = d.session?.output || evtData.output || "";
            // Save to history
            const entry: HistoryEntry = {
              id: genId(),
              prompt: userCmd,
              response: finalOutput,
              model: activeModel,
              timestamp: Date.now(),
            };
            setHistory(prev => {
              const next = [entry, ...prev];
              saveHistory(next);
              return next;
            });
            setOutput(finalOutput);
            setRunning(false);
          })
          .catch(() => {
            setRunning(false);
          });
      } catch {
        setRunning(false);
      }
      es.close();
      eventSourceRef.current = null;
      sessionStorage.removeItem(SESSION_KEY);
    });

    es.addEventListener("error", (event: Event) => {
      // EventSource auto-reconnects; only handle when we get error data
      try {
        const msgEvent = event as MessageEvent;
        const parsed = JSON.parse(msgEvent.data || "{}");
        if (parsed.error) {
          setOutput(prev => prev + `\n❌ ${parsed.error}`);
          setRunning(false);
          es.close();
          eventSourceRef.current = null;
          sessionStorage.removeItem(SESSION_KEY);
        }
      } catch {}
    });
  };

  // Store connectSSE in ref so useEffect can call it
  connectSSE.current = doConnectSSE;

  /* ── Run opencode prompt via streaming SSE ────────────── */
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
      // 1. Create a streaming session
      const resp = await fetch("/api/opencode/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: fullCmd,
          model: useOllama ? `ollama/${ollamaModel}` : activeModel,
          useOllama,
        }),
      });
      const data = await resp.json();

      if (data.status !== "ok" || !data.sessionId) {
        setOutput(`⚠️ Failed to start session: ${data.error || "unknown error"}`);
        setRunning(false);
        return;
      }

      // 2. Store session ID so it survives tab switches
      sessionStorage.setItem(SESSION_KEY, data.sessionId);

      // 3. Connect to SSE stream for live output
      doConnectSSE(data.sessionId, userCmd);
    } catch (e) {
      setOutput(`❌ Network error: ${e}`);
      setRunning(false);
    }
  };

  /* ── Stop running session ── */
  const handleStop = async () => {
    const sessionId = sessionStorage.getItem(SESSION_KEY);
    if (sessionId) {
      try {
        await fetch(`/api/opencode/session/${sessionId}/cancel`, { method: "POST" });
      } catch {}
    }
    // Close EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setRunning(false);
    setOutput(prev => prev + "\n\n❌ Cancelled by user");
    sessionStorage.removeItem(SESSION_KEY);
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
    if (action.prompt === "INSTANT_PUBLISH") {
      handleGlobalHost();
    } else {
      handleRun(action.prompt);
    }
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

  /* ── Instant Global Host (hello-dweb) ── */
  const handleGlobalHost = async () => {
    setRunning(true);
    setShowOutput(true);
    setCurrentPrompt("Publishing hello-dweb with global .dweb domain...");
    setOutput("🚀 Initializing global hosting for hello-dweb...\n");

    try {
      // 1. Read the pre-built hello-dweb files from the server
      setOutput(prev => prev + "📂 Reading hello-dweb project files...\n");
      const filesResp = await fetch("/project/hello-dweb/index.html");
      const aboutResp = await fetch("/project/hello-dweb/about.html");
      const cssResp = await fetch("/project/hello-dweb/style.css");

      if (!filesResp.ok) {
        setOutput(prev => prev + "❌ hello-dweb project not found. Build it first via opencode.\n");
        setRunning(false);
        return;
      }

      const indexHtml = await filesResp.text();
      const aboutHtml = aboutResp.ok ? await aboutResp.text() : "";
      const styleCss = cssResp.ok ? await cssResp.text() : "";

      // 2. Publish with auto_domain=true (triggers server-side domain auto-assignment)
      setOutput(prev => prev + "📡 Publishing to dweb with auto-domain assignment...\n");
      const files = [
        { path: "index.html", content: indexHtml },
        { path: "about.html", content: aboutHtml },
        { path: "style.css", content: styleCss },
      ];

      const pubResp = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "hello-dweb",
          type: "Static Site",
          files,
          auto_domain: true,
        }),
      });

      const pubData = await pubResp.json();
      if (pubData.status !== "ok") {
        setOutput(prev => prev + `❌ Publish failed: ${pubData.error || "unknown"}\n`);
        setRunning(false);
        return;
      }

      // 3. Build the result display
      const localUrl = pubData.url;
      const domainInfo = pubData.domain;
      let resultMsg = `\n✅ hello-dweb published successfully!\n`;
      resultMsg += `   Local URL: ${localUrl}\n`;

      if (domainInfo) {
        resultMsg += `\n🌐 GLOBAL DOMAIN: ${domainInfo.url}\n`;
        resultMsg += `   Domain: ${domainInfo.name}\n`;
        resultMsg += `   Status: ${domainInfo.auto_registered ? "Auto-registered (Free tier, 90d)" : "Already registered"}\n`;
        resultMsg += `\n🔗 Other dweb users can access: ${domainInfo.url}\n`;
      } else {
        resultMsg += `\n⚠  No .dweb domain assigned. Register one in the Domains tab.\n`;
      }

      // 4. Update published list
      setPublished(prev => [{
        name: "hello-dweb",
        url: localUrl,
        route: pubData.project?.route || "/project/hello-dweb",
      }, ...prev.filter(p => p.name !== "hello-dweb")]);

      setOutput(prev => prev + resultMsg);
    } catch (e: any) {
      setOutput(prev => prev + `\n❌ Error: ${e.message || e}\n`);
    }
    setRunning(false);
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

                {/* Platform & detection info */}
                {ollamaStatus && (
                  <div style={{ fontSize: fs(11), color: "var(--text-muted)", marginBottom: 8 }}>
                    <div>Platform: {ollamaStatus.platform}{ollamaStatus.isWSL ? " (WSL)" : ""}</div>
                    <div>Port: {ollamaStatus.port}</div>
                    {ollamaStatus.detectedVia && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <span style={{
                          display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                          background: ollamaStatus.running ? "#22c55e" : "#6b7280",
                        }} />
                        Detected via: <strong>{ollamaStatus.detectedVia}</strong>
                        {ollamaStatus.detectedVia === "wsl-host" && (
                          <span style={{ fontSize: fs(10) }}>(Windows host Ollama)</span>
                        )}
                        {ollamaStatus.detectedVia === "docker" && (
                          <span style={{ fontSize: fs(10) }}>(Docker container)</span>
                        )}
                        {ollamaStatus.detectedVia === "native" && (
                          <span style={{ fontSize: fs(10) }}>(same machine)</span>
                        )}
                      </div>
                    )}
                    {ollamaStatus.modelCount > 0 && (
                      <div>{ollamaStatus.modelCount} model{ollamaStatus.modelCount !== 1 ? "s" : ""} loaded</div>
                    )}
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
        {QUICK_ACTIONS.map(action => {
          const isDweb = action.id === "hello-dweb";
          const isHost = action.id === "host";
          return (
            <button key={action.id} className="btn btn-sm" onClick={() => handleQuickAction(action)} disabled={running}
              style={{
                padding: isDweb ? "5px 16px" : "5px 12px",
                fontSize: fs(isDweb ? 13 : 12),
                cursor: "pointer",
                background: isDweb ? "rgba(34,197,94,0.12)" : isHost ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
                border: isDweb ? "1px solid rgba(34,197,94,0.3)" : isHost ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: "var(--radius-sm)",
                color: isDweb ? "#22c55e" : isHost ? "#818cf8" : "var(--text-primary)",
                display: "flex", alignItems: "center", gap: 5,
                fontWeight: isDweb ? 600 : 400,
              }}>
              {action.icon} {action.label}
            </button>
          );
        })}
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
            {running ? (
              <button className="btn btn-sm btn-danger" onClick={handleStop}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: fs(13) }}>
                <Square size={15} /> Stop
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => handleRun()}
                disabled={!prompt.trim()}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: fs(13) }}>
                <Terminal size={15} /> Run in opencode
              </button>
            )}
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
