# dWeb Decentralized Browser — Full Business Plan

## 1. Concept

A lightweight, privacy-first browser with an embedded decentralized stack (domains, hosting, storage, email, sync) that activates per-service on-demand. Works on the surface web by default; decentralized infra is additive with a one-click toggle to shift any service to major cloud providers (AWS, GCP, Azure, Netlify, Vercel).

**Key slogan:** *The browser that hosts itself.*

---

## 2. Market Landscape & Competitors

| Browser | Decentralized? | Built-in Hosting? | Domain System? | Lightweight? |
|---|---|---|---|---|
| **Brave** | Partial (IPFS node) | No | No | No (~500MB) |
| **TOR Browser** | Full (onion routing) | No | .onion only | Partial |
| **Beaker** (abandoned) | Full (Dat/Hypercore) | Yes | No | Yes (dead) |
| **LibreWolf** | No | No | No | Yes |
| **Opera** | No (has wallet) | No | No | No |
| **Freenet/ZeroNet** | Full | Yes | .freenet/.bit | No (separate apps) |

**Key gap identified:** No existing browser bundles domains + hosting + privacy into one lightweight download with surface-web-first UX and user-owned infrastructure.

---

## 3. Target Audience

| Segment | Need | Willing to Pay? |
|---|---|---|
| **Privacy-conscious users** | Control over data, no big tech | Donate/subscribe |
| **Indie developers** | Easy self-hosting, free domains | Yes ($3-10/mo) |
| **Small orgs/NGOs** | Low-cost hosting, no vendor lock | Yes ($10-50/mo) |
| **Web3/crypto users** | ENS domains, IPFS hosting | Yes (gas fees) |
| **Educators/students** | Free site hosting, collaboration | No (free tier) |

---

## 4. Core Architecture

```
┌──────────────────────────────────────────────┐
│              dWeb Browser Shell               │
│         Fork of LibreWolf (Firefox ESR)       │
│                                               │
│   ┌──────────┬──────────┬─────────────────┐   │
│   │ Surface  │  dWeb    │  TOR/Onion      │   │
│   │ Web      │  (IPFS/  │  (optional      │   │
│   │ (Engine) │  Hyper)  │   toggle)       │   │
│   └──────────┴──────────┴─────────────────┘   │
│                                               │
│   ┌───────────────────────────────────────┐   │
│   │  Service Manager (built-in panel)     │   │
│   │                                       │   │
│   │  ┌────────┐ ┌────────┐ ┌────────┐    │   │
│   │  │ dHost  │ │dDomain │ │ dMail  │    │   │
│   │  │ Host   │ │ .dweb  │ │ Email  │    │   │
│   │  │ Sites  │ │ Domains│ │ Server │    │   │
│   │  └───┬────┘ └───┬────┘ └───┬────┘    │   │
│   │  ┌───┴────┐ ┌───┴────┐ ┌───┴────┐    │   │
│   │  │ dStore │ │ dSync  │ │ More…  │    │   │
│   │  │ Files  │ │  Sync  │ │(future)│    │   │
│   │  └───┬────┘ └───┬────┘ └────────┘    │   │
│   │      └──────┬───┘                     │   │
│   │             ▼                          │   │
│   │  [ Cloud Toggle ] ← drag to switch    │   │
│   │  Local ──► AWS / GCP / Azure / Vercel │   │
│   └───────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Key Design Principles

1. **Surface web is default** — not a TOR-only browser, works like Chrome until you need more
2. **Zero infra by default** — services are ~1MB stubs that download the full component only when activated
3. **No blockchain required** — `.dweb` domains use DHT (no gas fees, no crypto wallet needed)
4. **User-owned infra** — services run on user's machine OR their own cloud account; project never manages servers

---

## 5. Service Breakdown

### 5.1 dHost — Decentralized Static Hosting

**How it works:**
- Right-click any folder → "Host with dHost"
- A local Node.js sidecar serves the folder (HTTP + IPFS)
- Site is accessible at `http://localhost:PORT` and `dweb://username.dweb`
- One-click "Publish" pins to IPFS and announces to DHT

**Local requirements:** ~50MB RAM, disk space of hosted content
**Cloud toggle:** Exports as S3 static site / Netlify deploy / Vercel project

### 5.2 dDomain — Free Decentralized Domains

**How it works:**
- Register `username.dweb` free — signed via DHT (no blockchain)
- Domain resolves via embedded DHT resolver in the browser
- Point to localhost for development, or any URL for production
- Optional: import `.eth` (ENS) or `.hns` (Handshake) domains

**Revenue model:**
- `.dweb` — free forever
- `.eth` / `.hns` registration — small markup over gas costs

### 5.3 dMail — Encrypted Email Server

**How it works:**
- Built-in SMTP/IMAP server runs locally
- Encryption via PGP (keys generated on first run)
- Syncs across devices via DHT (encrypted payloads)
- No central server — your machine is the mail server

**Local requirements:** ~200MB RAM, 1GB+ storage
**Cloud toggle:** Forward to SES / ProtonMail Bridge / custom SMTP relay

### 5.4 dStore — File Sharing & Storage

**How it works:**
- Drag file to dStore → generates shareable link
- Files served from your machine (P2P)
- Optional: pin to IPFS/Filecoin for permanent availability

**Cloud toggle:** Direct upload to S3 / Backblaze B2 / Wasabi

### 5.5 dSync — Browser Sync (No Big Tech)

**How it works:**
- Bookmarks, passwords, settings synced via encrypted P2P (DHT relay)
- No Google/Firefox/Apple account required
- Sync across devices using your dweb identity

**Cloud toggle:** Firebase / Supabase as relay backend

---

## 6. Cloud Toggle Architecture

Every service has a **gear icon** → "Shift to Cloud":

```
[Running Locally] ─── drag ──► [Cloud Provider Selection]
                                    ├── Amazon Web Services
                                    │    ├── S3 (dHost, dStore)
                                    │    ├── SES (dMail)
                                    │    └── EC2 (heavy services)
                                    ├── Google Cloud
                                    │    ├── Cloud Storage
                                    │    ├── Cloud Run
                                    │    └── Firebase (dSync)
                                    ├── Microsoft Azure
                                    │    ├── Blob Storage
                                    │    └── Functions
                                    ├── Netlify (dHost)
                                    └── Vercel (dHost)
```

**Implementation:**
- User pastes their API key / credentials
- Browser uploads config + content to the cloud provider
- Service continues working — now from cloud instead of local
- Local sidecar stops; no user-facing change
- Templates/scripts for each provider shipped in the browser's `provider-templates/` directory

---

## 7. Build Plan (20 Weeks, 3-Person Team)

| Phase | Duration | Tasks | Deliverable |
|---|---|---|---|
| **P1: Fork & Foundation** | 2 wk | Fork LibreWolf GitHub repo, rebrand to dweb, set up CI/CD, modify about: pages, add dweb branding | Custom dweb browser build |
| **P2: Service Manager** | 4 wk | Build service panel UI (HTML/JS overlay), sidecar runner (Node.js), service lifecycle (start/stop/restart), logging UI | Service Manager panel |
| **P3: dHost** | 3 wk | Local HTTP server, IPFS pinning integration, .dweb URL resolution, right-click → Host | dHost working locally |
| **P4: Cloud Toggle** | 2 wk | Provider template system, AWS S3 deploy script, Netlify API integration, settings UI for keys | Cloud shift working for dHost |
| **P5: dDomain + dMail** | 6 wk | DHT-based domain registry, SMTP/IMAP server, PGP encryption, email client UI | dDomain + dMail working |
| **P6: dStore + dSync** | 2 wk | File sharing UI, P2P sync protocol, cross-device identity | dStore + dSync working |
| **P7: Polish & Ship** | 1 wk | Installer (Windows/Mac/Linux), auto-updater, bug fixes, documentation | Release v1.0.0 |

**Total effort: ~480 person-days (3 people × 20 weeks)**

---

## 8. Revenue Model

| Revenue Stream | Target Customer | Price | Margin |
|---|---|---|---|
| **Browser download** | Everyone | Free | — |
| **`.dweb` domains** | All users | Free | — |
| **Premium domains (`.eth`, `.hns`)** | Web3 users | $5-20/yr | 10-20% |
| **Paid storage (Filecoin/Arweave pinning)** | Power users | $2-10/mo | 30-50% |
| **dMail premium (10GB+)** | Professionals | $3-8/mo | 60-80% |
| **Cloud template marketplace** | Developers | Free/Commission | 10% |
| **Enterprise white-label** | Organizations | $500-5000/mo | 80-90% |
| **Bandwidth marketplace (future)** | All users | P2P relay credits | 5% |

**Estimated break-even:** ~2,000 paying users at $5/mo average ($10k MRR)

---

## 9. Competitive Advantages Summary

| Against | dWeb Advantage |
|---|---|
| **Brave** | 5x lighter, no crypto bloat, real decentralized hosting |
| **TOR Browser** | Surface web works normally; TOR is optional toggle |
| **Beaker (dead)** | Alive + maintained + free domains + cloud toggle |
| **Freenet/ZeroNet** | One app, works with regular internet |
| **Chrome/Firefox** | User owns their data AND gets free infra |
| **Any browser** | "Host this page" is a built-in button |

---

## 10. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Browser engine maintenance cost | Fork LibreWolf (Firefox ESR) — minimal upstream changes needed |
| Adoption chicken-and-egg | Bootstrap with IPFS public gateways; seed with demo sites |
| Free domain abuse / spam | Proof-of-work registration + reputation system for `.dweb` |
| P2P hosting reliability | User sets uptime preference; cloud toggle for production use |
| Legal exposure from user content | Clear TOS; cloud toggle shifts liability to cloud provider's TOS |
| Funding | Bootstrap as open-source; donations + paid premium features after MVP |

---

## 11. Tech Stack

| Layer | Technology |
|---|---|
| Browser engine | **Firefox ESR** (via LibreWolf fork) |
| Sidecar runtime | **Node.js 20+** (bundled) |
| P2P networking | **Hypercore/HyperDHT** (via Holepunch) |
| IPFS | **Kubo** (lightweight daemon) |
| Domain resolution | **DHT** (custom `.dweb` resolver) |
| Email | **WildDuck** + **OpenPGP.js** |
| UI | **React** (in-browser overlay) |
| Cloud SDKs | **AWS SDK, GCP SDK, Azure SDK** (lazy-loaded) |
| Storage | **LevelDB** (local), **S3-compatible** (cloud) |
| Build system | **mozilla-central** build scripts (MOZBUILD) |

---

## 12. Folder Structure

```
dweb/
├── browser/                  # LibreWolf fork (Firefox ESR)
│   ├── browser/              # Firefox browser code
│   ├── toolkit/              # Firefox toolkit
│   └── mozconfig             # Build config
├── services/                 # Service Manager & sidecars
│   ├── service-manager/      # Core service panel UI + lifecycle
│   ├── dhost/                # Static hosting sidecar
│   ├── ddomain/              # Domain registry + DHT resolver
│   ├── dmail/                # Email server sidecar
│   ├── dstore/               # File sharing sidecar
│   └── dsync/                # Sync protocol
├── cloud-toggle/             # Cloud provider templates
│   ├── aws/                  # S3, SES, EC2 templates
│   ├── gcp/                  # Cloud Storage, Cloud Run
│   ├── azure/                # Blob Storage, Functions
│   ├── netlify/              # Netlify deploy template
│   └── vercel/               # Vercel deploy template
├── pkg/                      # Packaging & installers
│   ├── windows/              # NSIS installer
│   ├── macos/                # DMG package
│   └── linux/                # AppImage / Flatpak
└── docs/                     # Documentation
    ├── ARCHITECTURE.md
    ├── BUILD.md
    └── USER-GUIDE.md
```

---

## 13. Call to Action

**Next steps:**
1. Set up the LibreWolf fork build environment
2. Build the Service Manager MVP (panel UI + process lifecycle)
3. Ship dHost with `localhost` serving + right-click integration
4. Add Cloud Toggle for AWS S3
5. Release alpha to 100 testers

---

*Document version: 1.0 — June 2026*
