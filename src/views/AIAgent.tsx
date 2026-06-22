import { useState, useRef, useEffect, useCallback } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  Bot, Send, Code, Server, Database, Globe, CheckCircle2,
  Circle, Loader2, BookOpen, FolderOpen, Settings2,
  Sparkles, Trash2, Plus, ChevronLeft, ChevronRight,
  Layers, Pencil, PanelLeftClose, PanelLeft,
} from "lucide-react";
import type { Template, AIProviderConfig, AIModelInfo, StreamToken, AISession } from "../types";
import {
  AI_PROVIDER_LABELS, AI_PROVIDER_COLORS, AI_PROVIDER_ICONS,
  RUNTIME_OPTIONS, FRONTEND_OPTIONS, BACKEND_OPTIONS, DATABASE_OPTIONS, CSS_OPTIONS,
} from "../types";

/* ─── Direct Ollama Browser Helpers (non-Tauri fallback) ───── */

/** Call Ollama /api/generate from the browser directly (non-streaming) */
async function directOllamaGenerate(
  model: string,
  prompt: string,
  format: string | null,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
    options: { temperature: 0.2 },
  };
  if (format === "json") body.format = "json";

  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Ollama error (${resp.status}): ${errText || "Is Ollama running on localhost:11434?"}`);
  }
  const data = await resp.json();
  return data.response || "";
}

/** Call Ollama /api/generate with streaming from the browser directly.
 *  Calls onToken(token, done) for each token received. */
async function directOllamaStream(
  model: string,
  prompt: string,
  format: string | null,
  onToken: (token: string, done: boolean) => void,
): Promise<void> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: true,
    options: { temperature: 0.2 },
  };
  if (format === "json") body.format = "json";

  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Ollama error (${resp.status}): ${errText || "Is Ollama running on localhost:11434?"}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Response body not readable — try a different browser");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed);
        const token = data.response || "";
        const isDone = data.done === true;
        onToken(token, isDone);
        if (isDone) return;
      } catch {
        // skip partial/invalid JSON lines
      }
    }
  }
  onToken("", true);
}

/* ─── Templates ──────────────────────────────────────────── */
const TEMPLATES: Template[] = [
  { id: "t1", name: "React Blog", description: "Static blog with React, Markdown, and RSS", stack: "Node.js + React", icon: "⚛️", color: "#61dafb" },
  { id: "t2", name: "FastAPI CRUD", description: "REST API with Python FastAPI + PostgreSQL", stack: "Python + FastAPI", icon: "🐍", color: "#4CAF50" },
  { id: "t3", name: "PHP Dashboard", description: "Admin dashboard with PHP, MySQL, Chart.js", stack: "PHP + MySQL", icon: "🐘", color: "#8892BF" },
  { id: "t4", name: "Go Microservice", description: "Lightweight API gateway with Go + Redis", stack: "Go + Redis", icon: "🔵", color: "#00ADD8" },
  { id: "t5", name: "Ruby on Rails", description: "Full-stack app with Rails, PostgreSQL, Hotwire", stack: "Ruby + Rails", icon: "💎", color: "#CC0000" },
  { id: "t6", name: "Node API + React", description: "Full-stack SPA with Express, React, MongoDB", stack: "Node.js + React", icon: "🟢", color: "#68A063" },
  { id: "t7", name: "Python + React", description: "Data dashboard with Python, React, PostgreSQL", stack: "Python + React", icon: "📊", color: "#FF6F00" },
  { id: "t8", name: "Static Site", description: "Simple HTML/CSS/JS site, zero dependencies", stack: "Static", icon: "📄", color: "#9E9E9E" },
];

/* ─── Pipeline Steps ──────────────────────────────────────── */
const PIPELINE_STEPS = [
  { id: "analyze", label: "Analyze Request", icon: <Bot size={16} /> },
  { id: "scaffold", label: "Scaffold Project", icon: <FolderOpen size={16} /> },
  { id: "generate", label: "Generate Code", icon: <Code size={16} /> },
  { id: "database", label: "Configure Database", icon: <Database size={16} /> },
  { id: "install", label: "Install Dependencies", icon: <Loader2 size={16} /> },
  { id: "start", label: "Start Server", icon: <Server size={16} /> },
  { id: "publish", label: "Publish to dweb", icon: <Globe size={16} /> },
];

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  step?: string;
  streaming?: boolean;
}

/* ─── Session helpers ─────────────────────────────────────── */
const STORAGE_KEY = "dweb-ai-sessions";

function loadSessions(): AISession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: AISession[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
}

function newSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createNewSession(provider: string, model: string): AISession {
  const now = Date.now();
  return {
    id: newSessionId(),
    label: `Chat ${new Date(now).toLocaleDateString()} ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    created: now,
    updated: now,
    provider,
    model,
    messages: [],
    summary: "",
  };
}

const WELCOME_MSG: Message = {
  role: "assistant",
  content: "Hi! I'm your dweb AI build agent. Type a request below or pick a template to get started.",
  timestamp: Date.now(),
};

export default function AIAgent() {
  const [messages, setMessages] = useState<Message[]>([{ ...WELCOME_MSG }]);
  const [input, setInput] = useState("");
  const [building, setBuilding] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showTemplates, setShowTemplates] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");

  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [activeProvider, setActiveProvider] = useState("ollama");
  const [activeModel, setActiveModel] = useState("qwen2.5-coder:7b");
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(true);

  const [sessions, setSessions] = useState<AISession[]>(() => {
    const stored = loadSessions();
    if (stored.length > 0) return stored;
    return [createNewSession("ollama", "qwen2.5-coder:7b")];
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const stored = loadSessions();
    if (stored.length > 0) {
      const sorted = [...stored].sort((a, b) => b.updated - a.updated);
      return sorted[0].id;
    }
    return null;
  });
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Fast mode: uses a lightweight model for simple queries
  const [fastMode, setFastMode] = useState(false);
  const [jsonFormat, setJsonFormat] = useState(false);

  /** Map each provider to its fastest available model */
  const getFastModel = useCallback((provider: string): string => {
    const map: Record<string, string> = {
      ollama: "qwen2.5-coder:1.5b",
      openai: "gpt-4o-mini",
      anthropic: "claude-3-haiku-latest",
      google: "gemini-2.0-flash",
      together: "",  // keep current if no fast model
      groq: "llama-3.1-8b-instant",
      openrouter: "google/gemini-2.0-flash-001",
    };
    return map[provider] || "";
  }, []);

  /** Classify current model's speed based on its id/name */
  const getModelSpeed = useCallback((modelId: string): "fast" | "balanced" | "powerful" | null => {
    const id = modelId.toLowerCase();
    if (id.includes("1.5b") || id.includes("3b") || id.includes("mini") || id.includes("haiku") || id.includes("flash") || id.includes("turbo") || id.includes("instant") || id.includes("3.5")) return "fast";
    if (id.includes("7b") || id.includes("8b") || id.includes("9b") || id.includes("6.7b")) return "balanced";
    if (id.includes("32b") || id.includes("70b") || id.includes("34b") || id.includes("22b") || id.includes("4o") && !id.includes("mini") || id.includes("opus") || id.includes("pro") && !id.includes("1.5-flash")) return "powerful";
    return null;
  }, []);

  const [showCustomStack, setShowCustomStack] = useState(false);
  const [stackRuntime, setStackRuntime] = useState("node");
  const [stackFrontend, setStackFrontend] = useState("react");
  const [stackBackend, setStackBackend] = useState("express");
  const [stackDatabase, setStackDatabase] = useState("postgresql");
  const [stackCss, setStackCss] = useState("tailwind");
  const [stackDescription, setStackDescription] = useState("");

  const chatEnd = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // On mount, load most recent session messages if stored sessions exist
  useEffect(() => {
    const stored = loadSessions();
    if (stored.length > 0 && activeSessionId) {
      const session = stored.find(s => s.id === activeSessionId);
      if (session && session.messages.length > 0) {
        setMessages(session.messages.map(m => ({ ...m, streaming: false })));
        if (session.provider) setActiveProvider(session.provider);
        if (session.model) setActiveModel(session.model);
      }
    }
  }, []);

  // Load providers and active config on mount
  useEffect(() => {
    setProvidersLoading(true);
    invoke<AIProviderConfig[]>("get_ai_providers")
      .then(data => {
        setProviders(data);
        const enabled = data.filter(p => p.enabled);
        if (enabled.length > 0 && !enabled.find(p => p.provider_type === activeProvider)) {
          setActiveProvider(enabled[0].provider_type);
          if (enabled[0].default_model) setActiveModel(enabled[0].default_model);
        }
      })
      .catch(() => {
        setProviders([
          { provider_type: "ollama", enabled: true, label: "Ollama (Local)", api_key: null, base_url: "http://localhost:11434", default_model: "qwen2.5-coder:7b", temperature: 0.2, max_tokens: 8192 },
          { provider_type: "openai", enabled: false, label: "OpenAI", api_key: null, base_url: "https://api.openai.com/v1", default_model: "gpt-4o", temperature: 0.3, max_tokens: 16384 },
        ]);
      })
      .finally(() => setProvidersLoading(false));

    invoke<[string, string]>("get_active_ai")
      .then(([p, m]) => { setActiveProvider(p); setActiveModel(m); })
      .catch(() => {});
  }, []);

  // Load models when provider changes
  useEffect(() => {
    if (activeProvider) {
      setModelsLoading(true);
      invoke<AIModelInfo[]>("get_ai_models", { providerType: activeProvider })
        .then(data => {
          setModels(data);
          if (data.length > 0 && !data.find(m => m.id === activeModel)) {
            setActiveModel(data[0].id);
          }
        })
        .catch(() => {
          const fallback: Record<string, AIModelInfo[]> = {
            ollama: [
              { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", provider: "ollama", description: "Best for code" },
              { id: "codellama:7b", name: "Code Llama 7B", provider: "ollama", description: "Meta code model" },
            ],
            openai: [
              { id: "gpt-4o", name: "GPT-4o", provider: "openai", description: "Latest flagship" },
              { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", description: "Fast & cheap" },
            ],
          };
          setModels(fallback[activeProvider] || []);
        })
        .finally(() => setModelsLoading(false));
    }
  }, [activeProvider]);

  // Auto-scroll
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Auto-save sessions when messages change
  useEffect(() => {
    if (!activeSessionId) return;
    setSessions(prev => {
      const existing = prev.find(s => s.id === activeSessionId);
      if (!existing) return prev;
      const nonEmpty = messages.filter(m => m.content);
      const updated: AISession = {
        ...existing,
        updated: Date.now(),
        provider: activeProvider,
        model: activeModel,
        messages: nonEmpty.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          step: m.step,
        })),
        summary: nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1].content.slice(0, 120) : "",
      };
      const next = prev.map(s => s.id === activeSessionId ? updated : s);
      saveSessions(next);
      return next;
    });
  }, [messages, activeSessionId, activeProvider, activeModel]);

  // Focus edit input when renaming
  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  const addMessage = (msg: Message) => setMessages(prev => [...prev, msg]);

  const clearChat = () => {
    setMessages([{ ...WELCOME_MSG }]);
    setStreamingContent("");
  };

  /* ── Session actions ── */
  const handleNewSession = () => {
    const session = createNewSession(activeProvider, activeModel);
    setSessions(prev => [...prev, session]);
    setActiveSessionId(session.id);
    setMessages([{ ...WELCOME_MSG }]);
    setStreamingContent("");
  };

  const handleLoadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    setActiveSessionId(id);
    setMessages(session.messages.length > 0
      ? session.messages.map(m => ({ ...m, streaming: false }))
      : [{ ...WELCOME_MSG }]
    );
    setStreamingContent("");
    if (session.provider) setActiveProvider(session.provider);
    if (session.model) setActiveModel(session.model);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = sessions.filter(s => s.id !== id);
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (activeSessionId === id) {
      if (remaining.length > 0) {
        const nextSession = remaining[0];
        setActiveSessionId(nextSession.id);
        setMessages(nextSession.messages.length > 0
          ? nextSession.messages.map(m => ({ ...m, streaming: false }))
          : [{ ...WELCOME_MSG }]
        );
      } else {
        const session = createNewSession(activeProvider, activeModel);
        setSessions(prev => [...prev, session]);
        setActiveSessionId(session.id);
        setMessages([{ ...WELCOME_MSG }]);
      }
    }
  };

  const handleStartRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    if (session) {
      setEditingSessionId(id);
      setEditLabel(session.label);
    }
  };

  const handleFinishRename = (id: string) => {
    const trimmed = editLabel.trim();
    if (trimmed) {
      setSessions(prev => {
        const next = prev.map(s => s.id === id ? { ...s, label: trimmed, updated: Date.now() } : s);
        saveSessions(next);
        return next;
      });
    }
    setEditingSessionId(null);
    setEditLabel("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") handleFinishRename(id);
    if (e.key === "Escape") setEditingSessionId(null);
  };

  /* ── Streaming Generation ── */
  const runStreamingGeneration = useCallback(async (prompt: string, opts?: { forceModel?: string }) => {
    setBuilding(true);
    setShowTemplates(false);
    addMessage({ role: "user", content: prompt, timestamp: Date.now() });

    setMessages(prev => [...prev, {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      streaming: true,
    }]);

    // Determine effective model — fast mode overrides to lighter model
    const effectiveModel = opts?.forceModel || (fastMode ? getFastModel(activeProvider) || activeModel : activeModel);
    const effectiveFormat = jsonFormat ? "json" : null;

    let fullContent = "";

    let tauriEvent: any = null;
    try {
      tauriEvent = await import('@tauri-apps/api/event');
    } catch { /* Not in Tauri */ }

    if (!tauriEvent?.listen) {
      // ── Non-Tauri fallback: call Ollama directly from browser ──
      if (activeProvider === "ollama") {
        try {
          // Try streaming first (preferred for responsiveness)
          await directOllamaStream(effectiveModel, prompt, effectiveFormat, (token, done) => {
            fullContent += token;
            setStreamingContent(fullContent);
            if (done) {
              setMessages(prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                if (lastMsg && lastMsg.streaming) {
                  lastMsg.content = fullContent || "(empty response)";
                  lastMsg.streaming = false;
                }
                return next;
              });
              setStreamingContent("");
              setBuilding(false);
              setCurrentStep(-1);
            }
          });
        } catch (streamErr) {
          // Fallback to non-streaming if streaming fails
          try {
            fullContent = await directOllamaGenerate(effectiveModel, prompt, effectiveFormat);
            setMessages(prev => {
              const next = [...prev];
              const lastMsg = next[next.length - 1];
              if (lastMsg && lastMsg.streaming) {
                lastMsg.content = fullContent || "(empty response)";
                lastMsg.streaming = false;
              }
              return next;
            });
            setStreamingContent("");
            setBuilding(false);
          } catch (e) {
            addMessage({ role: "system", content: `❌ Ollama: ${e}. Make sure Ollama is running on localhost:11434`, timestamp: Date.now() });
            setBuilding(false);
          }
        }
        return;
      }

      // For non-Ollama providers outside Tauri, show a helpful hint
      addMessage({
        role: "system",
        content: `⚠️ The "${activeProvider}" provider requires the dweb desktop app (Tauri).\n\n` +
          `👉 Either:\n` +
          `  • Run \`npx tauri dev\` to open the desktop app\n` +
          `  • Switch to **Ollama (Local)** which works directly in the browser\n\n` +
          `Ollama is free and runs entirely on your machine.`,
        timestamp: Date.now(),
      });
      setBuilding(false);
      return;
    }

    const { listen } = tauriEvent;
    const typedListen = listen as unknown as <T>(event: string, handler: (e: { payload: T }) => void) => Promise<() => void>;

    const unlistenToken = await typedListen<StreamToken>("ai:token", (event) => {
      const { token, done } = event.payload;
      fullContent += token;
      setStreamingContent(fullContent);
      if (done) {
        setMessages(prev => {
          const next = [...prev];
          const lastMsg = next[next.length - 1];
          if (lastMsg && lastMsg.streaming) {
            lastMsg.content = fullContent;
            lastMsg.streaming = false;
          }
          return next;
        });
        setStreamingContent("");
        setBuilding(false);
        setCurrentStep(-1);
      }
    });

    const unlistenError = await typedListen<string>("ai:error", (event) => {
      addMessage({ role: "system", content: `❌ Error: ${event.payload}`, timestamp: Date.now() });
      setStreamingContent("");
      setBuilding(false);
      setCurrentStep(-1);
    });

    try {
      await invoke("ai_generate_stream", {
        prompt,
        providerType: activeProvider,
        model: effectiveModel,
        responseFormat: effectiveFormat,
      });
    } catch (e) {
      addMessage({ role: "system", content: `❌ Failed to start: ${e}`, timestamp: Date.now() });
      setBuilding(false);
    }

    setTimeout(() => { unlistenToken(); unlistenError(); }, 30000);
  }, [activeProvider, activeModel, fastMode, jsonFormat, messages.length, getFastModel]);

  const handleSend = () => {
    if (!input.trim() || building) return;
    runStreamingGeneration(input.trim());
    setInput("");
  };

  const handleTemplate = async (template: Template) => {
    const prompt = `Build a ${template.name}: ${template.description} using ${template.stack}`;
    runStreamingGeneration(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Custom Stack ── */
  const buildCustomStackPrompt = () => {
    const runtime = RUNTIME_OPTIONS.find(o => o.value === stackRuntime);
    const frontend = FRONTEND_OPTIONS.find(o => o.value === stackFrontend);
    const backend = BACKEND_OPTIONS.find(o => o.value === stackBackend);
    const db = DATABASE_OPTIONS.find(o => o.value === stackDatabase);
    const css = CSS_OPTIONS.find(o => o.value === stackCss);

    const parts = [
      `Build a project with the following stack:`,
      `- Runtime: ${runtime?.label || stackRuntime}`,
      frontend && frontend.value !== "none" ? `- Frontend: ${frontend.label}` : `- Frontend: None (API only)`,
      `- Backend: ${backend?.label || stackBackend}`,
      db && db.value !== "none" ? `- Database: ${db.label}` : `- Database: None`,
      `- CSS: ${css?.label || stackCss}`,
    ];

    if (stackDescription.trim()) {
      parts.push(`\nAdditional instructions:\n${stackDescription.trim()}`);
    }

    return parts.join("\n");
  };

  const handleBuildCustomStack = () => {
    const prompt = buildCustomStackPrompt();
    setShowCustomStack(false);
    runStreamingGeneration(prompt);
  };

  const currentProviderInfo = providers.find(p => p.provider_type === activeProvider);
  const providerColor = AI_PROVIDER_COLORS[activeProvider] || "#7C3AED";
  const providerIcon = AI_PROVIDER_ICONS[activeProvider] || "🤖";
  const enabledProviders = providers.filter(p => p.enabled);
  const activeSessionLabel = sessions.find(s => s.id === activeSessionId)?.label || "New Chat";

  /* ── Render ── */
  return (
    <div className="view-container ai-agent-view">
      {/* ─── Header ───────────────────────────────────────── */}
      <div className="view-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setSessionSidebarOpen(!sessionSidebarOpen)}
            title={sessionSidebarOpen ? "Hide sessions" : "Show sessions"}
          >
            {sessionSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
          <div>
            <h2>AI Build Agent</h2>
            <p className="text-muted-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {activeSessionLabel}
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>—</span>
              {providerIcon} {activeModel}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-sm btn-secondary" onClick={handleNewSession} title="New session">
            <Plus size={14} /> New Session
          </button>
          <button className="btn btn-icon btn-sm" onClick={clearChat} title="Clear chat">
            <Trash2 size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => setShowTemplates(!showTemplates)}>
            <BookOpen size={14} /> {showTemplates ? "Hide" : "Templates"}
          </button>
        </div>
      </div>

      {/* ─── Body: Session sidebar + main chat ────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0 }}>
        {/* Session Sidebar */}
        <div style={{
          width: sessionSidebarOpen ? 240 : 0,
          minWidth: sessionSidebarOpen ? 240 : 0,
          overflow: "hidden",
          borderRight: sessionSidebarOpen ? "1px solid var(--border-subtle)" : "none",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius)",
          marginRight: sessionSidebarOpen ? 12 : 0,
          transition: "width 0.2s ease, min-width 0.2s ease, margin-right 0.2s ease",
          flexShrink: 0,
        }}>
          <div style={{
            padding: "12px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Sessions
            </span>
            <button className="btn btn-icon btn-sm" onClick={() => setSessionSidebarOpen(false)} title="Close sidebar" style={{ padding: 2 }}>
              <ChevronLeft size={14} />
            </button>
          </div>
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {sessions.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                No sessions yet
              </div>
            )}
            {[...sessions]
              .sort((a, b) => b.updated - a.updated)
              .map(s => {
                const isActive = s.id === activeSessionId;
                const isEditing = editingSessionId === s.id;
                const dateStr = new Date(s.updated).toLocaleDateString();
                return (
                  <div
                    key={s.id}
                    onClick={() => !isEditing && handleLoadSession(s.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: isEditing ? "default" : "pointer",
                      background: isActive ? "rgba(59, 130, 246, 0.12)" : "transparent",
                      border: isActive ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => {
                      if (!isActive && !isEditing)
                        (e.currentTarget as HTMLElement).style.background = "var(--bg-glass)";
                    }}
                    onMouseLeave={e => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onBlur={() => handleFinishRename(s.id)}
                        onKeyDown={e => handleRenameKeyDown(e, s.id)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: "100%",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--accent-blue)",
                          borderRadius: 4,
                          padding: "2px 6px",
                          color: "var(--text-primary)",
                          fontSize: 12,
                          outline: "none",
                        }}
                      />
                    ) : (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                      }}>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? "var(--accent-blue)" : "var(--text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={s.label}
                        >
                          {s.label}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{dateStr}</span>
                        <button
                          className="btn btn-icon"
                          onClick={e => handleStartRename(s.id, e)}
                          title="Rename"
                          style={{ padding: 2, opacity: 0.5 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "0.5"}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          className="btn btn-icon"
                          onClick={e => handleDeleteSession(s.id, e)}
                          title="Delete session"
                          style={{ padding: 2, opacity: 0.5, color: "var(--error)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "0.5"}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                    {s.summary && !isEditing && (
                      <div style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {s.summary}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Main Chat Area */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>

          {/* ─── Provider / Model Selector ────────────────────── */}
          <div className="ai-model-selector glass-sm">
            <div className="selector-group">
              <label>Provider</label>
              <select
                value={activeProvider}
                onChange={(e) => { setActiveProvider(e.target.value); setActiveModel(""); }}
                className="select-input"
                disabled={building || providersLoading}
              >
                {enabledProviders.length === 0 ? (
                  <option value="">No providers enabled</option>
                ) : (
                  enabledProviders.map(p => (
                    <option key={p.provider_type} value={p.provider_type}>
                      {AI_PROVIDER_ICONS[p.provider_type] || "🤖"} {AI_PROVIDER_LABELS[p.provider_type] || p.provider_type}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="selector-group">
              <label>Model</label>
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
                className="select-input"
                disabled={building || modelsLoading || models.length === 0}
              >
                {modelsLoading ? (
                  <option value="">Loading...</option>
                ) : models.length === 0 ? (
                  <option value="">No models loaded</option>
                ) : (
                  models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                )}
              </select>
            </div>
            {currentProviderInfo && (
              <div className="selector-status">
                <span className="status-dot-sm" style={{
                  backgroundColor: currentProviderInfo.enabled ? "#22c55e" : "#6b7280"
                }} />
                <span className="text-muted-sm">{currentProviderInfo.enabled ? "Ready" : "Disabled"}</span>
              </div>
            )}
            {/* Fast Mode Toggle */}
            <div className="selector-group" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <label style={{ marginBottom: 0, cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={e => setFastMode(e.target.checked)}
                  disabled={building}
                  style={{ margin: 0, accentColor: "var(--accent-blue)" }}
                />
                ⚡ Fast
              </label>
              {fastMode && getFastModel(activeProvider) && (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  using <strong style={{ color: "#22c55e" }}>{getFastModel(activeProvider)}</strong>
                </span>
              )}
            </div>

            {/* Model Speed Badge */}
            {(() => {
              const modelToCheck = fastMode && getFastModel(activeProvider) ? getFastModel(activeProvider) : activeModel;
              const speed = getModelSpeed(modelToCheck);
              if (!speed) return null;
              const colors = { fast: "#22c55e", balanced: "#eab308", powerful: "#ef4444" };
              const labels = { fast: "Fast", balanced: "Balanced", powerful: "Powerful" };
              return (
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 10,
                  background: `${colors[speed]}22`, color: colors[speed],
                  fontWeight: 600, whiteSpace: "nowrap",
                }}>
                  {labels[speed]}
                </span>
              );
            })()}

            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {/* Navigate to settings */}}
              title="Configure providers in Settings"
            >
              <Settings2 size={14} />
            </button>
          </div>

          {/* ─── Custom Stack Panel ─────────────────────────── */}
          <div className="glass-sm" style={{
            marginBottom: 8,
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}>
            <button
              onClick={() => setShowCustomStack(!showCustomStack)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 14px",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <Layers size={14} />
              Custom Stack
              <span style={{ marginLeft: "auto", transition: "transform 0.2s", transform: showCustomStack ? "rotate(90deg)" : "none" }}>
                <ChevronRight size={14} />
              </span>
            </button>

            {showCustomStack && (
              <div style={{
                padding: "0 14px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div className="selector-group">
                    <label>Runtime</label>
                    <select value={stackRuntime} onChange={e => setStackRuntime(e.target.value)} className="select-input" style={{ minWidth: 0 }}>
                      {RUNTIME_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="selector-group">
                    <label>Frontend</label>
                    <select value={stackFrontend} onChange={e => setStackFrontend(e.target.value)} className="select-input" style={{ minWidth: 0 }}>
                      {FRONTEND_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="selector-group">
                    <label>Backend</label>
                    <select value={stackBackend} onChange={e => setStackBackend(e.target.value)} className="select-input" style={{ minWidth: 0 }}>
                      {BACKEND_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="selector-group">
                    <label>Database</label>
                    <select value={stackDatabase} onChange={e => setStackDatabase(e.target.value)} className="select-input" style={{ minWidth: 0 }}>
                      {DATABASE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="selector-group" style={{ gridColumn: "1 / -1" }}>
                    <label>CSS Framework</label>
                    <select value={stackCss} onChange={e => setStackCss(e.target.value)} className="select-input" style={{ minWidth: 0 }}>
                      {CSS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <textarea
                  value={stackDescription}
                  onChange={e => setStackDescription(e.target.value)}
                  placeholder="Additional instructions for the build..."
                  rows={2}
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 10px",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleBuildCustomStack}
                  disabled={building}
                  style={{ alignSelf: "flex-end" }}
                >
                  <Layers size={14} /> Build with Custom Stack
                </button>
              </div>
            )}
          </div>

          {/* ─── Pipeline Progress ───────────────────────────── */}
          {building && currentStep >= 0 && (
            <div className="pipeline-progress glass">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.id} className={`pipeline-step ${i < currentStep ? "done" : ""} ${i === currentStep ? "active" : ""} ${i > currentStep ? "pending" : ""}`}>
                  <div className="step-indicator">
                    {i < currentStep ? <CheckCircle2 size={18} /> :
                     i === currentStep ? <Loader2 size={18} className="spin" /> :
                     <Circle size={18} />}
                  </div>
                  <span className="step-label">{step.label}</span>
                  {i < PIPELINE_STEPS.length - 1 && <div className="step-connector" />}
                </div>
              ))}
            </div>
          )}

          {/* ─── Input Bar ── */}
          <div className="ai-input-section">
            <div className="chat-input-bar">
              <div className="input-provider-badge" style={{ color: providerColor }}>
                {providerIcon} {activeModel || "select model"}
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={building ? "Building..." : 'e.g. "Build a blog with auth and comments"'}
                disabled={building}
                className="chat-input"
              />
              <button
                className={`btn btn-icon btn-sm ${jsonFormat ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setJsonFormat(!jsonFormat)}
                disabled={building}
                title={jsonFormat ? "JSON output ON" : "JSON output OFF"}
                style={{ marginRight: 4, fontSize: 11, fontWeight: 600 }}
              >
                {"{ }"}
              </button>
              <button className="btn btn-primary send-btn" onClick={handleSend} disabled={building || !input.trim()}>
                {building ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              </button>
            </div>

            {/* Template Gallery */}
            {showTemplates && !building && (
              <div className="template-gallery">
                <div className="template-grid">
                  {TEMPLATES.map(t => (
                    <button key={t.id} className="template-card glass" onClick={() => handleTemplate(t)}
                      style={{ "--accent": t.color } as React.CSSProperties}>
                      <span className="template-icon">{t.icon}</span>
                      <span className="template-name">{t.name}</span>
                      <span className="template-desc">{t.description}</span>
                      <span className="template-stack">{t.stack}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Chat Messages ── */}
          <div className="chat-messages" ref={chatContainerRef}>
            {messages.length <= 1 && !building && (
              <div className="chat-welcome">
                <Sparkles size={32} className="welcome-icon" />
                <h3>What would you like to build?</h3>
                <p>Type a description above or choose a template to get started instantly.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                {msg.role === "assistant" && <div className="msg-avatar"><Bot size={16} /></div>}
                {msg.role === "system" && <div className="msg-avatar"><Loader2 size={16} /></div>}
                {msg.role === "user" && <div className="msg-avatar user"><Send size={16} /></div>}
                <div className="msg-content">
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, fontSize: "13px" }}>
                    {msg.streaming ? (
                      <span>{msg.content}<span className="streaming-cursor">▊</span></span>
                    ) : msg.content}
                  </pre>
                </div>
              </div>
            ))}
            {building && currentStep < 0 && streamingContent && (
              <div className="chat-message assistant">
                <div className="msg-avatar"><Bot size={16} /></div>
                <div className="msg-content">
                  <span className="streaming-text">{streamingContent}<span className="streaming-cursor">▊</span></span>
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
        </div>
      </div>
    </div>
  );
}
