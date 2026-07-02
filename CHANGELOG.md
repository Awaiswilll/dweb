# Changelog

All notable changes to dweb will be documented in this file.

## [0.1.0] - 2026-06-21

### Added
- Initial release of dweb — Decentralized Web Platform
- Local stack manager with support for Node.js, Python, PHP, Go, Ruby
- P2P publishing layer via HyperDHT for global `.dweb` domain access
- AI Build Agent with natural language to full-stack app generation (Ollama + Qwen2.5-Coder)
- Cloud Toggle for one-click deployment to AWS S3, Netlify, Vercel
- Multi-tab dweb:// browser with sandboxed content rendering
- Getting Started tutorials (Static Site, Node.js API, PHP Site)
- AI Agent session logging with persist/resume across app restarts
- Custom stack builder (pick runtime, frontend, backend, database, CSS framework)
- Social media integrations (Discord webhooks, WhatsApp API, LinkedIn, Telegram bots)
- GitHub repository management with device-code OAuth flow
- DHT-based `.dweb` domain registration with auto-renewal
- Settings panel with multi-provider AI model configuration
- Dark glass-morphism UI theme
- Cross-platform: Windows, macOS, Linux

## [0.2.0] - 2026-06-25

### Fixed
- **Tauri crash at ~17s** (p2p.rs): orphaned `JoinHandle` from `dht.drive()` now tracked in `task_handles` and aborted via `shutdown()`
- **Circular domain resolution** (domain.rs): `resolve()` now uses `p2p::dht_lookup()` (DHT-only) instead of `p2p::resolve()` which checked the DB, creating a cycle

### Changed
- **domain.rs**: Replaced in-memory `HashMap` with `sled` persistent database — domains survive restarts
- **cloud.rs**: Replaced stub return strings with real API calls — AWS S3 (full SigV4 signing), Netlify (`/api/v1/sites`), Vercel (`/v9/projects`)
- **config.rs**: Added AES-256-GCM encryption for `cloud_providers` credentials (behind `encryption` feature flag)
- **stack.rs**: `try_start_process()` now spawns real processes via `Command::spawn()` with real PIDs, background health monitoring, and dead process cleanup
- **dweb-relay.cjs**: Added RFC 6455 WebSocket push transport — signaling latency reduced from 5s to <100ms; added peer TTL eviction (60s), `/ws-info` endpoint, graceful SIGINT with close frames
- **dweb-server.cjs**: Added WebSocket relay client with exponential backoff reconnect, AI API proxy (Ollama/OpenAI/Anthropic — keys stay server-side), rate limiting (200 req/min/IP), ETag caching for static files
- **relay-client.ts**: Rewrote with `DwebRelayClient` (WebSocket + exponential backoff), `DwebPeerConnection` (WebRTC with Google STUN), `FederatedRelayClient` (multi-relay redundancy), plus HTTP fallback functions

### Security
- API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) now read server-side by `dweb-server.cjs` — never sent to the frontend
- Cloud provider credentials encrypted with AES-256-GCM in `config.json` (prefix `enc:`)

### Technical
- Tauri v2 desktop shell with Rust backend
- React 19 + TypeScript frontend with Vite 6
- HyperDHT/Hypercore P2P networking
- Safe IPC with graceful fallback when running outside Tauri
