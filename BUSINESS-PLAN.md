# dweb — Full Business Plan

## The Product

A desktop app that turns any machine into a **full-stack web server accessible worldwide via P2P**, with **free AI agents** that build, deploy, and manage everything.

**One sentence:** *Your machine is your cloud. AI builds your apps. P2P publishes them to the world.*

---

## 1. What It Does

### Host Any Web Architecture Locally

| Architecture | Components | Resource Usage |
|---|---|---|
| Static site | Any HTML/CSS/JS | ~10MB RAM |
| PHP + MySQL | Apache/Nginx + PHP 8 + MySQL | ~150MB RAM |
| Node.js + MongoDB | Express/Fastify + Mongo | ~200MB RAM |
| Python + Postgres | FastAPI/Flask + PostgreSQL | ~250MB RAM |
| Go + Redis | Gin/Fiber + Redis | ~100MB RAM |
| Ruby on Rails | Rails + SQLite/Postgres | ~300MB RAM |
| Docker compose | Any containerized stack | Variable |
| WordPress | PHP + MySQL + WP-CLI | ~200MB RAM |

All run **on the user's machine**. All **accessible from anywhere in the world** via the dweb P2P layer.

### Publish to the World via P2P

```
User's Machine                     Any dweb User (Global)
┌──────────────────────┐           ┌──────────────────────┐
│  Node.js + React     │           │  Opens in dweb app   │
│  + Postgres          │  P2P/DHT  │                      │
│                      │◄─────────►│  dweb://myapp.dweb  │
│  dweb serve ./app    │  direct   │                      │
│  ↓                   │  connect  │  Full app works:     │
│  dweb://myapp.dweb   │           │  ├─ UI loads         │
│  (global DHT)        │           │  ├─ API calls work   │
│                      │           │  └─ DB queries work  │
└──────────────────────┘           └──────────────────────┘
```

### AI Agents Build Everything for You

Free, local AI (Ollama + Qwen2.5-Coder) that understands natural language:

| Prompt | Result |
|---|---|
| "Build a blog with auth" | Full Node.js/React/PG app → running → published |
| "Create a REST API for tasks" | Express API + MongoDB → running → published |
| "Set up WordPress" | WP install + DB → running → published |
| "Make a real-time chat app" | WebSocket server + React → running → published |
| "Design an e-commerce DB" | Schema + migrations → running |
| "Deploy to the world" | P2P publish → accessible globally |

**No API keys. No internet required. 100% local.**

---

## 2. Market & Competition

### Direct Competitors

| Product | Type | Local Hosting? | P2P Global? | AI Builder? | Cost |
|---|---|---|---|---|---|
| **LocalWP** | WordPress dev tool | ✅ PHP/MySQL | ❌ | ❌ | Free/$150 |
| **XAMPP / Laragon** | Local server stack | ✅ Various | ❌ | ❌ | Free |
| **Docker Desktop** | Containers | ✅ Any | ❌ | ❌ | Free/Paid |
| **Replit** | Cloud IDE | ❌ (cloud) | ✅ (via URL) | ✅ (limited) | $0-25/mo |
| **Vercel / Netlify** | Cloud hosting | ❌ | ✅ | ❌ | Free/Paid |
| **Beaker (dead)** | P2P browser | ✅ Static | ✅ | ❌ | Free |
| **Headless** | AI dev tool | ✅ (local) | ❌ | ✅ CLI | $20/mo |
| **dweb** | **All-in-one** | **✅ Full stack** | **✅ P2P** | **✅ Free, local** | **Free** |

### The Gap

No product today combines:
1. **Full local web stack** (any language, any DB)
2. **P2P global access** (no cloud bill)
3. **Free AI agent** that builds + deploys

dweb is the first to bundle all three.

### Target Users

| User | Problem | Why dweb |
|---|---|---|
| **Indie developer** | Hosting costs $20-100/mo, DevOps overhead | Free hosting, AI deploys |
| **Hobbyist** | Wants to share a project but doesn't know DevOps | "Describe → Built → Published" |
| **Student** | Needs a portfolio site, no money for hosting | Free `.dweb` domain + free hosting |
| **Agency** | Client demos, staging sites | Local hosting, one-click share |
| **Privacy user** | Doesn't trust cloud providers | 100% self-hosted |
| **Non-technical** | Wants a website but can't code | "Build me a site" → AI does it |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     dweb Desktop App (Tauri)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AI Agent Engine (Ollama + Qwen2.5-Coder)            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐     │   │
│  │  │ Scaffold │ │ Generate │ │ Deploy & Publish │     │   │
│  │  │ Projects │ │ Code/DB  │ │ to P2P           │     │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Stack Manager (install, run, monitor)               │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │   │
│  │  │Node  │ │Python│ │ PHP  │ │ Go   │ │ Ruby     │  │   │
│  │  │ +NPM │ │+Pip  │ │+Com- │ │+Mod  │ │+Gem      │  │   │
│  │  │      │ │      │ │poser │ │      │ │          │  │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘  │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │   │
│  │  │MySQL │ │Post- │ │Mongo │ │Redis │ │ SQLite   │  │   │
│  │  │      │ │gres  │ │      │ │      │ │          │  │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  P2P Publishing Layer (HyperDHT + Hypercore)         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐     │   │
│  │  │ DHT      │ │ P2P      │ │ NAT Traversal    │     │   │
│  │  │ Registry │ │ Proxy    │ │ (STUN/UPnP/TURN) │     │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘     │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ Global .dweb Domain Resolution               │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Cloud Toggle (optional)                             │   │
│  │  One-click: Local → AWS/GCP/Azure/Netlify/Vercel    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

Access: Only through the dweb app (dweb:// protocol)
         Regular browsers cannot reach P2P-hosted content
         Both host and viewer must have dweb installed
```

---

## 4. User Flow

### Flow A: AI Builds + Publishes (Non-Technical User)

```
1. Install dweb app (2MB download)
2. Open AI Agent panel
3. Type: "Build me a landing page for my coffee shop"
4. AI:
   ├── Scaffolds HTML/CSS/JS project
   ├── Generates responsive design
   ├── Adds contact form
   ├── Starts local server
   └── Publishes to dweb://coffee-shop.dweb (global)
5. Share URL with anyone → they open in dweb app → site loads from your machine
```

**Time: ~1 minute. Cost: $0.**

### Flow B: Developer Hosts Full-Stack App

```
1. Developer builds Node.js + React + Postgres app locally
2. Runs: dweb serve ./my-app
3. dweb:
   ├── Detects Node.js project
   ├── Starts app on port 3000
   ├── Proxies through P2P layer
   ├── Registers my-app.dweb on global DHT
   └── App is live at dweb://my-app.dweb
4. Anyone with dweb can now use the full app (UI + API + DB)
```

### Flow C: One-Click to Cloud

```
1. App is running locally, accessible via P2P
2. User clicks "Shift to Cloud"
3. Selects AWS / Netlify / Vercel
4. Pastes API key
5. dweb deploys the app to cloud provider
6. App now accessible via regular HTTPS (any browser)
7. Same .dweb domain still works
```

---

## 5. Business Model

| Tier | Price | What You Get |
|---|---|---|
| **Free** | $0 | All architectures, AI agents, `.dweb` domain, P2P hosting |
| **Relay** | $3/mo | Keep apps online when your machine is off (cloud cache) |
| **Cloud Shift** | $5-10/mo | Managed deployment to AWS/GCP with template library |
| **Pro** | $15/mo | Relay + Cloud Shift + Priority AI (larger models) |
| **Enterprise** | Custom | Private DHT cluster, white-label, on-prem deployment |

### Revenue Streams

| Stream | Details | Projected Margin |
|---|---|---|
| Relay subscriptions | 5% of free users convert | 80% |
| Cloud Shift | 2% of free users convert | 60% |
| Premium domains (`.eth`, `.hns`) | Small markup on registration | 15% |
| Enterprise licenses | Custom DHT + white-label | 90% |
| AI model marketplace | Community templates/themes | 30% |

**Break-even: ~1,500 paying users at $8/mo average ($12k MRR)**

---

## 6. Build Roadmap (6 Months, 2-3 People)

| Phase | Duration | Output |
|---|---|---|
| **Stack Manager** | 4 wk | Runtime installer (Node, Python, PHP, Go, Ruby), database manager (MySQL, PG, Mongo, Redis), process lifecycle, port management |
| **P2P Layer** | 4 wk | Global DHT client, peer discovery, NAT traversal (STUN/UPnP), encrypted P2P proxy from dweb:// to localhost |
| **AI Agent Engine** | 6 wk | Ollama integration, project scaffolding, code generation, DB schema generation, deployment agent |
| **Architecture Templates** | 4 wk | Pre-built templates for all stacks (Node+React+PG, PHP+MySQL, Python+FastAPI+PG, Go+Redis, Ruby+Rails, WordPress) |
| **Desktop App (Tauri)** | 4 wk | System tray, service panel, dweb:// browser view, AI chat panel, settings |
| **Domain System** | 2 wk | DHT-based `.dweb` registry, name resolution, domain management UI |
| **Cloud Toggle** | 2 wk | AWS S3/EC2, Netlify, Vercel deployment templates |
| **Ship + Docs** | 2 wk | Installers (Windows/Mac/Linux), website, tutorials, demo videos |

**Total: ~28 weeks (6.5 months)**

---

## 7. Competitive Moat

| Barrier | How dweb Builds It |
|---|---|
| **Network effects** | More hosts → more content → more viewers install dweb → more hosts |
| **AI training data** | Thousands of apps built on dweb → better AI scaffolding |
| **DHT registry** | First-mover in `.dweb` namespace — users own their domains |
| **Template library** | Community-contributed stack templates → flywheel |
| **Local-first habit** | "Develop locally, publish globally" becomes default workflow |

---

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| P2P unreliable for production | High | Cloud Toggle as escape hatch |
| AI code quality varies | Medium | User reviews + template validation |
| Adoption chicken-and-egg | High | Seed with developer community (HN, GitHub) |
| Legal: P2P hosts illegal content | Medium | User responsibility model; clear ToS |
| NAT traversal fails for some users | Medium | TURN relay (paid tier) |
| Maintaining all runtimes | Medium | Use system-installed versions; provide install scripts |

---

## 9. Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | **Tauri** (Rust backend, web UI frontend) |
| AI engine | **Ollama** + **Qwen2.5-Coder 7B** (local, free) |
| P2P networking | **HyperDHT** + **Hypercore** (Holepunch) |
| NAT traversal | STUN (built-in), UPnP, TURN (optional relay) |
| Domain system | Custom DHT namespace (`.dweb`) |
| Local runtimes | Node.js, Python, PHP, Go, Ruby (auto-installed) |
| Local databases | MySQL, PostgreSQL, MongoDB, Redis, SQLite |
| Container support | Docker (if present on system) |
| Frontend | React (in-app panels + dweb:// browser) |
| Packaging | NSIS (Win), DMG (Mac), AppImage (Linux) |

---

## 10. Summary

| Aspect | Rating | Notes |
|---|---|---|
| Innovation | 9/10 | No product bundles local stack + P2P + AI agents |
| Feasibility | 7/10 | Complex but achievable with 2-3 people in 6 months |
| Market need | 8/10 | Developers want free hosting; non-devs want AI-built sites |
| Monetization | 6/10 | Relay/cloud shift are proven models; volumes unknown |
| Competition | 7/10 | First-mover in this specific combo |
| **Overall** | **7.5/10** | Viable if execution is focused on P2P + AI as the hook |

---

*Version 2.0 — June 2026*
