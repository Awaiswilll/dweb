# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ Yes |
| `v0.1.x` | ✅ Yes |
| `< v0.1.0` | ❌ No |

## Reporting a Vulnerability

We take the security of dweb OS seriously. As a self-hosted platform that handles
services, domains, P2P connections, and AI API keys, security is foundational.

### What to Report

- **Remote Code Execution (RCE)** in the server, Tauri backend, or sandbox
- **Authentication bypass** in GitHub OAuth, AI proxy, or service management
- **P2P network vulnerabilities** — peer impersonation, DHT poisoning, relay abuse
- **Data exposure** — AI API keys, domain records, file browser access
- **Supply chain attacks** — compromised dependencies, malicious npm/Rust crates
- **Denial of Service** — attacks that crash the server, relay, or P2P network

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, send a detailed report to:

📧 **awais@dweb.dev**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

1. **Acknowledgment** within 48 hours
2. **Assessment** within 5 business days
3. **Fix timeline** communicated to reporter
4. **Public disclosure** after fix is released (with reporter credit, if desired)

### Security Best Practices for Contributors

- Never commit API keys, tokens, or secrets to the repository
- Use `.env.example` for environment variable documentation
- Run `npm audit` and `cargo audit` regularly
- Review all external dependencies before adding them
- Use `safe-invoke.ts` for all Tauri IPC calls — never bypass it
- Validate all user input on both frontend and backend
- Never expose AI provider API keys to the browser
- Use parameterized queries for all database operations
- Follow the principle of least privilege in sandbox execution

### P2P Security Considerations

dweb OS uses HyperDHT and WebRTC for peer-to-peer networking. When contributing
to P2P code:

- All peer connections must be encrypted (WebRTC handles this by default)
- Peer IDs must be cryptographically verifiable (ed25519)
- Relay nodes must not be able to read or modify relayed traffic
- DHT records must be signed to prevent poisoning
- Rate limiting must be enforced on all P2P endpoints

### AI Provider Security

- API keys are stored server-side only (`tools/dweb-server.cjs`)
- Keys are never sent to the browser or logged
- Use the proxy endpoints (`/ai/ollama/chat`, `/ai/openai/chat`, etc.)
- Implement rate limiting per IP for AI endpoints
- Validate all AI request payloads before forwarding

---

## Responsible Disclosure

We follow a coordinated disclosure process. After a vulnerability is fixed:

1. A security advisory is published on GitHub
2. A CVE is requested (if applicable)
3. The reporter is credited in the release notes
4. Users are notified via the changelog

Thank you for helping keep dweb OS secure.
