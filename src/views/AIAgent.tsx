import { useState, useRef, useEffect } from "react";
import {
  Terminal, Loader2, Rocket, ExternalLink,
  GitBranch, RefreshCw, Play, Trash2, Globe,
  Box, Cpu,
} from "lucide-react";

interface PublishedProject {
  name: string; url: string; route: string;
}

/* ── Quick Actions ─────────────────────────────────────── */
const QUICK_ACTIONS = [
  { id: "build",  label: "Run Build",   icon: <Play size={14} />, prompt: "run npm run build in the dweb repo and fix any errors" },
  { id: "test",   label: "Run Tests",   icon: <RefreshCw size={14} />, prompt: "run npm test in the dweb repo and fix any failures" },
  { id: "status", label: "Repo Status", icon: <GitBranch size={14} />, prompt: "show the current state of the dweb repo, its architecture, branch, recent changes, and what can be built next" },
  { id: "dev",    label: "Dev Setup",   icon: <Cpu size={14} />, prompt: "explain the development setup, hot reload, key files, and how to start developing" },
  { id: "host",   label: "Build & Host",icon: <Globe size={14} />, prompt: "build a simple web application that can be hosted on dweb. Generate complete code files." },
  { id: "clean",  label: "Clean Build", icon: <Trash2 size={14} />, prompt: "clean all build artifacts and rebuild the dweb project from scratch" },
];

/* ── Load stored project list ───────────────────────────── */
const STORAGE_KEY = "dweb-published-projects";

function loadProjects(): PublishedProject[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveProjects(p: PublishedProject[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

export default function AIAgent() {
  // ── Repo context ──
  const [repoInfo, setRepoInfo] = useState<{
    repo: string; branch: string; commit: string; files: number;
  } | null>(null);

  // ── Opencode ──
  const [ocAvailable, setOcAvailable] = useState<boolean | null>(null);
  const [ocVersion, setOcVersion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // ── Published projects ──
  const [published, setPublished] = useState<PublishedProject[]>(loadProjects);
  const [publishing, setPublishing] = useState(false);

  // Auto-scroll output
  useEffect(() => {
    if (showOutput && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, showOutput]);

  // On mount: load repo info + opencode status
  useEffect(() => {
    fetch("/api/repo/status").then(r => r.json()).then(d => {
      if (d.status === "ok") setRepoInfo(d);
    }).catch(() => {});
    fetch("/api/opencode/status").then(r => r.json()).then(d => {
      setOcAvailable(d.available);
      setOcVersion(d.version || "");
    }).catch(() => setOcAvailable(false));
    fetch("/api/projects").then(r => r.json()).then(d => {
      if (d.status === "ok" && d.projects) {
        setPublished(d.projects);
        saveProjects(d.projects);
      }
    }).catch(() => {});
  }, []);

  /* ── Run opencode prompt ── */
  const handleRun = async (customPrompt?: string) => {
    const cmd = (customPrompt || prompt).trim();
    if (!cmd) return;
    setOutput("");
    setShowOutput(true);
    setRunning(true);
    setPrompt("");
    try {
      const resp = await fetch("/api/opencode/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await resp.json();
      const text = data.output || "(no output)";
      // Color errors red in display
      setOutput(data.status === "error"
        ? `⚠️ Command failed:\n\n${text}`
        : text
      );
    } catch (e) {
      setOutput(`❌ Network error: ${e}`);
    }
    setRunning(false);
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

  /* ── Publish last generated output as a project ── */
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
      const fileName = `file_${i + 1}.${ext[lang] || "txt"}`;
      return { path: fileName, content, language: lang };
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
        const p: PublishedProject = { name: projectName, url: data.url, route: data.project.route };
        setPublished(prev => {
          const next = [p, ...prev];
          saveProjects(next);
          return next;
        });
        setOutput(prev => prev + `\n\n---\n✅ Published → ${data.url}`);
      } else {
        setOutput(prev => prev + `\n\n---\n❌ Publish failed: ${data.error}`);
      }
    } catch (e) {
      setOutput(prev => prev + `\n\n---\n❌ Publish error: ${e}`);
    }
    setPublishing(false);
  };

  /* ── Clear output ── */
  const handleClear = () => { setOutput(""); setShowOutput(false); };

  /* ── Render ── */
  return (
    <div className="view-container ai-agent-view">
      {/* ─── HEADER ─────────────────────────────────────── */}
      <div className="view-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Terminal size={22} style={{ color: "var(--accent-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>dweb Opencode Agent</h2>
            <p className="text-muted-sm" style={{ margin: 0, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              <GitBranch size={11} />
              {repoInfo ? `${repoInfo.repo} / ${repoInfo.branch} · ${repoInfo.commit} · ${repoInfo.files} files` : "Loading repo..."}
            </p>
          </div>
        </div>
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Opencode status */}
          <div className="glass-sm" style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: "var(--radius-sm)", fontSize: 11,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: ocAvailable === null ? "#6b7280"
                : ocAvailable ? "#22c55e" : "#ef4444",
            }} />
            <span style={{ fontWeight: 600 }}>opencode</span>
            {ocAvailable === true && (
              <span style={{ color: "#22c55e" }}>v{ocVersion}</span>
            )}
            {ocAvailable === false && (
              <span style={{ color: "#ef4444" }}>offline</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── QUICK ACTIONS ──────────────────────────────── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6,
        marginBottom: 8,
      }}>
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            className="btn btn-sm"
            style={{
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.15s",
            }}
            onClick={() => handleQuickAction(action)}
            disabled={running}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* ─── PROMPT INPUT ───────────────────────────────── */}
      <div className="glass-sm" style={{
        marginBottom: 8, padding: 10, borderRadius: "var(--radius-sm)",
      }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask opencode to build, fix, or explore... e.g. 'build a React todo app with Express backend'"
          disabled={running}
          rows={3}
          style={{
            width: "100%", resize: "vertical",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontFamily: "inherit", fontSize: 13,
            outline: "none", boxSizing: "border-box",
          }}
        />
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginTop: 8, gap: 8,
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => handleRun()}
              disabled={running || !prompt.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {running ? <Loader2 size={14} className="spin" /> : <Terminal size={14} />}
              {running ? "Running..." : "Run in opencode"}
            </button>
            {output && (
              <>
                <button className="btn btn-sm btn-secondary" onClick={handleClear}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Trash2 size={14} /> Clear
                </button>
                <button className="btn btn-sm" onClick={handlePublish}
                  disabled={publishing}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    color: "#22c55e",
                  }}>
                  {publishing ? <Loader2 size={14} className="spin" /> : <Rocket size={14} />}
                  {publishing ? "Publishing..." : "Host on dweb"}
                </button>
              </>
            )}
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {running ? "Running..." : prompt.length > 0 ? `${prompt.length} chars` : "Enter a prompt above"}
          </span>
        </div>
      </div>

      {/* ─── OUTPUT ─────────────────────────────────────── */}
      {showOutput && (
        <div className="glass-sm" style={{
          marginBottom: 8, borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 12px",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            fontSize: 11, color: "var(--text-muted)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Terminal size={12} /> Opencode Output
            </span>
            <span>{output.length} bytes</span>
          </div>
          <div ref={outputRef} style={{
            maxHeight: 400, overflow: "auto",
            padding: 12,
            fontFamily: "'Courier New', monospace",
            fontSize: 12, lineHeight: 1.5,
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
            {running && (
              <span className="blink" style={{ marginLeft: 4 }}>▌</span>
            )}
          </div>
        </div>
      )}

      {/* ─── PUBLISHED PROJECTS ─────────────────────────── */}
      {published.length > 0 && (
        <div className="glass-sm" style={{
          padding: 10, borderRadius: "var(--radius-sm)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
            fontSize: 12, color: "var(--text-muted)",
          }}>
            <Rocket size={14} />
            <span style={{ fontWeight: 600 }}>Hosted on dweb</span>
            <span>({published.length})</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {published.map(p => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener"
                className="glass-sm" style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: "var(--radius-sm)",
                  fontSize: 12, color: "#22c55e", textDecoration: "none",
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
