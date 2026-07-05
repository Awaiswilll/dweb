import { useState, useRef, useEffect } from "react";
import {
  BookOpen, ChevronRight,
  Globe, Zap, Cpu,
  Server, Lock, FileText,
  Menu,
} from "lucide-react";

/* ─── Sections from README ─────────────────────────── */
interface DocSection {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: DocSection[] = [
  { id: "overview", label: "Overview", icon: <Zap size={14} /> },
  { id: "concept", label: "Core Concept", icon: <Globe size={14} /> },
  { id: "what-host", label: "Service Management", icon: <Server size={14} /> },
  { id: "ai-agents", label: "AI Build Engine", icon: <Cpu size={14} /> },
  { id: "publishing", label: "P2P Networking", icon: <Globe size={14} /> },
  { id: "business", label: "Business Model", icon: <Lock size={14} /> },
  { id: "tech-stack", label: "Tech Stack", icon: <Cpu size={14} /> },
  { id: "project", label: "Project Structure", icon: <FileText size={14} /> },
  { id: "license", label: "License", icon: <FileText size={14} /> },
];

/* ─── README Content (from the project README.md) ──── */

const README_CONTENT = `
# dweb — P2P Self-Hosting OS

A **self-hosted P2P dev portal** that transforms any machine into a personal cloud. Built-in AI agents help you build, host, and publish any web architecture from your own machine, accessible to the world via P2P.

---

## Core Concept

\`\`\`
┌──────────────────────────────────────────────────────────────┐
│                         dweb Portal                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │  Services │  │  P2P Net  │  │      AI Build Engine       │ │
│  │           │  │           │  │                           │ │
│  │ Static    │  │ HyperDHT  │  │  15+ Providers            │ │
│  │ Node.js   │  │ WebRTC    │  │  100+ Free Models         │ │
│  │ Python    │  │ Relay     │  │  Ollama + Nemotron         │ │
│  │ PHP/Go    │  │ Mesh      │  │  Local + Cloud            │ │
│  │ File Svr  │  │ P2P File  │  │  OpenCode CLI             │ │
│  └───────────┘  └───────────┘  └───────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Browser Portal (port 49737)                   │  │
│  │  Dashboard │ AI Agent │ Browser │ Domains │ Docs      │  │
│  │  Settings  │ Integrations │ P2P Transfer │ Repos      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
\`\`\`

---

## Service Management Dashboard

Start/stop services with one click, monitor CPU/memory/ports, view logs:

| Service Type | Description |
|---|---|
| **Static Sites** | Serve any HTML/CSS/JS folder |
| **Node.js APIs** | Express, Fastify, and more |
| **Python Web Apps** | Flask, FastAPI, Django |
| **PHP Sites** | WordPress, Laravel, or plain PHP |
| **File Browser** | Upload, manage, and share files |
| **Custom Services** | Any port, any stack |

---

## Built-in AI Build Engine (15+ Providers)

The AI agent supports multiple providers and understands natural language:

| Provider | Access |
|---|---|
| **Ollama (Local)** | 50+ models, runs on your machine, 100% free |
| **Groq** | 9+ models, free tier, ultra-fast LPU chips |
| **Google Gemini** | 5+ models, free tier |
| **NVIDIA NIM** | 13+ models, free Nemotron models |
| **OpenAI** | GPT-4o, GPT-4o-mini, o3-mini |
| **Anthropic** | Claude 3.5 Sonnet, Haiku |
| **DeepSeek** | 3+ models, excellent code models |
| **Together AI, OpenRouter, HuggingFace, Mistral, Cohere, Cerebras, xAI, Hyperbolic, Fireworks** | Free tiers available |

### AI Agent Capabilities

- "Build a blog with React, Node.js, and PostgreSQL"
- "Create a FastAPI CRUD API with authentication"
- "Generate a PHP admin dashboard with Chart.js"
- "Build me a project management app with teams and task boards"

---

## P2P Networking & Discovery

Every dweb installation is a node on a decentralized network:

- **Peer discovery** — Find other dweb nodes via HyperDHT
- **Direct connections** — WebRTC encrypted P2P links
- **Relay fallback** — WebSocket + HTTP for NAT traversal
- **P2P File Transfer** — Share files directly between instances
- **Multi-instance** — Run multiple peers, cross-access services

### .dweb Domain System

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | 1 .dweb domain, basic P2P hosting |
| **Premium** | $3/mo | 5 domains, relay cache (always online) |
| **Business** | $10/mo | Unlimited domains, cloud shift, priority support |

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| /api/services | GET | List running services |
| /api/service/start | POST | Start a new service |
| /api/service/stop | POST | Stop a running service |
| /collab/services | GET | List P2P-discovered remote services |
| /dweb-status | GET | System status (uptime, peers, mode) |
| /api/ollama/status | GET | Ollama installation status |
| /api/opencode/run | POST | Run opencode CLI command |
| /fileshare/api/list | GET | List shared files |
| /fileshare/api/upload | POST | Upload a file |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.5, Vite 6, React Router 7, Lucide React |
| **Backend** | Node.js modular server (server/*.cjs) |
| **Desktop** | Tauri v2 (Rust) — optional desktop shell |
| **P2P** | HyperDHT, WebRTC, WebSocket relay, HTTP polling, TCP relay |
| **AI** | 15+ providers: Ollama, NVIDIA NIM, Groq, Gemini, DeepSeek, Mistral, OpenAI, Anthropic, Together, OpenRouter, HuggingFace, Fireworks, Cohere, Cerebras, xAI, Hyperbolic |
| **Database** | sled (embedded Rust), localStorage |

---

## Project Structure

\`\`\`
dweb/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── views/              # Page views
│   ├── styles/             # CSS styles
│   ├── types.ts            # TypeScript definitions
│   └── relay-client.ts     # P2P relay client
├── server/                 # Node.js backend (modular)
│   ├── index.cjs           # Entry point
│   ├── router.cjs          # Route registration
│   ├── api-services.cjs    # Service management API
│   ├── api-relay.cjs       # P2P relay endpoints
│   ├── api-collab.cjs      # Collaboration API
│   ├── api-fileshare.cjs   # File sharing API
│   └── ...
├── src-tauri/              # Rust/Tauri desktop backend
├── tools/                  # Utility scripts
├── welcome/                # Welcome page HTML
└── screenshots/            # App screenshots
\`\`\`

---

## License

MIT
`;

/* ─── Simple Markdown → JSX Renderer ──────────────── */

interface MarkdownBlock {
  type: "h1" | "h2" | "h3" | "h4" | "p" | "code" | "ul" | "table" | "hr" | "pre";
  content: string;
  rows?: string[][];
  headers?: string[];
  items?: string[];
}

function parseMarkdown(md: string): MarkdownBlock[] {
  const lines = md.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---/.test(line)) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Headers
    if (/^###### /.test(line)) { blocks.push({ type: "h4", content: line.slice(7).trim() }); i++; continue; }
    if (/^##### /.test(line)) { blocks.push({ type: "h4", content: line.slice(6).trim() }); i++; continue; }
    if (/^#### /.test(line)) { blocks.push({ type: "h4", content: line.slice(5).trim() }); i++; continue; }
    if (/^### /.test(line)) { blocks.push({ type: "h3", content: line.slice(4).trim() }); i++; continue; }
    if (/^## /.test(line)) { blocks.push({ type: "h2", content: line.slice(3).trim() }); i++; continue; }
    if (/^# /.test(line)) { blocks.push({ type: "h1", content: line.slice(2).trim() }); i++; continue; }

    // Code blocks
    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "pre", content: codeLines.join("\n") });
      continue;
    }

    // Tables
    if (line.includes("|") && i + 1 < lines.length && /^[\s\|:-]+$/.test(lines[i + 1])) {
      const headers = line.split("|").map(h => h.trim()).filter(h => h);
      const rows: string[][] = [];
      i += 2; // skip header and separator
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i].split("|").map(c => c.trim()).filter(c => c);
        if (row.length > 0) rows.push(row);
        i++;
      }
      blocks.push({ type: "table", content: "", headers, rows });
      continue;
    }

    // Unordered lists
    if (/^[\s]*[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+] /.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+] /, ""));
        i++;
      }
      blocks.push({ type: "ul", content: "", items });
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraphs (collect consecutive non-empty lines)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^[#\-\|\[\`]/.test(lines[i])) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "p", content: paraLines.join(" ") });
    } else {
      i++;
    }
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={idx} className="doc-inline-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function renderBlock(block: MarkdownBlock, idx: number): React.ReactNode {
  switch (block.type) {
    case "h1":
      return <h1 key={idx} className="doc-h1">{renderInline(block.content)}</h1>;
    case "h2":
      return <h2 key={idx} className="doc-h2">{renderInline(block.content)}</h2>;
    case "h3":
      return <h3 key={idx} className="doc-h3">{renderInline(block.content)}</h3>;
    case "h4":
      return <h4 key={idx} className="doc-h4">{renderInline(block.content)}</h4>;
    case "p":
      return <p key={idx} className="doc-p">{renderInline(block.content)}</p>;
    case "pre":
      return (
        <pre key={idx} className="doc-pre">
          <code>{block.content}</code>
        </pre>
      );
    case "ul":
      return (
        <ul key={idx} className="doc-ul">
          {block.items?.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      );
    case "table":
      return (
        <div key={idx} className="doc-table-wrapper">
          <table className="doc-table">
            {block.headers && (
              <thead>
                <tr>{block.headers.map((h, j) => <th key={j}>{renderInline(h)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {block.rows?.map((row, j) => (
                <tr key={j}>{row.map((cell, k) => <td key={k}>{renderInline(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={idx} className="doc-hr" />;
    default:
      return null;
  }
}

/* ─── Component ────────────────────────────────────── */

export default function Docs() {
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const blocks = parseMarkdown(README_CONTENT);

  // Scroll to a section by finding its header
  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(`doc-${sectionId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Check which section is visible on scroll
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollPos = container.scrollTop + 100;
      let current = "overview";

      for (const sec of SECTIONS) {
        const el = document.getElementById(`doc-${sec.id}`);
        if (el && el.offsetTop <= scrollPos) {
          current = sec.id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="view-container" style={{ overflow: "hidden" }}>
      <div className="view-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Hide doc nav" : "Show doc nav"}
          >
            <Menu size={16} />
          </button>
          <BookOpen size={20} style={{ color: "var(--accent-blue)" }} />
          <h2>Documentation</h2>
        </div>
        <span className="text-muted-sm">dweb v0.1.0</span>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0 }}>
        {/* ── Doc Sidebar ── */}
        <div style={{
          width: sidebarOpen ? 220 : 0,
          minWidth: sidebarOpen ? 220 : 0,
          overflow: "hidden",
          transition: "width 0.2s ease, min-width 0.2s ease",
          borderRight: sidebarOpen ? "1px solid var(--border-subtle)" : "none",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}>
          <nav style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 4px",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}>
            {SECTIONS.map(sec => (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: activeSection === sec.id
                    ? "rgba(59, 130, 246, 0.12)"
                    : "transparent",
                  color: activeSection === sec.id
                    ? "var(--accent-blue)"
                    : "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: activeSection === sec.id ? 600 : 400,
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => {
                  if (activeSection !== sec.id)
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-glass)";
                }}
                onMouseLeave={e => {
                  if (activeSection !== sec.id)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {sec.icon}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sec.label}
                </span>
                {activeSection === sec.id && (
                  <ChevronRight size={12} style={{ marginLeft: "auto", flexShrink: 0 }} />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Doc Content ── */}
        <div ref={contentRef} style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 32px",
          maxWidth: 860,
        }}>
          {blocks.map((block, idx) => {
            // Assign IDs to headers for scroll-to-section
            if (block.type === "h1") {
              return <h1 key={idx} id="doc-overview" className="doc-h1">{renderInline(block.content)}</h1>;
            }
            if (block.type === "h2") {
              const text = block.content;
              const sectionMap: Record<string, string> = {
                "Core Concept": "concept",
                "Service Management Dashboard": "what-host",
                "Built-in AI Build Engine": "ai-agents",
                "P2P Networking & Discovery": "publishing",
                "Business Model": "business",
                "Tech Stack": "tech-stack",
                "Project Structure": "project",
                "License": "license",
              };
              const sectionId = sectionMap[text] || text.toLowerCase().replace(/\s+/g, "-");
              return <h2 key={idx} id={`doc-${sectionId}`} className="doc-h2">{renderInline(block.content)}</h2>;
            }
            return renderBlock(block, idx);
          })}

          <div style={{ height: 60 }} />
        </div>
      </div>
    </div>
  );
}
