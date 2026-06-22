import { useState, useRef, useEffect } from "react";
import {
  BookOpen, ChevronRight,
  Download, Globe, Zap, Cpu,
  Server, Database, Lock, FileText,
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
  { id: "download", label: "Download & Install", icon: <Download size={14} /> },
  { id: "concept", label: "Core Concept", icon: <Globe size={14} /> },
  { id: "what-host", label: "What You Can Host", icon: <Server size={14} /> },
  { id: "ai-agents", label: "AI Build Agents", icon: <Cpu size={14} /> },
  { id: "publishing", label: "P2P Publishing", icon: <Globe size={14} /> },
  { id: "included", label: "What's Included", icon: <Database size={14} /> },
  { id: "business", label: "Business Model", icon: <Lock size={14} /> },
  { id: "why-wins", label: "Why dweb Wins", icon: <Zap size={14} /> },
  { id: "roadmap", label: "Roadmap", icon: <FileText size={14} /> },
  { id: "tech-stack", label: "Tech Stack", icon: <Cpu size={14} /> },
  { id: "license", label: "License", icon: <FileText size={14} /> },
];

/* ─── README Content (from the project README.md) ──── */

const README_CONTENT = `
# dweb — Decentralized Web Platform

A desktop app that lets you **build, host, and serve any web architecture from your own machine — accessible to the entire world via P2P.** Built-in AI agents help you create everything.

---

## Core Concept

\`\`\`
┌──────────────────────────────────────────────────┐
│                   dweb App                        │
│                                                   │
│  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  Web Architectures   │  │  AI Build Agents  │  │
│  │  (deploy locally)    │  │  (free, built-in) │  │
│  │                      │  │                   │  │
│  │  • Static site       │  │  • "Build me a   │  │
│  │  • PHP + MySQL       │  │    blog with auth"│  │
│  │  • Node.js + MongoDB │  │  • "Create an API│  │
│  │  • Python + Postgres │  │    for my data"   │  │
│  │  • Go + Redis        │  │  • "Deploy this  │  │
│  │  • Ruby on Rails     │  │    to the world" │  │
│  │  • Rust backend      │  │  • "Add a        │  │
│  │  • Docker containers │  │    database"     │  │
│  │  • Custom stack      │  │                   │  │
│  └──────────┬───────────┘  └────────┬──────────┘  │
│             │                       │              │
│             └───────┬───────────────┘              │
│                     ▼                              │
│  ┌─────────────────────────────────────────────┐   │
│  │         P2P Publishing Layer                │   │
│  │  (Global DHT → dweb://your-site.dweb)       │   │
│  │  Accessible from ANY dweb user worldwide    │   │
│  └─────────────────────────────────────────────┘   │
│                                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │         Cloud Toggle (optional)             │   │
│  │  One-click: Local → AWS/GCP/Azure/VPS       │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

        Your machine = Your server = Your cloud
\`\`\`

---

## What You Can Host (All Locally, Accessible Globally)

| Architecture | Built-in Stack | AI Can Build It? |
|---|---|---|
| **Static site** | Any HTML/CSS/JS folder | ✅ "Build a landing page" |
| **PHP site** | PHP 8 + MySQL / MariaDB | ✅ "Build a CMS" |
| **Node.js app** | Express / Fastify + MongoDB / SQLite | ✅ "Build a REST API" |
| **Python web app** | FastAPI / Flask + PostgreSQL | ✅ "Build a dashboard" |
| **Go backend** | Gin / Fiber + Redis | ✅ "Build a URL shortener" |
| **Ruby app** | Rails / Sinatra + SQLite | ✅ "Build a blog" |
| **Full stack** | Any combo above | ✅ "Build a SaaS boilerplate" |
| **Docker** | Run any containerized app | ✅ "Deploy this compose file" |
| **WordPress** | PHP + MySQL + WP-CLI | ✅ "Install WordPress" |
| **Database only** | MySQL / Postgres / MongoDB / Redis | ✅ "Set up a DB for me" |

---

## Built-in AI Build Agents (Free)

The AI agents understand natural language and can:

| Agent | Capability |
|---|---|
| **Site Builder** | "Create a blog with user authentication and an admin panel" → builds full stack locally |
| **API Builder** | "Build a REST API for a todo app with Postgres" → generates code + deploys |
| **DB Architect** | "Design a schema for an e-commerce platform" → creates DB + migrations |
| **Deployment Agent** | "Make my local site accessible to the world" → configures P2P publishing |
| **Stack Advisor** | "I need a real-time chat app, what stack should I use?" → recommends + scaffolds |

**Example workflow:**

\`\`\`
User: "Build me a project management app with user login, teams, and task boards."

AI Agent:
  1. Scaffolds Node.js + React + PostgreSQL project
  2. Sets up authentication (JWT + bcrypt)
  3. Creates database schema (users, teams, projects, tasks)
  4. Generates REST API endpoints
  5. Builds React frontend with drag-and-drop boards
  6. Starts local server
  7. Publishes to dweb://my-pm-app.dweb (accessible worldwide)

Time: ~2 minutes
Cost: $0 (no API key needed — runs local models via Ollama)
\`\`\`

---

## How Publishing Works (Global Access)

\`\`\`
Your Machine                        Any dweb User (Worldwide)
┌────────────────────┐              ┌────────────────────┐
│  dweb serve ./app  │              │  Opens             │
│  └─ Port 3000      │              │  dweb://my-app    │
│                    │   P2P/DHT    │  ┌──────────────┐  │
│  Registers on      │◄────────────►│  │ React UI     │  │
│  global DHT        │              │  │  ↓ calls     │  │
│  my-app.dweb → IP  │              │  │ API at       │  │
│                    │              │  │ /api/tasks   │  │
│  Local stack:      │              │  └──────────────┘  │
│  ├─ React (port 80)│              │                    │
│  ├─ Node (port 3001)              │  All traffic goes  │
│  ├─ Postgres (5432)│              │  P2P through your  │
│  └─ Redis (6379)   │              │  machine directly  │
└────────────────────┘              └────────────────────┘
\`\`\`

### P2P Proxy Layer

dweb creates a secure tunnel from the P2P network to your local ports:

| Local Service | P2P Access |
|---|---|
| \`localhost:80\` | \`dweb://my-app.dweb\` (web UI) |
| \`localhost:3001\` | \`dweb://my-app.dweb/api/*\` (API) |
| \`localhost:5432\` | Not exposed (internal) |
| \`localhost:9090\` | \`dweb://my-app.dweb/admin\` (admin panel) |

---

## What's Included (Out of the Box)

### Runtimes & Databases (Bundled or Auto-Installed)

| Category | Options |
|---|---|
| **Web servers** | Apache, Nginx, Caddy |
| **Languages** | Node.js, Python, PHP, Go, Ruby, Rust |
| **Databases** | MySQL, PostgreSQL, MongoDB, SQLite, Redis |
| **Containers** | Docker (if installed on host) |
| **AI** | Ollama + Qwen2.5-Coder (local LLM for AI agents) |

### Default AI Model

- **Ollama + Qwen2.5-Coder 7B** — runs locally, no API key, no internet required
- All AI agent features work 100% offline

---

## Business Model

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | All architectures, AI agents, \`.dweb\` domain, P2P hosting |
| **Relay** | $3/mo | Keep site online when your machine is off (cloud cache) |
| **Cloud Shift** | $5-10/mo | One-click deploy to AWS/GCP with managed infra |
| **Enterprise** | Custom | Private DHT, white-label, on-prem deployment |

---

## Why This Wins

| Problem Today | dweb Solution |
|---|---|
| Hosting costs $5-100/mo | Your machine is free |
| DevOps is complex | AI builds + deploys for you |
| Vendor lock-in | P2P = no cloud dependency |
| Censorship | No central server to take down |
| Domain registration | Free \`.dweb\` via DHT |
| Global reach | Anyone with dweb can access instantly |
| Learning curve | "Describe what you want" → AI builds it |

---

## Build Roadmap (6 months, 2-3 people)

| Phase | Duration | Output |
|---|---|---|
| Local stack manager | 4 wk | Install/manage runtimes, databases, proxies |
| P2P publishing layer | 4 wk | Global DHT, NAT traversal, P2P proxy |
| AI agent framework | 6 wk | Scaffolding, code generation, deployment |
| Web architectures | 4 wk | Templates for all stacks (Node, PHP, Python, Go, Ruby) |
| Desktop app (Tauri) | 4 wk | Tray UI, service panel, browse view |
| Cloud Toggle | 2 wk | One-click to AWS/GCP |
| Ship + docs | 2 wk | Installers, website, tutorials |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | **Tauri** (Rust + web UI) |
| AI agents | **Ollama** + **Qwen2.5-Coder 7B** (local) |
| Code generation | Custom templates + agent orchestration |
| P2P networking | **HyperDHT** + **Hypercore** |
| NAT traversal | STUN + UPnP + TURN (optional) |
| Domain resolution | Custom DHT (\`.dweb\` namespace) |
| Local runtimes | **Node.js**, **Python**, **PHP**, **Go**, **Ruby** (bundled installers) |
| Databases | **MySQL**, **PostgreSQL**, **MongoDB**, **SQLite**, **Redis** |
| Container support | **Docker** integration (optional) |

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
                "What You Can Host": "what-host",
                "Built-in AI Build Agents": "ai-agents",
                "How Publishing Works": "publishing",
                "What's Included": "included",
                "Business Model": "business",
                "Why This Wins": "why-wins",
                "Build Roadmap": "roadmap",
                "Tech Stack": "tech-stack",
                "License": "license",
                "Download": "download",
                "How releases work": "download",
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
