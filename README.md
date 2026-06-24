# dweb — Decentralized Web Platform

[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

> Build, host, and serve any web architecture from your own machine — accessible to the entire world via P2P.  
> Built-in AI agents help you create everything.

---

## Table of Contents

- [Project Scope](#project-scope)
- [Architecture Overview](#architecture-overview)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Frontend (React + Vite + TypeScript)](#frontend-react--vite--typescript)
- [Rust Backend (Tauri)](#rust-backend-tauri)
- [Node.js Tools](#nodejs-tools)
- [Views / Features](#views--features)
- [P2P Networking](#p2p-networking)
- [AI Agent System](#ai-agent-system)
- [Domain System (.dweb)](#domain-system-dweb)
- [Integrations](#integrations)
- [Cloud Deployment](#cloud-deployment)
- [Configuration](#configuration)
- [Development](#development)
- [Build & Package](#build--package)
- [Roadmap](#roadmap)
- [Business Model](#business-model)
- [License](#license)

---

## Project Scope

dweb is a decentralized web platform that lets you:

1. **Host locally** — run any web stack (Node.js, Python, PHP, Go, Ruby, static sites) on your own machine
2. **Publish globally** — share your sites with the world via P2P networking (HyperDHT + WebRTC)
3. **AI-powered creation** — describe what you want in natural language and AI agents build it for you
4. **Browse the P2P web** — use the built-in browser to visit `dweb://` sites across the network
5. **Cloud shift** — optionally deploy to AWS/GCP/Vercel/Netlify with one click

The codebase is a **full-stack monorepo** containing:

- A **React + Vite + TypeScript** frontend (desktop-grade UI with 8 views)
- A **Rust backend** (Tauri v2) with 10 modules for P2P, domains, AI, cloud, git, etc.
- **Node.js server tools** (zero-dependency HTTP + P2P relay daemons)
- A **C# desktop launcher** for the Node.js server path

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   dweb Application                           │
│                                                              │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │   React Frontend        │  │   Rust Backend (Tauri)   │  │
│  │   (Vite + TypeScript)   │  │                          │  │
│  │                         │  │  ┌────────────────────┐  │  │
│  │  ┌───────────────────┐  │  │  │ p2p (HyperDHT)    │  │  │
│  │  │ Dashboard         │  │  │  │ domain (.dweb)    │  │  │
│  │  │ BrowserView       │  │  │  │ ai (Ollama API)   │  │  │
│  │  │ AIAgent           │◄─┼──┼─►│ cloud (AWS/GCP)   │  │  │
│  │  │ Domains           │  │  │  │ git / github      │  │  │
│  │  │ Repositories      │  │  │  │ sandbox           │  │  │
│  │  │ Integrations      │  │  │  │ stack             │  │  │
│  │  │ Settings          │  │  │  │ config            │  │  │
│  │  │ Docs              │  │  │  │ database          │  │  │
│  │  └───────────────────┘  │  │  └────────────────────┘  │  │
│  └──────────┬──────────────┘  └──────────┬───────────────┘  │
│             │                             │                  │
│             └──────────┬──────────────────┘                  │
│                        ▼                                     │
│  ┌───────────────────────────────────────────────────────┐   │
│  │            Node.js Server Tools                       │   │
│  │  ┌─────────────────────┐  ┌──────────────────────┐   │   │
│  │  │ dweb-server.cjs     │  │ dweb-relay.cjs       │   │   │
│  │  │ (HTTP + static      │  │ (P2P bootstrap relay │   │   │
│  │  │  serving + relay    │  │  + peer discovery    │   │   │
│  │  │  client)            │  │  + WebRTC signaling) │   │   │
│  │  │ Port 49737          │  │  Port 49736          │   │   │
│  │  └─────────────────────┘  └──────────────────────┘   │   │
│  │  ┌─────────────────────┐                              │   │
│  │  │ dweb-launcher.cs    │  C# GUI launcher for above  │   │
│  │  └─────────────────────┘                              │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  For running without Tauri:                                   │
│    dweb.bat → node tools/dweb-server.cjs                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Two run modes:**

| Mode | How | Status |
|------|-----|--------|
| **Node.js server** | `dweb.bat` or `node tools/dweb-server.cjs` | ✅ Works, recommended |
| **Tauri desktop** | `npx tauri dev` or compiled binary | 🟡 Works (frontend only; Rust IPC has unresolved crash at ~17 s in compiled binary) |

---

## Repository Structure

```
dweb/
├── src/                          # React frontend source
│   ├── App.tsx                   # Root component with view routing
│   ├── main.tsx                  # React entry point
│   ├── types.ts                  # All TypeScript types & data models (472 lines)
│   ├── relay-client.ts           # P2P relay client (WebRTC signaling)
│   ├── safe-invoke.ts            # Tauri IPC wrapper (graceful fallback)
│   ├── styles/                   # CSS styles
│   ├── components/
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   └── OnlineToggle.tsx      # P2P mode toggle
│   └── views/
│       ├── Dashboard.tsx         # Services & runtimes dashboard (895 lines)
│       ├── BrowserView.tsx       # dweb:// P2P browser (988 lines)
│       ├── AIAgent.tsx           # AI build agent chat (1105 lines)
│       ├── Domains.tsx           # .dweb domain management (205 lines)
│       ├── Repositories.tsx      # Git/GitHub repo manager (1447 lines)
│       ├── Integrations.tsx      # Discord/WhatsApp/LinkedIn/Telegram (198 lines)
│       ├── Settings.tsx          # App configuration (450 lines)
│       └── Docs.tsx              # Built-in documentation browser (554 lines)
│
├── src-tauri/                    # Tauri desktop shell (Rust)
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri configuration
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # Module declarations + global state
│   │   ├── p2p.rs                # HyperDHT P2P networking (302 lines)
│   │   ├── domain.rs             # .dweb domain registration & resolution (140 lines)
│   │   ├── stack.rs              # Web stack management
│   │   ├── ai.rs                 # Ollama AI integration
│   │   ├── cloud.rs              # Cloud deployment (AWS/GCP)
│   │   ├── config.rs             # App configuration
│   │   ├── database.rs           # Database management
│   │   ├── sandbox.rs            # Sandboxed process execution
│   │   ├── git.rs                # Git operations
│   │   └── github.rs             # GitHub API integration
│   └── icons/                    # App icons
│
├── tools/                        # Node.js server tools
│   ├── dweb-server.cjs           # HTTP server + P2P relay client (419 lines)
│   ├── dweb-relay.cjs            # P2P bootstrap relay daemon (527 lines)
│   ├── dweb-launcher.cs          # C# desktop launcher (161 lines)
│   ├── relay-client.cjs          # Standalone relay client
│   ├── connectivity-test.cjs     # Network connectivity test
│   ├── dweb-connect-test.html    # Browser connectivity test
│   └── start-test-peer.bat       # Test peer launcher
│
├── dist/                         # Built frontend (gitignored)
├── node_modules/                 # Dependencies (gitignored)
│
├── package.json                  # Node.js dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
├── vite.config.ts                # Vite build configuration
├── index.html                    # HTML entry point
├── .gitignore                    # Git ignore rules
├── .env.example                  # Environment variables template
└── README.md                     # This file
```

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ (required)
- [Rust](https://rustup.rs/) (only if building Tauri desktop app)
- [Ollama](https://ollama.ai/) (optional, for local AI agents)

### Run the Node.js Server (recommended)

```bash
# 1. Install frontend dependencies
npm install

# 2. Build the frontend
npm run build

# 3. Start the P2P relay daemon (in a separate terminal)
node tools/dweb-relay.cjs

# 4. Start the web server (in another terminal)
node tools/dweb-server.cjs

# 5. Open http://localhost:49737 in your browser
```

Or use the batch script: `dweb.bat`

### Run the Tauri Desktop App

```bash
npm install
npx tauri dev
```

---

## Frontend (React + Vite + TypeScript)

The frontend is a **single-page application** built with:

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| TypeScript | 5.5 | Type safety |
| Vite | 6 | Build tool / HMR |
| React Router | 7 | Client-side routing |
| Lucide React | 0.400 | Icons |
| Tauri API | 2 | Desktop IPC |

**Key architectural decisions:**

- **`safe-invoke.ts`** wraps all Tauri IPC calls — when running outside Tauri (browser mode), it falls back gracefully instead of crashing
- **`relay-client.ts`** communicates with the Node.js relay/server via HTTP (no Tauri dependency)
- All views use **localStorage** for state persistence when Tauri IPC is unavailable
- The frontend compiles cleanly — 1526 modules, zero type errors

### Views

| View | Route | Lines | Description |
|------|-------|-------|-------------|
| Dashboard | `dashboard` | 895 | Service management, runtime detection, P2P network status, remote instance connections |
| Browser | `browser` | 988 | Built-in `dweb://` browser with tabs, bookmarks, tutorials, sandbox terminal |
| AI Agent | `ai-agent` | 1105 | Multi-provider AI chat (Ollama, OpenAI, Anthropic, Google, Groq, etc.), project scaffolding, stack builder |
| Domains | `domains` | 205 | `.dweb` domain registration, search, discovery |
| Repositories | `repositories` | 1447 | Full Git/GitHub integration — clone, commit, push, branch, PR workflow |
| Integrations | `integrations` | 198 | Discord webhook, WhatsApp Business, LinkedIn, Telegram bot |
| Settings | `settings` | 450 | General, AI models, P2P network, cloud providers, storage |
| Docs | `docs` | 554 | Built-in documentation browser |

---

## Rust Backend (Tauri)

The Rust backend provides native desktop capabilities through Tauri v2 IPC commands.

### Modules

| Module | Lines | Description |
|--------|-------|-------------|
| `p2p.rs` | 302 | HyperDHT-based P2P networking — DHT join/leave, site publishing, peer discovery, NAT traversal |
| `domain.rs` | 140 | `.dweb` domain registration, resolution, ownership verification, in-memory store |
| `ai.rs` | — | Ollama API integration — model management, code generation, streaming responses |
| `cloud.rs` | — | Cloud provider deployment — AWS, GCP, Netlify, Vercel |
| `config.rs` | — | Persistent app configuration |
| `database.rs` | — | Database management — MySQL, PostgreSQL, MongoDB, SQLite, Redis |
| `sandbox.rs` | — | Secure sandboxed process execution for user code |
| `stack.rs` | — | Web stack scaffolding — templates for Node.js, Python, PHP, Go, Ruby |
| `git.rs` | — | Native Git operations — init, clone, status, commit, push, branch management |
| `github.rs` | — | GitHub API — OAuth device flow, repo CRUD, archive download, import |

### Rust Dependencies

Key crates: `tauri 2`, `tokio`, `reqwest`, `hyperdht`, `hypercore`, `ed25519-dalek`, `sled` (embedded DB), `git2`, `serde`, `chrono`, `clap`, `once_cell`.

---

## Node.js Tools

### dweb-server.cjs (Port 49737)

A **zero-dependency Node.js HTTP server** that:

- Serves the built React frontend (`dist/`)
- Provides REST API endpoints for P2P relay communication
- Auto-registers with the P2P relay daemon
- Sends heartbeats every 30 s
- Discovers peers every 15 s
- Polls for WebRTC signals every 5 s
- Auto-opens the browser on start

**Endpoints:**

| Path | Method | Description |
|------|--------|-------------|
| `/ping` | GET | Connectivity test |
| `/dweb-status` | GET | Full server status |
| `/relay/status` | GET | Relay connection status |
| `/relay/peers` | GET | List peers from relay |
| `/relay/peer/:id` | GET | Get specific peer info |
| `/relay/signal` | POST | Send WebRTC signal to peer |
| `/relay/signals` | GET | Poll incoming signals |
| `/relay/connect` | POST | Send WebRTC offer to peer |
| `/` | GET | dweb app frontend |

### dweb-relay.cjs (Port 49736)

A **zero-dependency P2P bootstrap relay daemon** that provides:

- **Bootstrap node** — well-known entry point for new peers
- **Registration** — peers register their address & services
- **Discovery** — peers discover other online peers
- **Signaling** — WebRTC SDP offer/answer exchange
- **TCP relay** — message forwarding for NAT-trapped peers (port 49738)

### dweb-launcher.cs

A **C# console launcher** (compiled to `tools/dweb-desktop.exe`) that:

- Finds Node.js on the system
- Validates the project structure
- Launches `dweb-server.cjs` in a console window
- Displays network info and status

---

## Views / Features

### Dashboard

The main hub showing:

- **Network section** — online mode toggle (Local / P2P Visible / P2P Anonymous), relay connection status, discovered peers, remote instance connections (add/discover/manage peers)
- **Runtime Detection** — collapsible grid of detected system runtimes (Node.js, Python, Git, PHP, Java, Go, Rust, Docker) with version and availability
- **Services** — collapsible list of running/stopped services with CPU/RAM usage bars, start/stop controls, and add-service modal

### Browser

A built-in `dweb://` web browser with:

- Multi-tab support with navigation (back/forward/refresh)
- Bookmarks (defaults: Welcome, Getting Started)
- Getting Started tutorials (static site, Node.js REST API, Python dashboard, WordPress)
- Domain resolution via `dweb://domain-name`
- Sandbox terminal for local process execution
- iFrame-based content rendering with security headers

### AI Agent

Multi-provider AI chat interface for:

- Natural language code generation and project scaffolding
- Stack selection (runtime + frontend + backend + database + CSS)
- Provider selection: Ollama (local), OpenAI, Anthropic Claude, Google Gemini, Together AI, Groq, OpenRouter
- Streaming responses with session management
- Provider configuration (model selection, temperature, max tokens)

### Domains

`.dweb` domain management:

- Register new `.dweb` domains
- View owned domains with expiry dates
- Browse public domain registry
- Search domains by name
- Copy domain addresses

### Repositories

Full Git/GitHub workflow:

- Local repo scanning and management
- Git status (modified, staged, untracked files)
- Stage/unstage, commit, push, pull
- Branch management (create, switch, delete)
- Remote management (add, remove)
- GitHub OAuth via device code flow
- GitHub repo browsing, creation, import

### Integrations

Notification integrations:

| Platform | Type | Features |
|----------|------|----------|
| Discord | Webhook | Build notifications, alerts |
| WhatsApp | Business API | Deployment alerts |
| LinkedIn | API | Project announcements |
| Telegram | Bot | Real-time build status |

### Settings

Configuration tabs:

| Tab | Settings |
|-----|----------|
| General | Auto-start, theme, minimize to tray, relay address |
| AI Models | Provider configs (API keys, base URLs, models) |
| P2P Network | Relay address, bootstrap nodes, NAT type |
| Cloud Providers | AWS credentials, Netlify/Vercel tokens |
| Storage | Data directory, database paths |

---

## P2P Networking

dweb uses a **hybrid P2P architecture**:

1. **Bootstrap Relay** (`dweb-relay.cjs`) — a well-known HTTP server that peers register with for discovery and WebRTC signaling
2. **HyperDHT** (Rust) — Kademlia-style distributed hash table for `.dweb` domain resolution and peer lookup
3. **WebRTC** — direct P2P connections between peers after signaling exchange
4. **TCP Relay** — fallback message forwarding for peers behind symmetric NAT

### Connection modes

| Mode | Description |
|------|-------------|
| `local` | Offline — no P2P networking |
| `p2p-visible` | Register on relay + DHT, accept incoming connections |
| `p2p-anonymous` | Register on relay + DHT, but hide identity |

### Relay protocol

```
┌──────────┐  register   ┌──────────────┐  discover  ┌──────────┐
│  Peer A  │────────────►│ dweb-relay   │◄───────────│  Peer B  │
│          │  heartbeat  │  (49736)     │  signal    │          │
│          │◄────────────│              │───────────►│          │
│          │────────────►│              │            │          │
│          │  signal     │              │            │          │
└────┬─────┘             └──────────────┘            └────┬─────┘
     │                                                    │
     │                  WebRTC (direct)                   │
     └────────────────────────────────────────────────────┘
```

---

## AI Agent System

The AI Agent view supports **multiple AI providers**:

| Provider | Type | Default Model | API Key Required |
|----------|------|---------------|-----------------|
| Ollama | Local | qwen2.5-coder:7b | No |
| OpenAI | Cloud | gpt-4o | Yes |
| Anthropic | Cloud | claude-sonnet-4 | Yes |
| Google | Cloud | gemini-2.0-flash | Yes |
| Together AI | Cloud | mixtral | Yes |
| Groq | Cloud | mixtral | Yes |
| OpenRouter | Cloud | various | Yes |

**Key capabilities:**
- Streaming text generation with token-by-token display
- Direct Ollama browser API call (`http://localhost:11434/api/generate`) with no Tauri dependency
- Project scaffolding based on selected stack (runtime + frontend + backend + database)
- Session management with message history and summaries
- Template-based code generation

---

## Domain System (.dweb)

Domains are registered on the P2P network via the Rust backend:

- **Registration**: Create a `.dweb` domain (3-63 chars, lowercase alphanumeric + hyphens)
- **Ownership**: ECDSA keypair-based ownership
- **Resolution**: DHT lookup returns the publisher's address
- **Storage**: In-memory `HashMap` backed by `sled` (embedded persistent DB)
- **Validation**: Automatic expiry, active/inactive states

---

## Integrations

Webhook/API integrations for deployment notifications:

| Platform | Config | Validation |
|----------|--------|------------|
| Discord | Webhook URL | URL format check |
| WhatsApp | API Key + Phone Number ID | Presence validation |
| LinkedIn | Access Token + Company ID | Format validation |
| Telegram | Bot Token | Length validation |

Configurations persist to `localStorage`.

---

## Cloud Deployment

Cloud provider credentials (stored in `.env`):

| Provider | Variables | Service |
|----------|-----------|---------|
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Cloud Shift deployment |
| Netlify | `NETLIFY_AUTH_TOKEN` | One-click static deploy |
| Vercel | `VERCEL_TOKEN` | One-click frontend deploy |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth (device flow works without these) |

---

## Configuration

### Environment Variables (`.env`)

Copy `.env.example` to `.env` and set your API keys:

```bash
cp .env.example .env
```

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 49737 | dweb-server HTTP port |
| `RELAY_ADDR` | localhost:49736 | Relay daemon address |
| `P2P_MODE` | p2p-visible | Peer visibility mode |
| `RELAY_TCP_PORT` | 49738 | TCP relay port |

---

## Development

### Frontend only (HMR with Vite)

```bash
npm run dev
# Opens http://localhost:5173 with hot module replacement
```

### Build frontend

```bash
npm run build
# Output: dist/
```

### Type checking

```bash
npm run lint
npm run typecheck
```

### Tauri desktop (development)

```bash
npx tauri dev
```

### Tauri desktop (build)

```bash
npx tauri build
# Output: src-tauri/target/release/
```

---

## Build & Package

### Tauri builds

The project is configured for cross-platform builds via `tauri.conf.json`:

| Platform | Format | Config |
|----------|--------|--------|
| Windows | NSIS installer, portable `.exe` | Wix/NSIS |
| macOS | `.dmg` | Minimum 10.15 |
| Linux | `.deb`, `.AppImage` | — |

### GitHub Releases

Tag a release to trigger automated builds:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Roadmap

| Phase | Duration | Status | Output |
|-------|----------|--------|--------|
| Local stack manager | 4 wk | 🟡 In progress | Install/manage runtimes, databases, proxies |
| P2P publishing layer | 4 wk | 🟡 In progress | Global DHT, NAT traversal, P2P proxy |
| AI agent framework | 6 wk | 🟡 In progress | Scaffolding, code generation, deployment |
| Web architectures | 4 wk | 📋 Planned | Templates for all stacks (Node, PHP, Python, Go, Ruby) |
| Desktop app (Tauri) | 4 wk | 🟡 In progress | Tray UI, service panel, browser view |
| Cloud Toggle | 2 wk | 📋 Planned | One-click to AWS/GCP |
| Ship + docs | 2 wk | 📋 Planned | Installers, website, tutorials |

---

## Business Model

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | All architectures, AI agents, `.dweb` domain, P2P hosting |
| **Relay** | $3/mo | Keep site online when your machine is off (cloud cache) |
| **Cloud Shift** | $5-10/mo | One-click deploy to AWS/GCP with managed infra |
| **Enterprise** | Custom | Private DHT, white-label, on-prem deployment |

---

## License

MIT
