# Contributing to dweb

Thanks for your interest in contributing to dweb!

## Project Structure

```
dweb/
├── src/                    # Frontend (React + TypeScript + Vite)
│   ├── App.tsx             # Main app with sidebar + routing
│   ├── views/              # Page components
│   │   ├── Dashboard.tsx   # Service grid, runtime detection
│   │   ├── BrowserView.tsx # dweb:// protocol browser
│   │   ├── AIAgent.tsx     # AI chat interface
│   │   ├── Domains.tsx     # .dweb domain registration
│   │   └── Settings.tsx    # App configuration
│   └── styles/
│       └── global.css      # Dark theme, layout, components
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── lib.rs          # Tauri app entry & command handlers
│   │   ├── p2p.rs          # HyperDHT P2P networking (announce/lookup)
│   │   ├── domain.rs       # .dweb domain registry (local + DHT)
│   │   ├── stack.rs        # Runtime detection & service management
│   │   ├── ai.rs           # Ollama AI agent integration
│   │   ├── cloud.rs        # Cloud deployment adapters
│   │   └── config.rs       # App configuration
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri app configuration
├── openspec/               # OpenSpec change artifacts
│   └── changes/dweb-platform/
├── .github/workflows/      # CI/CD pipelines
├── BUILD.md                # Build instructions
└── README.md               # Overview & architecture
```

## Development Workflow

### 1. Pick a task

Check [tasks.md](openspec/changes/dweb-platform/tasks.md) for the full task list.
Tasks are grouped into 11 categories:

| Group | Area |
|-------|------|
| 1.x   | Project Scaffold (done) |
| 2.1–2.9 | Stack Manager Sidecar |
| 3.1–3.10 | P2P Publishing Layer |
| 4.1–4.7 | Domain Registry |
| 5.1–5.7 | AI Agent Pipeline |
| 6.1–6.5 | Cloud Publishing |
| 7.1–7.5 | dweb:// Browser |
| 8.1–8.7 | UI/UX |
| 9.1–9.8 | Settings & Config |
| 10.1–10.7 | Testing & Quality |
| 11.1–11.4 | Docs & Community |

### 2. Set up your environment

See [BUILD.md](BUILD.md) for platform-specific setup instructions.

### 3. Make changes

- Frontend: edit files in `src/`
- Backend: edit files in `src-tauri/src/`
- Run `cargo build` (in `src-tauri/`) to compile the Rust backend
- Run `npm run dev` to start the Vite dev server
- Run `cargo tauri dev` to start the full app with hot-reload

### 4. Submit a PR

- Format your Rust code: `cargo fmt`
- Check for warnings: `cargo clippy`
- Write a clear commit message
- Open a pull request against `main`

## Code Standards

### Rust

- Follow standard Rust idioms (clippy clean)
- Use `async/await` for all I/O-bound operations
- Prefer `thiserror` for error types (or `String` for simple Tauri commands)
- Use `serde` for all serialization types
- Comment public functions with doc comments (`///`)

### TypeScript / React

- Functional components with hooks
- Use TypeScript strict mode
- Tauri commands are called via `@tauri-apps/api` invoke
- One component per file in `src/views/`

## Communication

- Open an issue for bugs or feature requests
- Discuss design changes before implementing
- Keep PRs focused on a single task or concern

## License

By contributing, you agree that your contributions will be licensed under the
same license as the project.
