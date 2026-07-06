# dweb v0.2.0 — WSL Distro Release

**A full-stack P2P web development and hosting platform, packaged as a WSL distribution for Windows.**

## What's New

- **WSL Distro** — Import dweb as a native WSL2 distro with one command
- **Alpine Linux 3.20** — Minimal ~38MB rootfs with musl-linked Node.js 20
- **Pre-built Frontend** — Fully compiled React + Vite UI (no build step needed)
- **WSL Auto-Start** — dweb-server starts automatically on `wsl -d dweb`
- **Aliases** — `dweb-start`, `dweb-stop`, `dweb-restart`, `dweb-logs`, `dweb-status`
- **pm2** — Production process manager pre-installed

## How to Install

### One-liner (PowerShell):
```powershell
wsl --import dweb .\dweb-wsl\ .\dweb-wsl-rootfs.tar.gz --version 2
wsl -d dweb
```

### PowerShell Script:
```powershell
.\import-dweb-wsl.ps1
```

### Or use the GitHub Release Asset:
Download `dweb-wsl-rootfs.tar.gz` from this release and import manually.

## What's Inside

| Component | Description |
|-----------|-------------|
| **dweb-server** | P2P Dev + Hosting Platform on port 49737 |
| **AI Agent** | 100+ free AI models across 15+ providers |
| **P2P Networking** | Peer-to-peer relay, domain resolution |
| **pm2** | Process manager |
| **Node.js 20** | musl-linked for Alpine compatibility |
| **Alpine Linux 3.20** | Lightweight base |

## Access

Open http://localhost:49737 in your browser.

## Files Changed

- `packaging/wsl/build-wsl-distro.sh` — Fixed init.d/dweb creation, added tarball verification
- `packaging/wsl/Dockerfile` — Fixed npm install (devDeps), musl check via ldd, removed broken opencode
- `packaging/wsl/README.md` — Updated URLs, accurate feature list
- `packaging/wsl/import-dweb-wsl.ps1` — Fixed GitHub URL
- `packaging/wsl/install.sh` — Replaced opencode with pm2
