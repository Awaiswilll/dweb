# dweb — Self-Hosted Dev Portal

A self-hosted dev portal / mini Linux OS that runs on WSL or bare metal. Manages services (static sites, file browser, etc.), registers .dweb domains with tiered pricing, bundles opencode CLI and Ollama for local AI. Frontend: React+Vite+TypeScript. Backend: Node.js + optional Tauri (Rust) desktop shell.

## Build Commands

### Development
- `npm run dev` — Start Vite dev server with HMR on port 5173

### Production Build
- `npm run build` — TypeScript check + Vite production build to `dist/`

### Testing
- `npm test` — Run all tests (currently `tsc --noEmit`)
- Add `vitest` for proper unit/integration tests

### Linting and Formatting
- `npm run lint` — TypeScript type check (`tsc --noEmit`)
- `npm run typecheck` — TypeScript type check
- Add `prettier` / `eslint` for formatting

### Tauri Desktop
- `npx tauri dev` — Run Tauri desktop app in development
- `npx tauri build` — Build Tauri desktop installer

## Code Style

### TypeScript
- Use strict mode (`strict: true` in tsconfig)
- Prefer interfaces over type aliases for object shapes
- Use `type` for unions, intersections, and utility types
- Avoid `any` — use `unknown` and narrow with type guards

### Naming Conventions
- **PascalCase**: Components, interfaces, types, classes, enums
- **camelCase**: Functions, methods, variables, parameters
- **kebab-case**: File names, directory names

### File Organization
- One component per file in `src/components/`
- Views in `src/views/` — one view per file
- Co-locate tests with source: `Component.tsx` + `Component.test.tsx`
- Max 300 lines per file (split if exceeded)
- Rust backend modules in `src-tauri/src/`

### React
- Functional components with hooks
- Use `safe-invoke.ts` wrapper for all Tauri IPC calls
- `localStorage` fallback when running outside Tauri

## Test Requirements

### Framework
- Vitest (when added) for unit/integration tests

### Coverage
- Minimum 80% line coverage for new code
- Mock external services (Ollama, OpenAI, GitHub API)
- Test critical user flows: service management, domain registration, AI chat

## Files the Agent Must Never Modify

### Configuration
- `.github/workflows/*.yml` — CI/CD pipelines
- `src-tauri/tauri.conf.json` — Tauri configuration
- `.env*` — Environment files (may contain secrets)
- `vite.config.ts` — Build configuration

### Build and Dependencies
- `package-lock.json` — Lock file
- `tsconfig.json` / `tsconfig.node.json` — TypeScript configuration (unless explicitly requested)
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` — Rust dependencies

### Generated Files
- `dist/` — Build output
- `node_modules/` — Dependencies
- `src-tauri/target/` — Rust build artifacts

### Security
- `tools/dweb-server.cjs` — Server-side proxy (holds API keys)

## Environment

### Required Tools
- Node.js >= 18.0.0
- npm

### Optional Tools
- Rust toolchain (for Tauri desktop builds)
- Ollama (for local AI agents)

### Environment Variables
- `PORT` — HTTP server port (default: 49737)
- `RELAY_ADDR` — Relay daemon address (default: localhost:49736)
- `P2P_MODE` — Peer visibility (local/p2p-visible/p2p-anonymous)
- `RELAY_TCP_PORT` — TCP relay port (default: 49738)
- `OPENAI_API_KEY` — OpenAI API key (server-side only)
- `ANTHROPIC_API_KEY` — Anthropic API key (server-side only)

## Project Team — dweb Subagents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | P2P networking, domain system, architecture decisions |
| code-reviewer | Code review | After writing/modifying code |
| security-reviewer | Vulnerability detection | Before commits, sensitive auth/AI proxy code |
| tdd-guide | Test-driven development | New features, bug fixes |
| build-error-resolver | Build/TS error fixing | When `npm run build` or `tsc` fails |
| e2e-runner | Playwright testing | Critical user flows (dashboard, domains, AI agent) |
| doc-updater | Documentation | README, API docs, architecture docs |
| database-reviewer | Database schema | Sled DB storage, data modeling |
| refactor-cleaner | Dead code cleanup | Code maintenance, removing deprecated views |

## Development Workflow

1. **Plan** — Use `planner` agent for complex multi-view features
2. **Implement** — Follow existing patterns in `src/views/` and `src-tauri/src/`
3. **Review** — Use `code-reviewer` after writing code
4. **Security** — Use `security-reviewer` before commits touching auth/AI proxy
5. **Build** — Verify `npm run build` succeeds with zero type errors
6. **Commit** — Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
