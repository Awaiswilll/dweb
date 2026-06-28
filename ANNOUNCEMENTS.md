# dweb OS — Announcement Posts

Ready-to-publish announcements for the open source launch.

---

## 1. Hacker News (news.ycombinator.com)

**Title:**
```
dweb OS — A decentralized dev platform with 15+ AI providers, P2P networking, and self-hosting
```

**URL:** https://github.com/Awaiswilll/dweb

**Comment (optional, from author):**
```
Hi HN! I built dweb OS — a minimalist Linux-based operating system that turns any machine
into a personal cloud. It combines:

- A dev portal dashboard (React + TypeScript)
- P2P networking via HyperDHT + WebRTC
- An AI build agent with 15+ providers and 100+ free models (Ollama, NVIDIA Nemotron, Groq,
  Gemini, DeepSeek, etc.)
- A .dweb domain system for decentralized hosting
- Git integration, cloud deployment, file browser

It runs as a WSL distro on Windows, a Tauri desktop app, or on any Linux machine. The AI
build agent works completely offline with Ollama.

I'm a cybersecurity researcher at NUST, and I built this because I was tired of being locked
into cloud vendors and expensive AI subscriptions. The whole thing is MIT licensed.

Would love feedback from the HN community. Happy to answer any questions!

Repo: https://github.com/Awaiswilll/dweb
```

---

## 2. Reddit — r/selfhosted

**Title:**
```
I built dweb OS — a self-hosted dev platform with P2P networking, AI code generation (15+ free providers), and .dweb domains. MIT licensed.
```

**Body:**
```markdown
Hey r/selfhosted!

I've been working on **dweb OS** — a decentralized operating system designed for self-hosting,
P2P networking, and AI-powered development. I'm releasing it as open source (MIT License) and
would love your feedback.

## What is it?

dweb OS turns any machine into a personal cloud. Think of it as your own Heroku + GitHub
Copilot + Cloudflare Pages — running entirely on your hardware.

## Key Features

- **Dev Portal Dashboard** — Manage services, runtimes, and deployments from your browser
- **P2P Networking** — HyperDHT + WebRTC for direct peer-to-peer connections (no central server)
- **AI Build Agent** — 15+ AI providers, 100+ free models. Works offline with Ollama
- **.dweb Domains** — Register and manage domains on the decentralized network
- **Git Integration** — Full Git workflow with GitHub OAuth
- **Cloud Deploy** — One-click deploy to AWS, Netlify, Vercel when you need them
- **WSL Distro** — Alpine Linux-based distribution for Windows
- **Windows Desktop App** — Tauri v2 (Rust + Web), MSIX package ready for Microsoft Store

## AI Providers (15+, 100+ Free Models)

- **Free/No API Key:** Ollama (local), Groq, Google Gemini, Together AI, OpenRouter,
  Hugging Face, NVIDIA NIM (Nemotron), Cerebras, DeepSeek, Hyperbolic
- **Free Tier Available:** OpenAI ($5 credit), Anthropic ($5), Mistral (€2), Fireworks ($5),
  Cohere ($5), xAI Grok (free tier)

## Quick Start

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install
npm run build
node tools/dweb-server.cjs
```

Open http://localhost:49737 in your browser.

## Why I Built This

As a cybersecurity researcher, I was frustrated with:
- Cloud vendor lock-in (AWS, Vercel, Heroku)
- Expensive AI subscriptions that send your code to third parties
- Complex self-hosting setups (Docker, nginx, SSL, DNS)
- Centralized domain ownership

dweb OS solves all of this in one installable system. No cloud vendor. No subscription.
No complexity. Just your machine, your services, your network.

## Links

- **GitHub:** https://github.com/Awaiswilll/dweb
- **Documentation:** https://github.com/Awaiswilll/dweb#readme
- **License:** MIT

I'd love to hear your thoughts, especially from people who self-host their dev environments.
What features would you want to see? Any concerns about the P2P networking approach?

Thanks for reading! 🙏
```

---

## 3. Reddit — r/webdev

**Title:**
```
I built an open-source dev platform with 15+ AI providers (all free tiers), P2P networking, and self-hosting. MIT licensed.
```

**Body:**
*(Same as r/selfhosted but with more emphasis on the AI code generation and dev workflow)*

```markdown
Hey r/webdev!

I built **dweb OS** — an open-source development platform that combines a dev portal,
P2P networking, and an AI build agent into one installable system.

## The TL;DR

- Scaffold full-stack apps from natural language: "Build a blog with React, Node.js, and PostgreSQL"
- 15+ AI providers with 100+ free models (no API key needed for most)
- P2P networking so you can share services directly with other devs
- Runs on Windows (WSL), Linux, macOS, Docker
- MIT licensed, fully open source

## AI Build Agent

The AI agent supports **any stack**: React, Vue, Svelte, Angular, FastAPI, Django, Flask,
Express, Fastify, Gin, Rails, Laravel, and more. It scaffolds the project, generates code,
installs dependencies, and starts the server — all from a chat interface.

**Free models available:**
- Ollama (local, offline): Qwen 2.5 Coder, Llama 3.3, Gemma 2, DeepSeek R1, Nemotron, etc.
- Groq (free tier): Llama 3.1 8B, Mixtral 8x7B, Gemma 2 9B
- Google Gemini (free tier): Gemini 2.0 Flash, Flash Lite, Pro
- NVIDIA NIM (free tier): Nemotron 4B/8B/70B/340B
- And 10 more providers...

## Quick Start

```bash
git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install && npm run build
node tools/dweb-server.cjs
```

Open http://localhost:49737.

## Links

- **GitHub:** https://github.com/Awaiswilll/dweb
- **Documentation:** https://github.com/Awaiswilll/dweb#readme

Would love feedback from web devs! What would make this more useful for your workflow?
```

---

## 4. Reddit — r/opensource

**Title:**
```
dweb OS — Decentralized dev platform with P2P networking, AI code generation, and self-hosting (MIT)
```

**Body:**
```markdown
Hi r/opensource!

I'm releasing **dweb OS** as an open-source project (MIT License). It's a decentralized
operating system for self-hosting, P2P networking, and AI-powered development.

## What Makes It Different

Most dev platforms are centralized — you depend on a cloud provider, a SaaS AI service,
or a CDN. dweb OS is designed to be fully decentralized:

- Every installation is a **P2P node** on the dweb network
- Services are shared directly between peers (no central server)
- AI runs locally (Ollama) or through free-tier providers
- Domains are managed on the decentralized network

## Tech Stack

- **Frontend:** React 19, TypeScript 5.5, Vite 6
- **Backend:** Node.js (zero-dependency HTTP server)
- **Desktop:** Tauri v2 (Rust)
- **P2P:** HyperDHT, WebRTC, WebSocket relay
- **AI:** 15+ providers, 100+ free models
- **Base OS:** Alpine Linux (WSL distro)

## Contributing

We're looking for contributors in:
- WSL distro packaging
- Windows MSIX packaging
- AI provider integrations
- P2P networking improvements
- UI/UX and accessibility
- Testing (Vitest + Playwright)

Check out [CONTRIBUTING.md](https://github.com/Awaiswilll/dweb/blob/main/CONTRIBUTING.md)
and look for `good-first-issue` labels.

## Links

- **GitHub:** https://github.com/Awaiswilll/dweb
- **Roadmap:** https://github.com/Awaiswilll/dweb/blob/main/ROADMAP.md
- **License:** MIT

Looking forward to building this with the open source community! 🚀
```

---

## 5. dev.to

**Title:**
```
I Built dweb OS — A Decentralized Dev Platform with 15+ Free AI Providers and P2P Networking
```

**Tags:** `#opensource` `#webdev` `#ai` `#selfhosted` `#p2p` `#react` `#rust` `#typescript`

**Body:**
*(Use the full README content as the blog post, with a personal intro)*

```markdown
# I Built dweb OS — A Decentralized Dev Platform with 15+ Free AI Providers and P2P Networking

Hey dev.to community! 👋

I'm a cybersecurity researcher at NUST, and over the past few months, I've been building
something I think you'll find interesting: **dweb OS**.

It's a decentralized operating system that turns any machine into a personal cloud. Think
of it as your own Heroku + GitHub Copilot + Cloudflare Pages — running entirely on your
hardware.

[Insert the full README content here, starting from "The Problem dweb OS Solves"]

---

## Why I Built This

[Personal story about cloud lock-in, AI costs, self-hosting complexity]

## What's Next

- Microsoft Store submission (name already reserved!)
- Docker Hub image
- More AI providers
- P2P mesh networking
- Multi-user support

## Want to Contribute?

Check out our [CONTRIBUTING.md](https://github.com/Awaiswilll/dweb/blob/main/CONTRIBUTING.md)
and look for `good-first-issue` labels on [GitHub Issues](https://github.com/Awaiswilll/dweb/issues).

---

Thanks for reading! I'd love to hear your thoughts in the comments. 🙏

**GitHub:** https://github.com/Awaiswilll/dweb
```

---

## 6. X / Twitter Thread

**Tweet 1:**
```
🚀 Introducing dweb OS — a decentralized operating system for self-hosting, P2P networking,
and AI-powered development.

One install. Every stack. Your own internet.

MIT licensed. Open source.

🔗 https://github.com/Awaiswilll/dweb

#opensource #AI #selfhosted
```

**Tweet 2:**
```
What is dweb OS?

It turns any machine into a personal cloud:

🖥️ Dev Portal Dashboard
🌐 P2P Networking (HyperDHT + WebRTC)
🤖 AI Build Agent (15+ providers, 100+ free models)
🏷️ .dweb Domains
📁 File Browser
🔀 Git Integration
☁️ Cloud Deploy (AWS, Netlify, Vercel)
```

**Tweet 3:**
```
The AI Build Agent is the killer feature:

• Scaffold full-stack apps from natural language
• "Build a blog with React, Node.js, PostgreSQL"
• Works OFFLINE with Ollama (local GPU)
• Free tiers from NVIDIA Nemotron, Groq, Gemini, DeepSeek
• 15+ providers, 100+ models
```

**Tweet 4:**
```
Quick start:

git clone https://github.com/Awaiswilll/dweb.git
cd dweb
npm install && npm run build
node tools/dweb-server.cjs

Open http://localhost:49737

That's it. Your personal cloud is running.

No cloud vendor. No subscription. No complexity.
```

**Tweet 5:**
```
We're looking for contributors!

🐧 WSL Distro packaging
🪟 Windows MSIX packaging
🤖 AI provider integrations
🌐 P2P networking improvements
🎨 UI/UX and accessibility
🧪 Testing (Vitest + Playwright)

Check out good-first-issue labels:
https://github.com/Awaiswilll/dweb/issues
```

---

## Publishing Checklist

- [ ] Post to Hacker News (https://news.ycombinator.com/submit)
- [ ] Post to r/selfhosted (https://reddit.com/r/selfhosted/submit)
- [ ] Post to r/webdev (https://reddit.com/r/webdev/submit)
- [ ] Post to r/opensource (https://reddit.com/r/opensource/submit)
- [ ] Publish on dev.to (https://dev.to/new)
- [ ] Post X/Twitter thread
- [ ] Post to LinkedIn
- [ ] Share in Discord communities (self-hosted, AI, webdev)
- [ ] Share on Hacker News Show HN (if applicable)
