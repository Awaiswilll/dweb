# dweb — Internet-Scale Peer-to-Peer Hosting App

A lightweight desktop app that lets you **host content on your machine** and **anyone in the world running dweb can access it** — no servers, no cloud, no domain registrar. Just P2P over the internet.

## Core Concept

```
Machine A (host, Tokyo)           Machine B (viewer, London)
┌─────────────────────┐           ┌─────────────────────┐
│    dweb app         │           │    dweb app         │
│                     │  internet │                     │
│  dweb serve ./site  │◄──────────│  Opens dweb://      │
│                     │  P2P      │  userA-site.dweb    │
│  Registers domain   │  direct   │                     │
│  via DHT (global)   │  connect  │  Resolves domain    │
│                     │           │  via DHT → peer IP  │
└─────────────────────┘           └─────────────────────┘

           │                              │
           └────── Both need dweb ───────┘
           No regular browser can reach this content.
```

**The dweb app IS the internet for hosted content.** No DNS, no cloud, no hosting bill. One app, both server and client.

---

## How It Works (End to End)

1. **User A** installs dweb, runs `dweb serve ./my-site`
2. dweb starts a P2P server on User A's machine and registers `my-site.dweb` on a global DHT
3. **User B** installs dweb, types `dweb://my-site.dweb`
4. dweb queries the global DHT → finds User A's IP → opens direct P2P connection
5. Site loads from User A's machine directly to User B — **no intermediary**

---

## Key Architecture

```
                    ┌───────────────────────┐
                    │   Global DHT Network   │
                    │  (domain → IP lookup)  │
                    └───────┬───────┬───────┘
                            │       │
                    domain lookup  announce
                            │       │
                    ┌───────┴──┐ ┌──┴────────┐
                    │ User B   │ │ User A    │
                    │ dweb app │ │ dweb app  │
                    │ Viewer   │ │ Host      │
                    │          │ │           │
                    │ dweb://  │ │ dweb serve│
                    │ site.dweb│ │ ./site    │
                    └────┬─────┘ └─────┬─────┘
                         │              │
                         └──P2P direct──┘
                         (via HyperDHT/Hypercore)
```

## Core Features

| Feature | What It Does |
|---|---|
| **dweb serve** | Host any folder as a live P2P site on the global DHT |
| **dweb browse** | Browse any `.dweb` domain from anywhere in the world |
| **dweb domain** | Register free `.dweb` domains on global DHT — no registrar, no fees |
| **dweb store** | Share files P2P with anyone running dweb |
| **Auto NAT traversal** | STUN/TURN/UPnP built in — works behind home routers |
| **Relay fallback** | Optional relay for when direct P2P can't connect (paid relay nodes) |

## Built-in Services

| Service | Description |
|---|---|
| **dHost** | Static site hosting — your machine, your traffic |
| **dDomain** | `.dweb` domain registry — DHT-based, free, permanent |
| **dStore** | File sharing — send files P2P to any dweb user |
| **dSync** | Sync browser data across your own devices via encrypted P2P |

## Business Model

| Stream | Details |
|---|---|
| **App** | Free download |
| **`.dweb` domains** | Free — DHT registration, no blockchain |
| **Premium domains (`.eth`, `.hns`)** | Small markup |
| **Relay nodes** | $3-10/mo for users behind strict NAT who can't direct-connect |
| **Storage relay** | $2-5/mo keep your content online when your machine is off |
| **Enterprise license** | Private DHT + white-label for orgs |

## Internet Challenges & Solutions

| Challenge | Solution |
|---|---|
| NAT / Firewall | STUN + UPnP for direct connect; TURN relay as paid fallback |
| Host offline = site down | Optional cloud relay (paid) keeps a cached copy online |
| DHT lookup speed | Bootstrap from hardcoded nodes; caching |
| Content takedown | Not possible — that's the point. Host controls their machine |
| Domain squatting | Proof-of-work + activity-based expiry for `.dweb` |

## Why This Could Win

| Factor | Advantage |
|---|---|
| **Zero infra cost** | User's machine is the server |
| **Global by default** | DHT works worldwide, no regional restrictions |
| **No registrar** | `.dweb` domains are free and permanent |
| **Censorship resistant** | No central server to take down |
| **Network effects** | Hosters attract viewers → viewers become hosters |
| **Same app** | One binary, both roles — no confusing server/client versions |

## Build Plan (12-14 weeks, 1-2 people)

| Phase | Duration | Output |
|---|---|---|
| Global DHT peer discovery | 3 wk | Connect to DHT, announce/query peers |
| P2P direct connection | 2 wk | NAT traversal (STUN/UPnP), encrypted channel |
| `dweb serve` (host) | 2 wk | Serve folder over P2P to any peer |
| `dweb browse` (viewer) | 2 wk | In-app browser for `dweb://` URLs |
| `.dweb` domain registry | 2 wk | DHT name registration + resolution |
| Desktop app shell | 2 wk | Tauri tray app with service panel |
| Relay fallback | 1 wk | TURN relay for blocked connections |
| Ship + docs | 1 wk | Installers, website, documentation |

## Tech Stack

| Layer | Technology |
|---|---|
| P2P networking | **HyperDHT** + **Hypercore** (Holepunch) |
| NAT traversal | **STUN** (built-in) + **TURN** (optional relay) |
| Domain resolution | **Custom DHT namespace** `.dweb` |
| Desktop shell | **Tauri** (Rust backend, web UI) |
| UI | **React** or vanilla HTML |
| Local storage | **LevelDB** |

## Status

**Phase: Planning** — Architecture and business model finalized. Ready for prototype.

## License

MIT
