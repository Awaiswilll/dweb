# dweb — LibreWolf Fork with Built-in Decentralized Services

A lightweight, privacy-first browser that lets you self-host websites, email, domains, and storage — all from your own machine, with one-click migration to any cloud provider.

## One-Liner

**Fork of LibreWolf + Service Manager + Cloud Toggle = The browser that hosts itself.**

---

## Why

- No browser today lets you self-host with a button
- Privacy-conscious users want control, not just ad-blocking
- Developers need dead-simple hosting without AWS config hell
- Free `.dweb` domains via DHT — no registrar, no gas fees

## Architecture

```
┌─────────────────────────────────────────┐
│           LibreWolf (Fork)              │
│  ┌─────────────────────────────────┐    │
│  │  Service Manager (built-in)     │    │
│  │  ├─ dHost  → static hosting     │    │
│  │  ├─ dDomain→ .dweb domains      │    │
│  │  ├─ dMail  → encrypted email    │    │
│  │  ├─ dStore → file sharing       │    │
│  │  └─ dSync  → browser sync       │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Cloud Toggle (per-service)     │    │
│  │  Local ←──drag──→ AWS/GCP/Azure │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## Services

| Service | What | Local Requirements | Cloud Option |
|---|---|---|---|
| **dHost** | Deploy static sites | 50MB RAM + your disk | S3 / Netlify / Vercel |
| **dDomain** | `user.dweb` free domains | DHT resolver | Handshake / ENS gateway |
| **dMail** | Encrypted email server | 200MB RAM + 1GB+ | SES / Proton bridge |
| **dStore** | File sharing | Bandwidth + disk | S3 / B2 |
| **dSync** | Browser data sync | P2P via DHT | Firebase / Supabase |

## How It Works

1. User installs dweb browser
2. Built-in **Service Manager** runs services on user's machine (Node.js sidecars)
3. Each service has a **Cloud Toggle** — drag the slider to shift that service to AWS/GCP/Azure
4. User brings their own cloud API keys — dweb ships config templates for each provider
5. No infra managed by the project — user's machine or their cloud account pays the bills

## Business Model

- **Browser: free forever**
- **Cloud shift: free** (user pays their cloud bill directly)
- **`.dweb` domains: free** (DHT-signed, no blockchain)
- **Premium `.eth`/`.hns` domains:** small markup
- **Enterprise license:** white-label for orgs wanting managed infra

## Build Plan (20 weeks, 3-person team)

| Phase | Duration | Output |
|---|---|---|
| Fork + rebrand LibreWolf | 2 wk | Custom build, branding |
| Service Manager core | 4 wk | Service panel, local runners |
| dHost (local first) | 3 wk | Point domain → your PC |
| Cloud Toggle (AWS) | 2 wk | One-click deploy to S3 |
| dDomain + dMail | 6 wk | DHT resolver + SMTP |
| Polish & ship | 3 wk | Installer, updates |

## Status

**Phase: Planning** — Project spec and architecture being drafted.

## License

MIT
