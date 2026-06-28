# Contributing to dweb OS

Thank you for your interest in contributing to dweb OS! This document provides guidelines and instructions for contributing.

## 🏁 Quick Start

1. **Fork** the repository: https://github.com/Awaiswilll/dweb
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/dweb.git`
3. **Install** dependencies: `cd dweb && npm install`
4. **Start** the dev server: `npm run dev`
5. **Run** tests: `npm test`
6. **Create** a branch: `git checkout -b feature/your-feature`
7. **Commit** your changes: `git commit -m "feat: add your feature"`
8. **Push** and open a **Pull Request**

## 📋 Ways to Contribute

### Code Contributions

- **Frontend** (React/TypeScript) — UI components, views, styling
- **Backend** (Node.js) — Server, API endpoints, P2P relay
- **Desktop** (Rust/Tauri) — Native desktop features, system integration
- **P2P Networking** — HyperDHT, WebRTC, relay optimization
- **AI Integration** — New providers, model catalogs, prompt engineering
- **Packaging** — WSL distro, MSIX, Docker, NSIS installers

### Non-Code Contributions

- **Documentation** — Guides, tutorials, API docs, architecture docs
- **Testing** — Unit tests, integration tests, E2E tests
- **Design** — UI/UX improvements, accessibility, themes
- **Translation** — Localize the interface for other languages
- **Community** — Help answer questions, review PRs, triage issues

## 🏷️ Issue Labels

| Label | Description |
|-------|-------------|
| `good-first-issue` | Beginner-friendly tasks |
| `help-wanted` | Tasks that need community help |
| `bug` | Something isn't working |
| `enhancement` | New feature or improvement |
| `documentation` | Documentation improvements |
| `security` | Security-related issues |
| `triage` | Needs review/assessment |
| `P2P` | Peer-to-peer networking |
| `AI` | AI build agent and providers |
| `WSL` | Windows Subsystem for Linux |
| `Windows` | Windows-specific issues |

## 📝 Pull Request Process

1. **Create a branch** with a descriptive name:
   - `feat/add-nemotron-provider`
   - `fix/dashboard-service-crash`
   - `docs/update-architecture-diagram`

2. **Follow the code style** — see `CLAUDE.md` for detailed guidelines

3. **Write tests** for new functionality (minimum 80% coverage)

4. **Run the checks** before submitting:
   ```bash
   npm run build      # TypeScript + Vite build
   npm test           # Run all tests
   ```

5. **Open a Pull Request** using the PR template

6. **Respond to review** feedback promptly

## 🔒 Security

See [SECURITY.md](SECURITY.md) for:
- How to report vulnerabilities
- Security best practices
- P2P and AI provider security guidelines

**Never commit API keys, tokens, or secrets to the repository.**

## 📜 License & Copyright

dweb OS is licensed under the **MIT License**.

### What This Means

- You can use, modify, and distribute dweb OS for any purpose
- You must include the MIT license and copyright notice
- The authors are not liable for any damages

### Trademark

The **"dweb"** name and logo are trademarks of **Cyberion (Dr Awais Javed)**.

- You may NOT use the "dweb" trademark to endorse or promote derived products without permission
- You may use "dweb" to describe your contribution (e.g., "a plugin for dweb OS")
- For trademark inquiries: awais@dweb.dev

### Contribution License Agreement

By contributing to dweb OS, you agree that:
- Your contributions are licensed under the MIT License
- You have the right to license your contributions
- Your contributions do not violate any third-party licenses

## 🤝 Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone.
Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## 📂 Project Structure

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
│   └── win32/              # Windows packaging (MSIX, NSIS)
└── .github/                # GitHub configuration
    ├── workflows/          # CI/CD pipelines
    └── ISSUE_TEMPLATE/     # Issue templates
```

## 💬 Communication

- **Issues** — Bug reports and feature requests
- **Pull Requests** — Code contributions and reviews
- **Discussions** — General questions and ideas (coming soon)

## 🙏 Recognition

All contributors are recognized in:
- The repository's contributor graph
- Release notes for significant contributions
- The project's README (for major contributors)

Thank you for helping build dweb OS! 🚀

---

<p align="center">
  <em>Be kind and creative to serve mankind.</em>
</p>
