# dweb — P2P Self-Hosting OS

> **One install. Every stack. Your own internet.**

dweb is a **self-hosted P2P dev portal** that transforms any machine into a **personal cloud** — a decentralized node where you own your services, your domains, and your data. Built-in AI agents help you build, host, and publish any web architecture from your own machine, accessible to the world via P2P.

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-WSL%20%7C%20Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/typescript-5.5-blue)]()
[![React](https://img.shields.io/badge/react-19-61dafb)]()
[![Rust](https://img.shields.io/badge/rust-tauri%20v2-dea584)]()
[![AI Models](https://img.shields.io/badge/AI-15%2B%20providers-7C3AED)]()
[![GitHub Release](https://img.shields.io/github/v/release/Awaiswilll/dweb?include_prereleases&label=release)]()
[![GitHub Issues](https://img.shields.io/github/issues/Awaiswilll/dweb)]()

---

## What is dweb?

dweb is **not just an app** — it's a complete self-hosting environment that provides:

```
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
```

---

## Screenshots

| Dashboard | AI Agent | P2P Instances |
|:---:|:---:|:---:|
| ![Dashboard](screenshots/dashboard.png) | ![AI Agent](screenshots/ai-agent.png) | ![P2P Instances](screenshots/2-instances.png) |

| Browser | P2P Network | Customizable Page |
|:---:|:---:|:---:|
| ![Browser](screenshots/browser.png) | ![P2P](screenshots/p2p.png) | ![Static Page](screenshots/static-page.png) |

| Domains | Docs | Settings |
|:---:|:---:|:---:|
| ![Domains](screenshots/domains.png) | ![Docs](screenshots/docs.png) | ![Settings](screenshots/settings.png) |

---

## Core Features

### 🖥️ Service Management Dashboard
Start/stop services with one click, monitor CPU/memory/ports, view logs:
- **Static Sites** — Serve any HTML/CSS/JS folder
- **Node.js APIs** — Express, Fastify, and more
- **Python Web Apps** — Flask, FastAPI, Django
- **PHP Sites** — WordPress, Laravel, or plain PHP
- **File Browser** — Upload, manage, and share files through your browser
- **Custom Services** — Any port, any stack

### 🌐 P2P Networking & Discovery
Every dweb installation is a **node** on a decentralized network:
- **Peer discovery** — Find other dweb nodes automatically
- **Direct connections** — WebRTC encrypted P2P links
- **Relay fallback** — WebSocket + HTTP polling for NAT traversal
- **P2P File Transfer** — Share files directly between instances
- **Multi-instance** — Run multiple peers, access each other's services

### 🏷️ .dweb Domain System
Register and manage domains on the decentralized network:
- **Free tier** — 1 `.dweb` domain, basic P2P hosting
- **Premium tier** ($3/mo) — 5 domains, relay cache
- **Business tier** ($10/mo) — unlimited domains, cloud shift

### 🤖 AI Build Agent with 15+ Providers
Generate full-stack applications from natural language:
- **15+ AI providers**: Ollama, NVIDIA NIM, Groq, Gemini, DeepSeek, Mistral, OpenAI, Anthropic, Together, OpenRouter, HuggingFace, Fireworks, Cohere, Cerebras, xAI, Hyperbolic
- **100+ free models** — No API key needed for most providers
- **Offline-capable** — Ollama runs 100% locally
- **OpenCode CLI integration** — Full agentic coding workflow

### 📁 P2P File Sharing
Drag-and-drop file sharing between dweb instances:
- Upload files via browser
- Share directly to P2P peers
- Download shared files from any instance
- File discovery across the P2P network

### 🔧 Built-in Browser with dweb Protocol
Full browser tab with `dweb://` protocol support:
- Browse the web within dweb
- Tutorials for building sites, APIs, and PHP apps
- Bookmark manager
- Multiple search engines

---

## How dweb Works

### Runtime Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Browser (port 49737)                     │
│              Access from any device on network              │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│                   dweb Core (Node.js)                       │
│                                                             │
│  ┌────────────────────────────┐  ┌──────────────────────┐  │
│  │   React Frontend (Vite)    │  │   API Modules        │  │
│  │   TypeScript + React 19    │  │   server/*.cjs       │  │
│  │                            │  │                      │  │
│  │  Dashboard  BrowserView    │  │  api-services.cjs    │  │
│  │  AI Agent   Domains        │  │  api-relay.cjs       │  │
│  │  Repos      Integrations   │  │  api-collab.cjs      │  │
│  │  Settings   Docs           │  │  api-fileshare.cjs   │  │
│  │  P2P Transfer              │  │  api-opencode.cjs    │  │
│  └────────────────────────────┘  │  api-ollama.cjs      │  │
│                                   │  api-system.cjs      │  │
│  ┌────────────────────────────┐  │  router.cjs           │  │
│  │   Core Modules             │  │  state.cjs            │  │
│  │   index.cjs (entry)       │  │  discovery.cjs        │  │
│  │   config.cjs               │  │  relay-tcp.cjs        │  │
│  │   helpers.cjs              │  │  helpers.cjs          │  │
│  └────────────────────────────┘  └──────────────────────┘  │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              P2P Relay Daemon (port 49736)              │ │
│  │  tools/dweb-relay.cjs — discovery, signaling           │ │
│  │  WebSocket push + HTTP polling + TCP relay             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Tauri Desktop Shell (optional)                  │ │
│  │  Rust backend: P2P (HyperDHT), domains, git, AI       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Installation

### Option 1: Quick Start (Any Platform)

**Prerequisites:** Node.js 18+, npm

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npm run build
node server/index.cjs
```

Open **http://localhost:49737** in your browser. Your dweb portal is running.

### Option 2: Development Mode (with HMR)

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npm run dev          # Vite dev server on port 5173
node server/index.cjs  # API server on port 49737
```

### Option 3: Windows Native App (Tauri Desktop)

**Prerequisites:** Rust toolchain, Node.js 22+

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npx tauri build
```

Installer output: `src-tauri\target\release\bundle\nsis\dweb_x64-setup.exe`

### Option 4: Docker

```bash
docker run -d \
  -p 49737:49737 \
  -p 49736:49736 \
  -v dweb-data:/root/.dweb \
  --name dweb \
  dweb/dweb:latest
```

---

## AI Models — 15+ Providers, 100+ Free Models

### Free / No API Key Required

| Provider | Models | How It Works |
|----------|--------|-------------|
| **Ollama (Local)** | 50+ models | Runs on your machine, 100% free, offline-capable |
| **Groq** | 9+ models | Free tier, ultra-fast inference (LPU chips) |
| **Google Gemini** | 5+ models | Free tier via Google AI Studio |
| **Together AI** | 6+ models | Free tier for popular open models |
| **OpenRouter** | 7+ models | Free tier aggregates multiple providers |
| **Hugging Face** | 5+ models | Free inference API |
| **NVIDIA NIM** | 13+ models | Free tier includes Nemotron models |
| **Cerebras** | 4+ models | Free tier, ultra-fast CS-2 chips |
| **DeepSeek** | 3+ models | Free/cheap API, excellent code models |
| **Hyperbolic** | 5+ models | Free tier for open models |

### API Key Required (Free Tiers Available)

| Provider | Free Tier | Notable Models |
|----------|-----------|---------------|
| **OpenAI** | $5 credit | GPT-4o, GPT-4o-mini, o3-mini |
| **Anthropic** | $5 credit | Claude 3.5 Sonnet, Haiku |
| **Mistral AI** | €2 credit | Mistral Large, Codestral, Pixtral |
| **Fireworks AI** | $5 credit | Llama, Qwen, DeepSeek |
| **Cohere** | $5 credit | Command R+, Command R |
| **xAI (Grok)** | Free tier | Grok 2, Grok 2 Vision |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 5.5, Vite 6, React Router 7, Lucide React |
| **Backend** | Node.js modular server (server/*.cjs) |
| **Desktop** | Tauri v2 (Rust) — optional desktop shell |
| **P2P** | HyperDHT, WebRTC, WebSocket relay, HTTP polling, TCP relay |
| **AI** | 15+ providers: Ollama, NVIDIA NIM, Groq, Gemini, DeepSeek, Mistral, OpenAI, Anthropic, Together, OpenRouter, HuggingFace, Fireworks, Cohere, Cerebras, xAI, Hyperbolic |
| **Database** | sled (embedded Rust), localStorage |
| **Packaging** | WSL distro, MSIX (Store), NSIS (Windows), DMG (macOS), AppImage/DEB (Linux), Docker |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/services` | GET | List running services |
| `/api/service/start` | POST | Start a new service |
| `/api/service/stop` | POST | Stop a running service |
| `/api/domain/services` | GET | List P2P-discovered remote services |
| `/collab/services` | GET | List P2P collaboration services |
| `/dweb-status` | GET | System status (uptime, peers, mode) |
| `/api/ollama/status` | GET | Ollama installation status |
| `/api/opencode/run` | POST | Run opencode CLI command |
| `/fileshare/api/list` | GET | List shared files |
| `/fileshare/api/upload` | POST | Upload a file |
| `/welcome` | GET | Welcome page |
| `/welcome/source` | GET | Welcome page source |

---

## Project Structure

```
dweb/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── views/              # Page views
│   │   ├── Dashboard.tsx   # Service management dashboard
│   │   ├── AIAgent.tsx     # AI agent with multi-provider support
│   │   ├── BrowserView.tsx # Built-in browser with dweb:// protocol
│   │   ├── Domains.tsx     # .dweb domain management
│   │   ├── Docs.tsx        # In-app documentation
│   │   ├── Settings.tsx    # App settings
│   │   ├── Integrations.tsx
│   │   ├── Repositories.tsx
│   │   └── P2PTransfer.tsx # P2P file transfer
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
│   ├── api-opencode.cjs    # OpenCode CLI integration
│   ├── api-ollama.cjs      # Ollama status API
│   ├── api-system.cjs      # System status API
│   ├── state.cjs           # Shared state (hosted services, peers)
│   ├── config.cjs          # Configuration
│   ├── discovery.cjs       # P2P peer discovery
│   ├── relay-tcp.cjs       # TCP relay
│   └── helpers.cjs         # Utility functions
├── src-tauri/              # Rust/Tauri desktop backend
├── tools/                  # Utility scripts
│   ├── dweb-server.cjs     # Legacy monolith (for reference)
│   └── dweb-relay.cjs      # P2P relay daemon
├── packaging/              # Distribution packages
├── welcome/                # Welcome page HTML
└── screenshots/            # App screenshots
```

---

## Development

```bash
# Frontend development (HMR)
npm run dev

# Type check
npm run typecheck
npm run lint

# Production build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Testing

dweb uses [Vitest](https://vitest.dev/) for unit and integration tests:

```bash
# Run all tests
npm test

# Watch mode for TDD
npm run test:watch

# With coverage
npm run test:coverage
```

See [WINDOWS-TESTING.md](WINDOWS-TESTING.md) for Windows-specific testing instructions.

---

## Best Use Cases

### 1. Personal Cloud Development Environment
Replace Docker Compose, ngrok, and Heroku with a single install. Start/stop services, view logs, and manage ports — all from your browser.

### 2. AI-Powered Code Generation
Use the built-in AI Build Agent to scaffold full-stack apps from natural language. With Ollama running locally, it works **completely offline**.

### 3. P2P Service Sharing
Host a service on your dweb node and share it directly with other dweb users across the P2P network. No central server, no CDN, no cloud bill.

### 4. Multi-Instance Collaboration
Run multiple dweb instances on different machines. Each instance discovers the others via P2P relay, and services are accessible across instances.

### 5. P2P File Sharing
Drag-and-drop file sharing between dweb instances. Files are transferred directly P2P, stored locally on the receiving instance.

### 6. Self-Hosted Websites & Portfolios
Deploy static sites, blogs, and portfolios on your own machine with a `.dweb` domain.

### 7. Offline-First Development
With Ollama running locally, the AI Build Agent works without internet. Perfect for air-gapped environments or privacy-conscious workflows.

---

## Business Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 1 .dweb domain, basic P2P hosting, community support |
| **Premium** | $3/mo | 5 domains, relay cache (always online), priority support |
| **Business** | $10/mo | Unlimited domains, cloud shift, SLA |

See [BUSINESS-PLAN.md](BUSINESS-PLAN.md) for the complete business model.

---

## Contributing

dweb is open source (MIT License). We welcome contributions in:

- 🐧 **WSL Distro** — Alpine Linux packaging
- 🪟 **Windows Packaging** — MSIX, NSIS, Microsoft Store
- 🤖 **AI Providers** — New provider integrations and model catalogs
- 🌐 **P2P Networking** — HyperDHT improvements, NAT traversal
- 🎨 **UI/UX** — Dashboard polish, accessibility, themes
- 📝 **Documentation** — Guides, tutorials, API docs
- 🧪 **Testing** — Unit, integration, and E2E tests

### Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/dweb.git
cd dweb

# 2. Install dependencies
npm install

# 3. Start development
npm run dev

# 4. Run tests
npm test

# 5. Create a feature branch
git checkout -b feature/your-feature

# 6. Commit and push
git commit -m "feat: add your feature"
git push origin feature/your-feature

# 7. Open a Pull Request
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and recent changes.

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <em>Be kind and creative to serve mankind.</em>
</p>

<p align="center">
  <strong>dweb — One install. Every stack. Your own internet.</strong>
</p>
