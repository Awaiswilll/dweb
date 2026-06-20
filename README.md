# dweb — Decentralized Web Platform

A desktop app that lets you **build, host, and serve any web architecture from your own machine — accessible to the entire world via P2P.** Built-in AI agents help you create everything.

## Core Concept

```
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
```

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

```
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
```

---

## How Publishing Works (Global Access)

```
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
```

### P2P Proxy Layer

dweb creates a secure tunnel from the P2P network to your local ports:

| Local Service | P2P Access |
|---|---|
| `localhost:80` | `dweb://my-app.dweb` (web UI) |
| `localhost:3001` | `dweb://my-app.dweb/api/*` (API) |
| `localhost:5432` | Not exposed (internal) |
| `localhost:9090` | `dweb://my-app.dweb/admin` (admin panel) |

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
| **Free** | $0 | All architectures, AI agents, `.dweb` domain, P2P hosting |
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
| Domain registration | Free `.dweb` via DHT |
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
| Domain resolution | Custom DHT (`.dweb` namespace) |
| Local runtimes | **Node.js**, **Python**, **PHP**, **Go**, **Ruby** (bundled installers) |
| Databases | **MySQL**, **PostgreSQL**, **MongoDB**, **SQLite**, **Redis** |
| Container support | **Docker** integration (optional) |

---

## Status

**Phase: Planning** — Full architecture defined. Ready for prototyping.

## License

MIT
