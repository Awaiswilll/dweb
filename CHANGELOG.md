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

### Technical
- Tauri v2 desktop shell with Rust backend
- React 19 + TypeScript frontend with Vite 6
- HyperDHT/Hypercore P2P networking
- Safe IPC with graceful fallback when running outside Tauri
