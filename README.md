# dweb OS — Your Decentralized Operating System

> **One install. Every stack. Your own internet.**

dweb OS is a **minimalist Linux-based operating system** designed for peer-to-peer connectivity, self-hosting, and building applications across any technology stack. It transforms any Windows 11 machine, Linux box, or bare-metal server into a **personal cloud** — a decentralized node on the dweb network where you own your services, your domains, and your data.

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-WSL%20%7C%20Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/typescript-5.5-blue)]()
[![React](https://img.shields.io/badge/react-19-61dafb)]()
[![Rust](https://img.shields.io/badge/rust-tauri%20v2-dea584)]()
[![AI Models](https://img.shields.io/badge/AI-15%2B%20providers%20%7C%20100%2B%20free%20models-7C3AED)]()
[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Name%20Reserved-0078D4)]()
[![GitHub Release](https://img.shields.io/github/v/release/Awaiswilll/dweb?include_prereleases&label=release)]()
[![GitHub Issues](https://img.shields.io/github/issues/Awaiswilll/dweb)]()
[![GitHub Discussions](https://img.shields.io/github/discussions/Awaiswilll/dweb)]()

---

## The Problem dweb OS Solves

Today's developers face a fragmented reality:

- **Cloud platforms** lock you into vendor ecosystems (AWS, Vercel, Heroku)
- **AI coding tools** require expensive subscriptions and send your code to third parties
- **Self-hosting** is complex — Docker, nginx, SSL, DNS, reverse proxies
- **P2P networking** is powerful but inaccessible to most developers
- **Domain ownership** is centralized and costs money per domain

**dweb OS unifies all of this into one installable system.** No cloud vendor. No subscription. No complexity. Just your machine, your services, your network.

---

## What is dweb OS?

dweb OS is **not just an app** — it's a complete operating environment built on Alpine Linux that provides:

```
┌─────────────────────────────────────────────────────────────┐
│                       dweb OS                                │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────────┐ │
│  │  Dev OS   │  │  P2P Net  │  │      AI Build Engine     │ │
│  │           │  │           │  │                          │ │
│  │ Services  │  │ HyperDHT  │  │  15+ Providers           │ │
│ │ Domains   │  │ WebRTC    │  │  100+ Free Models         │ │
│  │ Runtimes  │  │ Relay     │  │  Ollama + Nemotron        │ │
│  │ File Sys  │  │ Mesh      │  │  Local + Cloud            │ │
│  └───────────┘  └───────────┘  └──────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Browser Portal (port 49737)              │  │
│  │  Dashboard │ AI Agent │ Browser │ Domains │ Repos    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Three Layers of dweb OS

#### Layer 1: The Operating System
A **minimalist Alpine Linux distribution** optimized for development workloads. Runs as:
- **WSL distro** on Windows 11 (install from Microsoft Store)
- **Native Linux** on any bare-metal or VM
- **Docker container** for quick testing
- **Tauri desktop app** for Windows-native experience

#### Layer 2: The P2P Network
Every dweb OS installation is a **node** on a decentralized network powered by:
- **HyperDHT** — Distributed hash table for peer discovery and routing
- **WebRTC** — Direct encrypted connections between peers
- **Relay Daemon** — Bootstrap and signaling for NAT traversal
- **WebSocket + HTTP fallback** — Works behind any firewall

Your node can host services that other dweb users access directly — no central server, no CDN, no cloud provider.

#### Layer 3: The AI Build Engine
A **multi-provider AI agent** that scaffolds, generates, and deploys full-stack applications from natural language:
- **15+ AI providers** — Ollama, NVIDIA NIM, Groq, Gemini, DeepSeek, Mistral, OpenAI, Anthropic, and more
- **100+ free models** — No API key needed for most providers
- **Offline-capable** — Ollama runs 100% locally on your GPU
- **NVIDIA Nemotron** — Free access to NVIDIA's open-weight models via NIM API

---

## Screenshots

| Dashboard | AI Agent | Domains |
|:---:|:---:|:---:|
| ![Dashboard](screenshots/dashboard.png) | ![AI Agent](screenshots/ai-agent.png) | ![Domains](screenshots/domains.png) |

| Browser | Repositories | Integrations |
|:---:|:---:|:---:|
| ![Browser](screenshots/browser.png) | ![Repositories](screenshots/repositories.png) | ![Integrations](screenshots/integrations.png) |

---

## Core Features

### 🖥️ Dev Portal Dashboard
A browser-based desktop environment to manage everything:
- Start/stop services with one click
- Monitor CPU, memory, and port usage
- View logs and manage deployments
- Access your dweb OS from any browser on the network

### 🌐 P2P Networking
Connect directly with other dweb OS nodes:
- **Peer discovery** via HyperDHT — find other nodes automatically
- **Direct connections** via WebRTC — encrypted, no middleman
- **Relay fallback** — works behind NAT and firewalls
- **Mesh networking** — your node routes traffic for the network

### 🏷️ .dweb Domain System
Register and manage domains on the decentralized network:
- **Free tier** — 1 `.dweb` domain, basic P2P hosting
- **Premium tier** ($3/mo) — 5 domains, relay cache (always online)
- **Business tier** ($10/mo) — unlimited domains, cloud shift, priority support

### 🤖 AI Build Agent
Generate full-stack applications from natural language:
- "Build a blog with React, Node.js, and PostgreSQL"
- "Create a FastAPI CRUD API with authentication"
- "Generate a PHP admin dashboard with Chart.js"

Supports **any stack**: React, Vue, Svelte, Angular, FastAPI, Django, Flask, Express, Fastify, Gin, Rails, Laravel, Go, Ruby, PHP, Python, Node.js, and more.

### 📁 File Browser
Upload, manage, and share files through your browser — no FTP, no S3, just your machine.

### 🔀 Git Integration
Full Git workflow with GitHub OAuth:
- Clone repositories from GitHub, GitLab, Bitbucket
- Branch, commit, push from the dashboard
- Import repos directly into your dweb OS workspace

### ☁️ Cloud Deployment
One-click deploy to external platforms when you need them:
- **AWS S3** — Static site hosting
- **Netlify** — Full-stack deployments
- **Vercel** — Serverless functions and edge deployments

---

## How dweb OS Works

### Installation Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Windows 11  │────▶│  Install     │────▶│  dweb OS     │────▶│  Browser     │
│  / Linux /   │     │  WSL / MSIX  │     │  Starts      │     │  Portal      │
│  Mac / Docker│     │  / Docker    │     │  (port 49737)│     │  Ready       │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Runtime Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Browser (port 49737)                    │
│              Access from any device on network             │
└─────────────────────────┬─────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────┐
│                   dweb OS Core                              │
│                                                             │
│  ┌──────────────────────────┐  ┌─────────────────────────┐ │
│  │   React Frontend         │  │   Node.js Server        │ │
│  │   (Vite + TypeScript)    │  │   (dweb-server.cjs)     │ │
│  │                          │  │                         │ │
│  │  Dashboard  BrowserView  │  │  Static serving         │ │
│  │  AI Agent   Domains      │  │  AI API proxy (15+)     │ │
│  │  Repos      Integrations │  │  WebRTC signaling       │ │
│  │  Settings   Docs         │  │  Rate limiting          │ │
│  └──────────────────────────┘  └──────────┬──────────────┘ │
│                                            │                │
│  ┌─────────────────────────────────────────▼──────────────┐ │
│  │              Tauri Desktop Shell (optional)             │ │
│  │  Rust backend: P2P (HyperDHT), domains (sled),        │ │
│  │  cloud deployment (AWS SigV4, Netlify, Vercel),       │ │
│  │  git integration, sandboxed process execution          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              P2P Relay Daemon (port 49736)              │ │
│  │  dweb-relay.cjs — bootstrap, discovery, signaling      │ │
│  │  WebSocket push + HTTP polling fallback + TCP relay    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

          ┌─────────────────────────────────────┐
          │         AI Providers (15+)           │
          │  Ollama │ NVIDIA NIM │ Groq │ Gemini │
          │  DeepSeek │ Together │ OpenRouter   │
          │  Mistral │ Fireworks │ Cohere │ xAI  │
          │  HuggingFace │ Cerebras │ Hyperbolic │
          └─────────────────────────────────────┘

          ┌─────────────────────────────────────┐
          │         Other dweb OS Nodes          │
          │  ← P2P →  ← P2P →  ← P2P →         │
          │  Your services accessible to peers   │
          └─────────────────────────────────────┘
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
node tools/dweb-server.cjs
```

Open **http://localhost:49737** in your browser. Your dweb OS is running.

### Option 2: Windows WSL Distro (Recommended for Windows)

**Prerequisites:** Windows 10/11 with WSL2 enabled

```powershell
# Import the dweb OS distro
wsl --import dweb C:\dweb dweb-distro.tar.gz --version 2

# Start dweb OS
wsl -d dweb

# Or run the import script
.\packaging\wsl\import-dweb-wsl.ps1
```

Access at **http://localhost:49737** from any Windows browser.

### Option 3: Windows Native App (Tauri Desktop)

**Prerequisites:** Rust toolchain, Node.js 22+

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npx tauri build
```

Installer output: `src-tauri\target\release\bundle\nsis\dweb_x64-setup.exe`

### Option 4: Microsoft Store (Coming Soon)

**Status:** App name "dweb" reserved in Microsoft Partner Center.

Once published:
```powershell
# Install from Microsoft Store
ms-windows-store://pdp/?ProductId=<product-id>
```

### Option 5: Linux (Native)

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libssl-dev

# Build and run
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npm run build
node tools/dweb-server.cjs
```

### Option 6: Docker

```bash
docker run -d \
  -p 49737:49737 \
  -p 49736:49736 \
  -v dweb-data:/root/.dweb \
  --name dweb \
  dweb/dweb:latest
```

### Option 7: Build WSL Distro from Source

```bash
# Build the Alpine Linux-based dweb OS distro
bash packaging/wsl/build-wsl-distro.sh

# Output: packaging/wsl/dweb-distro.tar.gz
# Import: wsl --import dweb <install-location> dweb-distro.tar.gz
```

---

## AI Models — 15+ Providers, 100+ Free Models

dweb OS ships with **15+ AI providers** and **100+ free models**. No single point of failure — switch providers instantly.

### Free / No API Key Required

| Provider | Models | How It Works |
|----------|--------|-------------|
| **Ollama (Local)** | 50+ models | Runs on your machine, 100% free, offline-capable |
| **Groq** | 9+ models | Free tier, ultra-fast inference (LPU chips) |
| **Google Gemini** | 5+ models | Free tier via Google AI Studio |
| **Together AI** | 6+ models | Free tier for popular open models |
| **OpenRouter** | 7+ models | Free tier aggregates multiple providers |
| **Hugging Face** | 5+ models | Free inference API |
| **NVIDIA NIM** | 13+ models | Free tier includes **Nemotron** models |
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

### NVIDIA Nemotron Models (Free via NIM)

Nemotron is NVIDIA's family of open-weight models, available **free** through the NVIDIA NIM API:

| Model | Size | Best For |
|-------|------|----------|
| **Nemotron Mini 4B** | 4B | Fast responses, low latency |
| **Nemotron 8B** | 8B | Balanced general tasks |
| **Nemotron 70B** | 70B | Complex reasoning, code generation |
| **Nemotron 4 340B** | 340B | Maximum capability, research |

To use Nemotron:
1. Get a free API key at [build.nvidia.com](https://build.nvidia.com)
2. Add NVIDIA NIM as a provider in dweb OS Settings → AI Models
3. Select any Nemotron model and start building

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Base OS** | Alpine Linux (minimal, secure, <100MB) |
| **Frontend** | React 19, TypeScript 5.5, Vite 6, React Router 7, Lucide React |
| **Backend** | Node.js (zero-dependency HTTP server), Express-like routing |
| **Desktop** | Tauri v2 (Rust) — optional desktop shell |
| **P2P** | HyperDHT, WebRTC, WebSocket relay, HTTP fallback |
| **AI** | 15+ providers: Ollama, NVIDIA NIM (Nemotron), Groq, Gemini, DeepSeek, Mistral, OpenAI, Anthropic, Together, OpenRouter, HuggingFace, Fireworks, Cohere, Cerebras, xAI, Hyperbolic |
| **Database** | sled (embedded Rust), localStorage fallback |
| **Packaging** | WSL distro, MSIX (Store), NSIS (Windows), DMG (macOS), AppImage/DEB (Linux), Docker |

---

## .dweb Domain Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 1 .dweb domain, basic P2P hosting |
| **Premium** | $3/mo | 5 domains, relay cache (always online) |
| **Business** | $10/mo | Unlimited domains, cloud shift, priority support |

---

## Best Use Cases

### 1. Personal Cloud Development Environment
Replace Docker Compose, ngrok, and Heroku with a single install. Start/stop services, view logs, and manage ports — all from your browser.

### 2. AI-Powered Code Generation (Offline)
Use the built-in AI Build Agent to scaffold full-stack apps from natural language. With Ollama running locally, it works **completely offline** — no internet, no API keys, no data leaving your machine.

### 3. P2P Service Sharing
Host a service on your dweb OS node and share it directly with other dweb users. No central server, no CDN, no cloud bill. Each node is both client and server.

### 4. Self-Hosted Websites & Portfolios
Deploy static sites, blogs, and portfolios on your own machine with a `.dweb` domain. Accessible via P2P network or local LAN.

### 5. Developer Demo & Portfolio Environment
Showcase projects to clients or collaborators by giving them access to your dweb OS portal. Each project gets its own service, domain, and AI-assisted build pipeline.

### 6. Offline-First Development
With Ollama running locally, the AI Build Agent works without internet. Perfect for air-gapped environments, travel, or privacy-conscious workflows.

### 7. Windows Developer Workstation
Install dweb OS via WSL distro or native Windows app. Get a full Linux dev environment on Windows 11 without dual-booting or VMs.

### 8. Decentralized Team Infrastructure
Each team member runs a dweb OS node. Services, files, and code are shared peer-to-peer. No central server to maintain or pay for.

---

## Development

```bash
# Frontend only (HMR)
npm run dev

# Type check
npm run lint
npm run typecheck

# Production build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Tauri desktop app
npx tauri dev
npx tauri build
```

### Project Structure

```
dweb/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── views/              # Page views (Dashboard, AI Agent, etc.)
│   ├── styles/             # CSS styles
│   ├── types.ts            # TypeScript type definitions
│   ├── safe-invoke.ts      # Tauri IPC wrapper
│   └── relay-client.ts     # P2P relay client
├── src-tauri/              # Rust/Tauri desktop backend
│   ├── src/
│   │   ├── lib.rs          # Main Tauri commands
│   │   ├── ai.rs           # AI provider integration
│   │   ├── p2p.rs          # P2P networking (HyperDHT)
│   │   ├── domain.rs       # .dweb domain management
│   │   ├── git.rs          # Git operations
│   │   ├── github.rs       # GitHub OAuth & API
│   │   ├── cloud.rs        # Cloud deployment (AWS, Netlify, Vercel)
│   │   ├── sandbox.rs      # Sandboxed process execution
│   │   ├── stack.rs        # Stack scaffolding
│   │   ├── database.rs     # Sled embedded DB
│   │   └── config.rs       # Configuration management
│   └── tauri.conf.json     # Tauri configuration
├── tools/                  # Server-side scripts
│   ├── dweb-server.cjs     # Main HTTP server (port 49737)
│   ├── dweb-relay.cjs      # P2P relay daemon (port 49736)
│   └── connectivity-test.cjs
├── packaging/              # Distribution packages
│   ├── wsl/                # WSL distro builder (Alpine Linux)
│   │   ├── build-wsl-distro.sh
│   │   ├── import-dweb-wsl.ps1
│   │   └── Dockerfile
│   └── win32/              # Windows packaging
│       ├── build-msix.ps1
│       ├── dweb-desktop/
│       └── dweb-wsl-distro/
└── .github/workflows/      # CI/CD
    └── build.yml           # Multi-platform build pipeline
```

---

## Marketplace & Distribution

| Platform | Status | Link |
|----------|--------|------|
| **Microsoft Store** | Name Reserved | [dweb](https://apps.microsoft.com) |
| **GitHub Releases** | Active | [Releases](https://github.com/Awaiswilll/dweb/releases) |
| **Website** | Planned | [https://dweb.dev](https://dweb.dev) |
| **Docker Hub** | Planned | [dweb/dweb](https://hub.docker.com/r/dweb/dweb) |

---

## Contributing

dweb OS is open source (MIT License) and built by the community. We're looking for contributors in:

- 🐧 **WSL Distro** — Alpine Linux packaging, optimization, and testing
- 🪟 **Windows Packaging** — MSIX, NSIS, Microsoft Store submission
- 🤖 **AI Providers** — Adding new AI provider integrations and model catalogs
- 🌐 **P2P Networking** — HyperDHT improvements, NAT traversal, relay optimization
- 🎨 **UI/UX** — Dashboard polish, accessibility (WCAG 2.2), themes
- 📝 **Documentation** — Guides, tutorials, API docs, architecture docs
- 🧪 **Testing** — Unit, integration, and E2E tests (Vitest + Playwright)

### Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/dweb.git
cd dweb

# 2. Install dependencies
npm install

# 3. Start development server
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

### Good First Issues

Look for issues labeled `good-first-issue` on our [GitHub Issues](https://github.com/Awaiswilll/dweb/issues) page. We currently have **5 good-first-issue** tasks ready for community contributions:

- [Theme toggle](https://github.com/Awaiswilll/dweb/issues/1) — Add dark/light mode to Settings
- [Mobile responsive design](https://github.com/Awaiswilll/dweb/issues/2) — Make dashboard work on phones
- [Service health monitoring](https://github.com/Awaiswilll/dweb/issues/3) — Health indicators on Dashboard
- [P2P status indicator](https://github.com/Awaiswilll/dweb/issues/4) — Peer connection status in navbar
- [Keyboard shortcuts](https://github.com/Awaiswilll/dweb/issues/5) — Productivity hotkeys

### Testing

See [WINDOWS-TESTING.md](WINDOWS-TESTING.md) for instructions on testing the WSL distro, Windows portable, and desktop app on Windows.

---

## Business Plan

See [BUSINESS-PLAN.md](BUSINESS-PLAN.md) for the complete business model, monetization strategy, and roadmap.

**Revenue Model:**
- **Free tier** — 1 domain, basic P2P, community support
- **Premium** ($3/mo) — 5 domains, relay cache, priority support
- **Business** ($10/mo) — Unlimited domains, cloud shift, SLA

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and recent changes.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <em>Be kind and creative to serve mankind.</em>
</p>

<p align="center">
  <strong>dweb OS — One install. Every stack. Your own internet.</strong>
</p>
