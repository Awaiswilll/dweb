# WSL ↔ Windows P2P Connectivity Test

Test **peer-to-peer connectivity** between two dweb instances — one running inside WSL, one running natively on Windows.

## Architecture

```
┌──────────────────────────┐     WebSocket Signaling      ┌──────────────────────────┐
│   WSL (dweb distro)      │◄────────────────────────────►│  Windows Native          │
│                          │     port 49736 (relay)       │                          │
│  dweb-relay.cjs  :49736  │                               │  dweb-server.cjs :49739  │
│  dweb-server.cjs :49737  │◄────── WebRTC P2P Data ─────►│  RELAY_ADDR=localhost    │
│  (one process starts     │                               │  (portable distribution)  │
│   both automatically)    │                               │                          │
└──────────────────────────┘                               └──────────────────────────┘
```

### Ports used

| Port | Service | Where |
|------|---------|-------|
| 49736 | dweb-relay (bootstrap + signaling) | WSL |
| 49737 | dweb-server (Instance A — frontend + API) | WSL |
| 49739 | dweb-server (Instance B — frontend + API) | Windows native |

---

## Prerequisites

- [ ] **WSL distro installed** — `wsl --import dweb C:\dweb-wsl dweb-wsl-rootfs.tar.gz --version 2`
- [ ] **Windows portable extracted** — `C:\dweb-portable` from `dweb-windows-portable.tar.gz`
- [ ] **Node.js 18+ on Windows** — https://nodejs.org (required for the portable server)
- [ ] Both machines on the **same local network** (both are actually the same Windows PC)

> **Note:** WSL and Windows native share the same network stack on one PC.  
> WSL can reach Windows via `localhost`. Windows can reach WSL via `localhost`.

---

## Test 1: Start the Relay + Server in WSL

```powershell
# Enter the WSL distro
wsl -d dweb

# Start everything (relay + server)
dweb start
```

Verify the server is running:

```bash
curl http://localhost:49737/ping
# Expected: {"status":"ok","server":{"name":"dweb-desktop-server",...}}
```

Check the relay status:

```bash
curl http://localhost:49736/ping
# Expected: {"status":"ok","server":{"type":"dweb-relay",...}}
```

---

## Test 2: Start a Second Server on Windows Native

Open a **new PowerShell window** (not inside WSL).

```powershell
# Navigate to portable distribution
cd C:\dweb-portable

# Start a second dweb server that connects to the WSL relay
$env:RELAY_ADDR = "localhost:49736"
$env:PORT = "49739"
node tools\dweb-server.cjs
```

You should see output like:
```
  [relay] Registered as dweb-<hostname>  (1 peers online)
  [relay] Connection state: disconnected -> connected
```

---

## Test 3: Verify Peer Discovery

### From WSL — check for the Windows peer

```powershell
# In WSL:
curl http://localhost:49737/relay/peers
```

Expected output — you should see 1 peer (the Windows instance):
```json
{
  "status": "ok",
  "count": 1,
  "peers": [
    {
      "id": "dweb-<windows-hostname>",
      "platform": "win32",
      "port": 49739,
      "mode": "p2p-visible"
    }
  ]
}
```

### From Windows — check for the WSL peer

```powershell
# In Windows PowerShell (use curl.exe, not curl):
curl.exe http://localhost:49739/relay/peers
```

Expected output — you should see 1 peer (the WSL instance):
```json
{
  "status": "ok",
  "count": 1,
  "peers": [
    {
      "id": "dweb-<wsl-hostname>",
      "platform": "linux",
      "port": 49737,
      "mode": "p2p-visible"
    }
  ]
}
```

---

## Test 4: Cross-Instance Health Check

### From Windows, ping the WSL server

```powershell
curl.exe http://localhost:49737/ping
# Expected: {"status":"ok",...}
```

### From WSL, ping the Windows server

```bash
curl http://host.docker.internal:49739/ping
# OR using the WSL gateway IP:
curl http://172.x.x.x:49739/ping
# Expected: {"status":"ok",...}
```

> **Tip:** Run `ip route show default` in WSL to find the gateway IP (Windows host).

---

## Test 5: Frontend Dashboard Verification

Open in your browser and verify both instances:

| Instance | URL | What to check |
|----------|-----|---------------|
| WSL | http://localhost:49737 | Full dweb dashboard loads |
| Windows | http://localhost:49739 | Full dweb dashboard loads |
| Relay | http://localhost:49736/status | Shows 2 peers online |

---

## Test 6: WebRTC Peer Connection (Advanced)

The frontend at http://localhost:49737 includes P2P relay features.
Open the **Network / P2P** section in the dashboard and you should see:

- Your **Peer ID** (e.g., `dweb-desktop-abc123`)
- **Relay status**: Connected
- **Peers online**: 1
- Option to initiate a WebRTC connection

If WebRTC connects successfully, the two instances are communicating
**directly** (P2P) without going through the relay.

---

## Troubleshooting

### Peer not showing up in `/relay/peers`

```bash
# Check relay status on both sides:
curl http://localhost:49736/status   # relay daemon
curl http://localhost:49737/relay/status   # WSL server
curl http://localhost:49739/relay/status   # Windows server
```

Look for:
- `relayConnected: true` on both servers
- `peersOnline: > 0` on the relay

### Relay connection failed

```bash
# In WSL, check if relay is running:
curl http://localhost:49736/ping

# Restart if needed:
dweb restart
```

### Windows can't reach WSL relay

WSL's `localhost` is automatically forwarded to Windows.
Make sure the WSL distro is running (`wsl -d dweb`) and the relay
is listening on `0.0.0.0:49736` (it does by default).

### PowerShell curl issues

PowerShell aliases `curl` to `Invoke-WebRequest`.
Use `curl.exe` for real curl, or use:
```powershell
Invoke-RestMethod -Uri http://localhost:49737/ping
```

---

## Test Checklist

- [ ] **Test 1:** WSL relay + server start successfully
- [ ] **Test 2:** Windows native server connects to WSL relay
- [ ] **Test 3:** Both peers discover each other via `/relay/peers`
- [ ] **Test 4:** Cross-instance health check (WSL -> Windows)
- [ ] **Test 5:** Both frontends load in browser
- [ ] **Test 6:** WebRTC P2P connection establishes (optional)
- [ ] **PR #11 decision:** All tests pass -> merge `feat/wsl-enhancements` -> `main`

---

## Reporting Issues

Open an issue at https://github.com/Awaiswilll/dweb/issues with:

- Test number that failed
- Output of `curl http://localhost:49736/status`
- Output of `curl http://localhost:49737/dweb-status`
- Windows version (`winver.exe`)
- WSL version (`wsl --version`)
