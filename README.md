# dweb — Your Self-Hosted Dev Portal & P2P Platform

Run services, register `.dweb` domains, code with AI, and connect peer-to-peer — all on your own hardware.

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-WSL%20%7C%20Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/typescript-5.5-blue)]()
[![React](https://img.shields.io/badge/react-19-61dafb)]()
[![Rust](https://img.shields.io/badge/rust-tauri%20v2-dea584)]()
[![AI Models](https://img.shields.io/badge/AI-15%2B%20providers%20%7C%20100%2B%20free%20models-7C3AED)]()

---

## Screenshots

| Dashboard | AI Agent | Domains |
|:---:|:---:|:---:|
| ![Dashboard](screenshots/dashboard.png) | ![AI Agent](screenshots/ai-agent.png) | ![Domains](screenshots/domains.png) |

| Browser | Repositories | Integrations |
|:---:|:---:|:---:|
| ![Browser](screenshots/browser.png) | ![Repositories](screenshots/repositories.png) | ![Integrations](screenshots/integrations.png) |

---

## What is dweb?

dweb is a **self-hosted development platform** that turns any machine into a personal cloud. It combines a dev portal, P2P networking, AI-powered code generation, and domain management into a single installable application.

Think of it as your **personal Heroku + GitHub Copilot + Cloudflare Pages** — running entirely on your hardware, with optional peer-to-peer connectivity for sharing with others.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| 🖥️ **Dev Portal** | Browser-based dashboard to manage services, runtimes, and deployments |
| 🌐 **P2P Networking** | HyperDHT + WebRTC for direct peer-to-peer connections between dweb nodes |
| 🏷️ **.dweb Domains** | Register and manage `.dweb` domains with Free / Premium / Business tiers |
| 🤖 **AI Build Agent** | 15+ AI providers, 100+ free models (Ollama, NVIDIA NIM, Groq, Gemini, DeepSeek, etc.) |
| 📁 **File Browser** | Upload, manage, and share files through your browser |
| 🔀 **Git Integration** | Clone, manage, and push repositories with GitHub OAuth |
| ☁️ **Cloud Deploy** | One-click deploy to AWS, Netlify, Vercel |
| 🐧 **WSL Distro** | Alpine Linux-based WSL distribution for Windows |
| 🪟 **Windows Native** | Tauri desktop app + MSIX package for direct Windows 11 installation |
| 🔌 **Extensible** | REST API for adding custom services and integrations |

---

## Best Use Cases

### 1. Local Development Environment
Replace Docker Compose with a visual dashboard. Start/stop services, view logs, and manage ports — all from your browser.

```bash
# Start dweb, then manage everything at http://localhost:49737
node tools/dweb-server.cjs
```

### 2. AI-Powered Code Generation
Use the built-in AI Build Agent to scaffold full-stack apps from natural language:
- "Build a blog with React, Node.js, and PostgreSQL"
- "Create a FastAPI CRUD API with authentication"
- "Generate a PHP admin dashboard with Chart.js"

**100+ free models available** — no API key needed with Ollama (local) or free tiers from NVIDIA NIM, Groq, Together AI, and more.

### 3. P2P File & Service Sharing
Share services and files directly with other dweb users — no central server needed. Each node acts as both client and server.

### 4. Self-Hosted Static Sites
Host personal websites, portfolios, or documentation on your own machine with a `.dweb` domain. Accessible via P2P or local network.

### 5. Developer Portfolio / Demo Environment
Showcase projects to clients or collaborators by giving them access to your dweb portal. Each project gets its own service, domain, and AI-assisted build pipeline.

### 6. Offline-First Development
With Ollama running locally, the AI Build Agent works **completely offline** — no internet required for code generation, scaffolding, or debugging assistance.

### 7. Windows Developer Workstation
Install via WSL distro or native Windows app. Perfect for developers who want a Linux dev environment without dual-booting.

---

## Installation

### Option 1: Quick Start (Node.js Server)

**Prerequisites:** Node.js 18+, npm

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npm run build
node tools/dweb-server.cjs
```

Open **http://localhost:49737** in your browser.

### Option 2: Windows WSL Distro

**Prerequisites:** Windows 10/11 with WSL2 enabled

```powershell
# Method A: Import pre-built distro (after building)
wsl --import dweb C:\dweb dweb-distro.tar.gz --version 2

# Method B: Run the import script
.\packaging\wsl\import-dweb-wsl.ps1

# Start dweb
wsl -d dweb
```

Access at **http://localhost:49737** from Windows browser.

### Option 3: Windows Native App (Tauri Desktop)

**Prerequisites:** Rust toolchain, Node.js 22+

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npx tauri build
```

The installer will be at:
- `src-tauri\target\release\bundle\nsis\dweb_x64-setup.exe`

### Option 4: Windows MSIX Package (Microsoft Store Ready)

```powershell
# Build the MSIX package
.\packaging\win32\build-msix.ps1
```

The MSIX can be sideloaded or submitted to the Microsoft Store.

### Option 5: Linux (Direct Install)

**Prerequisites:** Node.js 18+, WebKit2GTK (for Tauri desktop)

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
# Build the Alpine Linux-based WSL distro tarball
bash packaging/wsl/build-wsl-distro.sh

# Output: packaging/wsl/dweb-distro.tar.gz
# Import with: wsl --import dweb <install-location> dweb-distro.tar.gz
```

---

## AI Models — 15+ Providers, 100+ Free Models

dweb supports **15+ AI providers** with **100+ free models** out of the box. No single point of failure — switch providers instantly.

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
2. Add NVIDIA NIM as a provider in dweb Settings → AI Models
3. Select any Nemotron model and start building

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Browser (port 49737)                    │
└─────────────────────────┬─────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────┐
│                   dweb Application                          │
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
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.5, Vite 6, React Router 7, Lucide React |
| Backend | Node.js (zero-dependency HTTP server), Express-like routing |
| Desktop | Tauri v2 (Rust) — optional desktop shell |
| P2P | HyperDHT, WebRTC, WebSocket relay, HTTP fallback |
| AI | 15+ providers: Ollama, NVIDIA NIM (Nemotron), Groq, Gemini, DeepSeek, Mistral, OpenAI, Anthropic, Together, OpenRouter, HuggingFace, Fireworks, Cohere, Cerebras, xAI, Hyperbolic |
| Database | sled (embedded), localStorage fallback |
| Base OS | Alpine Linux (WSL distro) |
| Packaging | NSIS (Windows), MSIX (Store), DMG (macOS), AppImage/DEB (Linux) |

---

## .dweb Domain Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | 1 .dweb domain, basic P2P hosting |
| Premium | $3/mo | 5 domains, relay cache (always online) |
| Business | $10/mo | Unlimited domains, cloud shift, priority support |

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
│   ├── wsl/                # WSL distro builder
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

## Marketplace / Store

| Platform | Status | Link |
|----------|--------|------|
| Microsoft Store | Coming Soon | [dweb for WSL](https://apps.microsoft.com) |
| GitHub Releases | Active | [Releases](https://github.com/Awaiswilll/dweb/releases) |
| Website | Planned | [https://dweb.dev](https://dweb.dev) |
| Docker Hub | Planned | [dweb/dweb](https://hub.docker.com/r/dweb/dweb) |

---

## Contributing

Contributions are welcome! We're looking for help with:

- 🐧 **WSL Distro** — Alpine Linux packaging and optimization
- 🪟 **Windows Packaging** — MSIX, NSIS, Microsoft Store submission
- 🤖 **AI Providers** — Adding new AI provider integrations
- 🌐 **P2P Networking** — HyperDHT improvements, NAT traversal
- 🎨 **UI/UX** — Dashboard polish, accessibility, themes
- 📝 **Documentation** — Guides, tutorials, API docs
- 🧪 **Testing** — Unit, integration, and E2E tests

### Getting Started

```bash
# 1. Fork the repository
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/dweb.git
cd dweb

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev

# 5. Run tests
npm test

# 6. Create a feature branch
git checkout -b feature/your-feature

# 7. Commit and push
git commit -m "feat: add your feature"
git push origin feature/your-feature

# 8. Open a Pull Request
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Good First Issues

Look for issues labeled `good-first-issue` on our [GitHub Issues](https://github.com/Awaiswilll/dweb/issues) page.

---

## Business Plan

See [BUSINESS-PLAN.md](BUSINESS-PLAN.md) for the complete business model, monetization strategy, and roadmap.

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
