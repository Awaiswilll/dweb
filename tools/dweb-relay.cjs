#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════
//  dweb P2P Bootstrap Relay Daemon v0.1.0
//  Zero-dependency Node.js relay server for the dweb P2P network
//
//  Serves as:
//    1. Bootstrap node — well-known entry point for new peers
//    2. Registration — peers register their address & services
//    3. Discovery — peers discover other online peers
//    4. Signaling relay — exchange SDP offers/answers for WebRTC
//    5. Relay proxy — forward messages for NAT-trapped peers
//
//  Design: pure Node.js stdlib — no npm install needed
// ═══════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Config ───────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT, 10) || 49736;
const RELAY_TCP_PORT = parseInt(process.env.RELAY_TCP_PORT, 10) || 49738;
const PEER_TTL_MS   = parseInt(process.env.PEER_TTL, 10) || 60000;  // 60s heartbeat
const CLEANUP_MS    = 15000;  // purge stale peers every 15s
const MAX_PEERS     = 10000;
const START_TIME    = Date.now();
const SERVER_ID     = crypto.randomUUID().split("-")[0];
const HOSTNAME      = os.hostname();

// ─── In-memory peer store ─────────────────────────────────────
const peers = new Map();      // peerId → PeerRecord
const signals = new Map();    // peerId → pending signal (for polling)

class PeerRecord {
  constructor(id, info) {
    this.id = id;
    this.publicKey = info.publicKey || `dweb-${id.slice(0, 8)}`;
    this.address = info.address || "0.0.0.0";
    this.port = info.port || 0;
    this.relayPort = info.relayPort || 0;
    this.hostname = info.hostname || HOSTNAME;
    this.platform = info.platform || process.platform;
    this.version = info.version || "0.1.0";
    this.mode = info.mode || "p2p-visible";  // p2p-visible | p2p-anonymous | relay
    this.services = info.services || [];
    this.natType = info.natType || "unknown";
    this.firstSeen = Date.now();
    this.lastSeen = Date.now();
    this.signalCount = 0;
  }
  get isStale() { return (Date.now() - this.lastSeen) > PEER_TTL_MS; }
  touch() { this.lastSeen = Date.now(); }
}

// ─── Helpers ───────────────────────────────────────────────────
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  return ips.length ? ips : ["127.0.0.1"];
}

function peerToJSON(p) {
  return {
    id: p.id,
    publicKey: p.publicKey,
    address: p.address,
    port: p.port,
    hostname: p.hostname,
    platform: p.platform,
    version: p.version,
    mode: p.mode,
    services: p.services,
    natType: p.natType,
    firstSeen: new Date(p.firstSeen).toISOString(),
    lastSeen: new Date(p.lastSeen).toISOString(),
    age: Math.floor((Date.now() - p.firstSeen) / 1000),
  };
}

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

// ─── Signal Store (for polling relay) ─────────────────────────
function storeSignal(targetPeerId, signal) {
  if (!signals.has(targetPeerId)) signals.set(targetPeerId, []);
  const list = signals.get(targetPeerId);
  list.push({ ...signal, ts: Date.now() });
  // Keep only last 50 signals per peer
  if (list.length > 50) list.splice(0, list.length - 50);
}

function popSignals(targetPeerId) {
  const list = signals.get(targetPeerId) || [];
  signals.delete(targetPeerId);
  return list;
}

// ─── Cleanup stale peers ──────────────────────────────────────
function cleanup() {
  const now = Date.now();
  let removed = 0;
  for (const [id, peer] of peers) {
    if (peer.isStale) {
      peers.delete(id);
      signals.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`  [cleanup] Removed ${removed} stale peer(s). Active: ${peers.size}`);
  }
}

// ─── Request Router ────────────────────────────────────────────
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ─── PING ─────────────────────────────────────────────────
  if (pathname === "/ping" && method === "GET") {
    return json(res, 200, {
      status: "ok",
      server: {
        id: SERVER_ID,
        hostname: HOSTNAME,
        platform: process.platform,
        version: "0.1.0",
        type: "dweb-relay",
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        peers: peers.size,
        maxPeers: MAX_PEERS,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ─── REGISTER ─────────────────────────────────────────────
  if (pathname === "/register" && method === "POST") {
    try {
      const body = await parseBody(req);
      const id = body.id || crypto.randomUUID();
      const existing = peers.get(id);

      if (existing) {
        existing.touch();
        existing.address = body.address || existing.address;
        existing.port = body.port || existing.port;
        existing.services = body.services || existing.services;
        existing.mode = body.mode || existing.mode;
        existing.natType = body.natType || existing.natType;
        existing.publicKey = body.publicKey || existing.publicKey;
        existing.hostname = body.hostname || existing.hostname;
        existing.platform = body.platform || existing.platform;
        existing.version = body.version || existing.version;
        if (body.relayPort) existing.relayPort = body.relayPort;

        return json(res, 200, {
          status: "ok",
          action: "updated",
          peerId: id,
          peersOnline: peers.size,
          relayAddress: getLocalIPs()[0] + ":" + RELAY_TCP_PORT,
        });
      }

      if (peers.size >= MAX_PEERS) {
        return json(res, 503, { status: "error", message: "Server full" });
      }

      const peer = new PeerRecord(id, body);
      peers.set(id, peer);

      console.log(`  [register] ${id.slice(0, 12)}… mode=${peer.mode} addr=${peer.address}:${peer.port}`);

      return json(res, 201, {
        status: "ok",
        action: "registered",
        peerId: id,
        peersOnline: peers.size,
        relayAddress: getLocalIPs()[0] + ":" + RELAY_TCP_PORT,
      });
    } catch (e) {
      return json(res, 400, { status: "error", message: e.message });
    }
  }

  // ─── HEARTBEAT ────────────────────────────────────────────
  if (pathname === "/heartbeat" && method === "POST") {
    try {
      const body = await parseBody(req);
      const peer = peers.get(body.peerId);
      if (!peer) return json(res, 404, { status: "error", message: "Unknown peer" });
      peer.touch();
      return json(res, 200, { status: "ok", peersOnline: peers.size });
    } catch (e) {
      return json(res, 400, { status: "error", message: e.message });
    }
  }

  // ─── DISCOVER ─────────────────────────────────────────────
  if (pathname === "/discover" && method === "GET") {
    const modeFilter = url.searchParams.get("mode");       // optional filter
    const minPort = parseInt(url.searchParams.get("port"), 10) || 0;

    const list = [];
    for (const peer of peers.values()) {
      if (modeFilter && peer.mode !== modeFilter) continue;
      if (minPort && peer.port !== minPort) continue;
      list.push(peerToJSON(peer));
    }

    return json(res, 200, {
      status: "ok",
      count: list.length,
      peers: list,
    });
  }

  // ─── PEER INFO ────────────────────────────────────────────
  // GET /peer/:id
  const peerMatch = pathname.match(/^\/peer\/([a-zA-Z0-9-_]+)$/);
  if (peerMatch && method === "GET") {
    const peer = peers.get(peerMatch[1]);
    if (!peer) return json(res, 404, { status: "error", message: "Peer not found" });
    return json(res, 200, { status: "ok", peer: peerToJSON(peer) });
  }

  // ─── UNREGISTER ───────────────────────────────────────────
  // DELETE /peer/:id
  if (peerMatch && method === "DELETE") {
    const removed = peers.delete(peerMatch[1]);
    signals.delete(peerMatch[1]);
    return json(res, removed ? 200 : 404, {
      status: removed ? "ok" : "error",
      message: removed ? "Peer removed" : "Peer not found",
    });
  }

  // ─── SIGNAL (WebRTC signaling exchange) ───────────────────
  // POST /signal — send signal to a peer
  // GET /signal?peerId=xxx — poll for incoming signals
  if (pathname === "/signal") {
    if (method === "POST") {
      try {
        const body = await parseBody(req);
        const { targetPeerId, type, sdp, candidate, fromPeerId } = body;

        if (!targetPeerId) return json(res, 400, { status: "error", message: "Missing targetPeerId" });

        // Check target exists or allow anonymous signaling
        const targetExists = peers.has(targetPeerId);
        if (!targetExists) {
          // Still store — the target might connect soon
          console.log(`  [signal] ${(fromPeerId || "?").slice(0, 12)}… → ${targetPeerId.slice(0, 12)}… (target offline, queued)`);
        } else {
          console.log(`  [signal] ${(fromPeerId || "?").slice(0, 12)}… → ${targetPeerId.slice(0, 12)}… type=${type}`);
        }

        storeSignal(targetPeerId, {
          fromPeerId: fromPeerId || "anonymous",
          type: type || "unknown",
          sdp: sdp || null,
          candidate: candidate || null,
          timestamp: new Date().toISOString(),
        });

        return json(res, 200, { status: "ok", queued: true });
      } catch (e) {
        return json(res, 400, { status: "error", message: e.message });
      }
    }

    if (method === "GET") {
      const peerId = url.searchParams.get("peerId");
      if (!peerId) return json(res, 400, { status: "error", message: "Missing peerId" });

      // Long-poll: wait up to 30s for signals
      const signals_list = popSignals(peerId);
      return json(res, 200, {
        status: "ok",
        count: signals_list.length,
        signals: signals_list,
      });
    }
  }

  // ─── STATUS ───────────────────────────────────────────────
  if (pathname === "/status" && method === "GET") {
    const modeCounts = {};
    for (const peer of peers.values()) {
      modeCounts[peer.mode] = (modeCounts[peer.mode] || 0) + 1;
    }

    return json(res, 200, {
      status: "ok",
      serverId: SERVER_ID,
      hostname: HOSTNAME,
      version: "0.1.0",
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      peersOnline: peers.size,
      peersMax: MAX_PEERS,
      tcpRelayPort: RELAY_TCP_PORT,
      modes: modeCounts,
      localIPs: getLocalIPs(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      },
      services: [
        { path: "/ping", method: "GET", desc: "Health check" },
        { path: "/status", method: "GET", desc: "Relay server status" },
        { path: "/register", method: "POST", desc: "Register a peer" },
        { path: "/heartbeat", method: "POST", desc: "Peer heartbeat" },
        { path: "/discover", method: "GET", desc: "Discover online peers" },
        { path: "/peer/:id", method: "GET", desc: "Get peer info" },
        { path: "/peer/:id", method: "DELETE", desc: "Unregister peer" },
        { path: "/signal", method: "GET", desc: "Poll for signals" },
        { path: "/signal", method: "POST", desc: "Send signal to peer" },
      ],
      bootstrapNodes: getLocalIPs().map(ip => `${ip}:${PORT}`),
    });
  }

  // ─── 404 ──────────────────────────────────────────────────
  return json(res, 404, { status: "error", message: "Not found. See /status for available endpoints." });
}

// ─── TCP Relay Server ─────────────────────────────────────────
function startTCPRelay() {
  const net = require("net");

  // Map of peerId → { socket, buffer }
  const relayPeers = new Map();

  const tcpServer = net.createServer((socket) => {
    const remoteAddr = socket.remoteAddress;
    let peerId = null;
    let buffer = "";

    console.log(`  [tcp] Connection from ${remoteAddr}`);

    socket.on("data", (data) => {
      buffer += data.toString();

      // First message must be a JSON registration line ending with \n
      if (!peerId) {
        const nl = buffer.indexOf("\n");
        if (nl === -1) return;  // wait for complete line

        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);

        try {
          const msg = JSON.parse(line);
          if (msg.type === "register" && msg.peerId) {
            peerId = msg.peerId;
            relayPeers.set(peerId, { socket, buffer: "" });
            socket.write(JSON.stringify({
              type: "registered",
              peerId: peerId,
              relayPort: RELAY_TCP_PORT,
            }) + "\n");
            console.log(`  [tcp] Registered: ${peerId.slice(0, 12)}…`);
            // Forward any buffered data as a message
            if (buffer.length > 0) {
              forwardMessage(peerId, buffer);
              buffer = "";
            }
          } else {
            socket.write(JSON.stringify({ type: "error", message: "Invalid registration" }) + "\n");
            socket.end();
          }
        } catch (e) {
          socket.write(JSON.stringify({ type: "error", message: "Invalid JSON" }) + "\n");
          socket.end();
        }
        return;
      }

      // Forward data as relay message
      try {
        const msg = JSON.parse(buffer);
        if (msg.type === "relay" && msg.targetPeerId) {
          const target = relayPeers.get(msg.targetPeerId);
          if (target) {
            target.socket.write(JSON.stringify({
              type: "relay",
              fromPeerId: peerId,
              data: msg.data,
            }) + "\n");
          }
          // If target not connected via TCP, store in signal queue
          storeSignal(msg.targetPeerId, {
            fromPeerId: peerId,
            type: "relay-data",
            data: msg.data,
          });
        } else if (msg.type === "ping") {
          socket.write(JSON.stringify({ type: "pong" }) + "\n");
        }
      } catch (e) { /* ignore malformed */ }
      buffer = "";
    });

    socket.on("close", () => {
      if (peerId) {
        relayPeers.delete(peerId);
        console.log(`  [tcp] Disconnected: ${peerId.slice(0, 12)}…`);
      }
    });

    socket.on("error", () => {});
  });

  tcpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`  [tcp] Port ${RELAY_TCP_PORT} in use — TCP relay disabled`);
    } else {
      console.log(`  [tcp] Error: ${err.message}`);
    }
  });
  tcpServer.listen(RELAY_TCP_PORT, "0.0.0.0", () => {
    console.log(`  TCP Relay listening on port ${RELAY_TCP_PORT}`);
  });
}

// ─── Print Banner ─────────────────────────────────────────────
function printBanner() {
  const ips = getLocalIPs();

  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║      dweb P2P Bootstrap Relay Daemon v0.1.0     ║
  ║      ────────────────────────────────            ║
  ║  Server ID : ${SERVER_ID.padEnd(37)}║
  ║  Hostname  : ${HOSTNAME.padEnd(37)}║
  ║  Platform  : ${process.platform.padEnd(37)}║
  ╚══════════════════════════════════════════════════╝
  ╔══════════════════════════════════════════════════╗
  ║  HTTP API:  http://0.0.0.0:${String(PORT).padEnd(5)}                    ║
  ║  dweb peers connect via: RELAY_ADDR=localhost:${String(PORT).padEnd(5)}║
  ║  TCP Relay: tcp://0.0.0.0:${String(RELAY_TCP_PORT).padEnd(5)}                    ║
  ║                                                    ║
  ║  Other machines can use these bootstrap nodes:     ║`);
  for (const ip of ips) {
    console.log(`  ║    ${(ip + ":" + PORT).padEnd(48)}║`);
  }
  console.log(`  ║                                                    ║`);
  console.log(`  ║  Endpoints (${PORT}):                                    ║`);
  console.log(`  ║    GET  /ping       — Health check                   ║`);
  console.log(`  ║    GET  /status     — Relay status                  ║`);
  console.log(`  ║    POST /register   — Register a peer               ║`);
  console.log(`  ║    POST /heartbeat  — Peer heartbeat                ║`);
  console.log(`  ║    GET  /discover   — List online peers             ║`);
  console.log(`  ║    GET  /peer/:id   — Get peer info                 ║`);
  console.log(`  ║    DELETE /peer/:id — Unregister peer               ║`);
  console.log(`  ║    GET  /signal     — Poll for signals              ║`);
  console.log(`  ║    POST /signal     — Send signal to peer           ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝`);
  console.log(`  Active peers: 0`);
  console.log(`  Press Ctrl+C to stop.\n`);
}

// ─── Main ──────────────────────────────────────────────────────
const server = http.createServer(handleRequest);

server.listen(PORT, "0.0.0.0", () => {
  printBanner();

  // Start TCP relay
  startTCPRelay();

  // Periodic cleanup
  setInterval(cleanup, CLEANUP_MS);

  // Show active count on interval
  setInterval(() => {
    process.stdout.write(`\x1b[1A\x1b[K  Active peers: ${peers.size}\n`);
  }, 2000);
});

process.on("SIGINT", () => {
  console.log("\n  Shutting down relay daemon...");
  console.log(`  Final peer count: ${peers.size}`);
  console.log("  Goodbye!\n");
  process.exit(0);
});
