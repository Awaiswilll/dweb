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
//    6. WebSocket transport — push-based signaling for ICE candidates
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

// RFC 6455 WebSocket GUID for handshake key derivation
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// ─── In-memory peer store ─────────────────────────────────────
const peers = new Map();      // peerId → PeerRecord
const signals = new Map();    // peerId → pending signal (for http polling)

// WebSocket peer tracking
const wsPeers = new Map();         // peerId → WebSocket socket
const wsSocketStates = new Map();  // socket → { peerId, buffer }

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

// ─── WebSocket Frame Helpers (RFC 6455) ────────────────────────

// Create a WebSocket frame (server → client, never masked)
function createWSFrame(payload, opcode = 0x1) {
  const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const len = payloadBuf.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payloadBuf]);
}

// Parse and handle all frames currently buffered for a socket
function processWSFrames(socket, state) {
  while (state.buffer.length >= 2) {
    const firstByte = state.buffer[0];
    const secondByte = state.buffer[1];
    const opcode = firstByte & 0x0F;
    const fin = (firstByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7F;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (state.buffer.length < 4) return;
      payloadLen = state.buffer.readUInt16BE(2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (state.buffer.length < 10) return;
      payloadLen = Number(state.buffer.readBigUInt64BE(2));
      headerLen = 10;
    }

    const masked = (secondByte & 0x80) !== 0;
    if (masked) headerLen += 4;

    const frameLen = headerLen + payloadLen;
    if (state.buffer.length < frameLen) return;

    const frameData = state.buffer.slice(0, frameLen);
    state.buffer = state.buffer.slice(frameLen);

    // Extract payload and unmask if needed (client frames must be masked)
    // NOTE: headerLen already includes the 4 mask-key bytes when masked is true,
    // so the payload starts at headerLen, not headerLen - 4. The previous
    // "- 4" here caused the decoder to read starting at the mask-key bytes
    // instead of after them, corrupting every masked (client-sent) frame.
    const payloadStart = headerLen;
    const mask = masked ? frameData.slice(headerLen - 4, headerLen) : null;
    const payload = Buffer.from(frameData.slice(payloadStart, payloadStart + payloadLen));

    if (masked) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    if (opcode === 0x8) {
      // Close frame — respond with close and tear down
      const closePayload = Buffer.alloc(2);
      closePayload.writeUInt16BE(1000, 0);
      try { socket.write(createWSFrame(closePayload, 0x8)); } catch (e) { /* ignore */ }
      socket.end();
      return;
    }

    if (opcode === 0x9) {
      // Ping — respond with empty pong
      try { socket.write(createWSFrame(Buffer.alloc(0), 0xA)); } catch (e) { /* ignore */ }
      continue;
    }

    if (opcode === 0x1 && fin) {
      // Complete text frame — parse as JSON and route
      const message = payload.toString("utf8");
      handleWSMessage(socket, state, message);
    }
    // Continuation frames (0x0) and binary (0x2) are silently ignored
  }
}

// Handle a decoded JSON message received over WebSocket
function handleWSMessage(socket, state, message) {
  let msg;
  try { msg = JSON.parse(message); }
  catch (e) { return; }

  // ─── WS Register ───────────────────────────────────────────
  if (msg.type === "register" && msg.peerId) {
    state.peerId = msg.peerId;
    wsPeers.set(msg.peerId, socket);

    // Also register in the main peer store for discoverability
    if (!peers.has(msg.peerId)) {
      peers.set(msg.peerId, new PeerRecord(msg.peerId, {
        address: msg.address || "0.0.0.0",
        port: msg.port || 0,
        mode: msg.mode || "p2p-visible",
        services: msg.services || [],
        platform: msg.platform || process.platform,
        version: msg.version || "0.1.0",
      }));
      console.log(`  [ws] Registered: ${msg.peerId.slice(0, 12)}…`);
    } else {
      peers.get(msg.peerId).touch();
      console.log(`  [ws] Re-registered: ${msg.peerId.slice(0, 12)}…`);
    }

    // Deliver any queued signals that arrived via HTTP while this peer had no WS
    const queued = popSignals(msg.peerId);
    if (queued.length > 0) {
      for (const sig of queued) {
        try {
          socket.write(createWSFrame(JSON.stringify({ type: "signal", ...sig })));
        } catch (e) { /* ignore */ }
      }
      console.log(`  [ws] Delivered ${queued.length} queued signal(s) to ${msg.peerId.slice(0, 12)}…`);
    }
    return;
  }

  // ─── WS Signal Forwarding ──────────────────────────────────
  // The client sends the signal type (offer/answer/ice-candidate) in `signalType`
  // to avoid conflicting with the outer message type routing envelope.
  if (msg.type === "signal" && msg.targetPeerId) {
    const signal = {
      fromPeerId: state.peerId || msg.fromPeerId || "anonymous",
      signalType: msg.signalType || "unknown",
      sdp: msg.sdp || null,
      candidate: msg.candidate || null,
      timestamp: new Date().toISOString(),
    };

    // Try immediate push if target is connected via WebSocket
    const targetSocket = wsPeers.get(msg.targetPeerId);
    if (targetSocket) {
      const frame = createWSFrame(JSON.stringify({ type: "signal", ...signal }));
      try { targetSocket.write(frame); } catch (e) { /* ignore */ }
      console.log(`  [ws-signal] ${(signal.fromPeerId || "?").slice(0, 12)}… → ${msg.targetPeerId.slice(0, 12)}… signalType=${signal.signalType} via WS`);
      return;
    }

    // Fall back to HTTP polling store
    storeSignal(msg.targetPeerId, signal);
    console.log(`  [ws-signal] ${(signal.fromPeerId || "?").slice(0, 12)}… → ${msg.targetPeerId.slice(0, 12)}… signalType=${signal.signalType} queued for HTTP`);
    return;
  }

  // ─── WS Heartbeat ──────────────────────────────────────────
  if (msg.type === "heartbeat" && state.peerId) {
    const peer = peers.get(state.peerId);
    if (peer) peer.touch();
    return;
  }
}

// ─── Cleanup stale peers ──────────────────────────────────────
function cleanup() {
  let removed = 0;
  for (const [id, peer] of peers) {
    if (peer.isStale) {
      peers.delete(id);
      signals.delete(id);
      wsPeers.delete(id);
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
    const modeFilter = url.searchParams.get("mode");
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
  const peerMatch = pathname.match(/^\/peer\/([a-zA-Z0-9-_]+)$/);
  if (peerMatch && method === "GET") {
    const peer = peers.get(peerMatch[1]);
    if (!peer) return json(res, 404, { status: "error", message: "Peer not found" });
    return json(res, 200, { status: "ok", peer: peerToJSON(peer) });
  }

  // ─── UNREGISTER ───────────────────────────────────────────
  if (peerMatch && method === "DELETE") {
    const removed = peers.delete(peerMatch[1]);
    signals.delete(peerMatch[1]);
    return json(res, removed ? 200 : 404, {
      status: removed ? "ok" : "error",
      message: removed ? "Peer removed" : "Peer not found",
    });
  }

  // ─── SIGNAL (WebRTC signaling exchange) ───────────────────
  if (pathname === "/signal") {
    if (method === "POST") {
      try {
        const body = await parseBody(req);
        const { targetPeerId, type, sdp, candidate, fromPeerId } = body;

        if (!targetPeerId) return json(res, 400, { status: "error", message: "Missing targetPeerId" });

        // Check if target is connected via WebSocket — push immediately
        const targetSocket = wsPeers.get(targetPeerId);
        if (targetSocket) {
          const signal = {
            type: "signal",
            fromPeerId: fromPeerId || "anonymous",
            signalType: type || "unknown",
            sdp: sdp || null,
            candidate: candidate || null,
            timestamp: new Date().toISOString(),
          };
          const frame = createWSFrame(JSON.stringify(signal));
          try { targetSocket.write(frame); } catch (e) { /* ignore */ }
          console.log(`  [signal] ${(fromPeerId || "?").slice(0, 12)}… → ${targetPeerId.slice(0, 12)}… type=${type} via WS`);
          return json(res, 200, { status: "ok", queued: true, via: "websocket" });
        }

        // Target not on WS — store for HTTP polling
        const targetExists = peers.has(targetPeerId);
        if (!targetExists) {
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

        return json(res, 200, { status: "ok", queued: true, via: "http-poll" });
      } catch (e) {
        return json(res, 400, { status: "error", message: e.message });
      }
    }

    if (method === "GET") {
      const peerId = url.searchParams.get("peerId");
      if (!peerId) return json(res, 400, { status: "error", message: "Missing peerId" });

      const signals_list = popSignals(peerId);
      return json(res, 200, {
        status: "ok",
        count: signals_list.length,
        signals: signals_list,
      });
    }
  }

  // ─── WS-INFO ──────────────────────────────────────────────
  if (pathname === "/ws-info" && method === "GET") {
    return json(res, 200, {
      status: "ok",
      ws_connected: wsPeers.size,
      http_peers: peers.size,
      ws_connections_total: wsSocketStates.size,
    });
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
      wsConnected: wsPeers.size,
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
        { path: "/signal", method: "GET", desc: "Poll for signals (HTTP fallback)" },
        { path: "/signal", method: "POST", desc: "Send signal to peer" },
        { path: "/ws-info", method: "GET", desc: "WebSocket connection info" },
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
  ║  WS API :   ws://0.0.0.0:${String(PORT).padEnd(5)}                      ║
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
  console.log(`  ║    GET  /ws-info    — WS connection info            ║`);
  console.log(`  ║    POST /register   — Register a peer               ║`);
  console.log(`  ║    POST /heartbeat  — Peer heartbeat                ║`);
  console.log(`  ║    GET  /discover   — List online peers             ║`);
  console.log(`  ║    GET  /peer/:id   — Get peer info                 ║`);
  console.log(`  ║    DELETE /peer/:id — Unregister peer               ║`);
  console.log(`  ║    GET  /signal     — Poll for signals (HTTP)       ║`);
  console.log(`  ║    POST /signal     — Send signal to peer           ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝`);
  console.log(`  Active peers: 0`);
  console.log(`  Press Ctrl+C to stop.\n`);
}

// ─── WebSocket Upgrade Handler ──────────────────────────────────
function setupWebSocket(server) {
  server.on("upgrade", (req, socket, head) => {
    // Only handle valid WebSocket upgrade requests
    const key = req.headers["sec-websocket-key"];
    if (!key) { socket.destroy(); return; }

    // Compute RFC 6455 accept value
    const accept = crypto
      .createHash("sha1")
      .update(key + WS_GUID)
      .digest("base64");

    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
    );

    const state = { peerId: null, buffer: head || Buffer.alloc(0) };
    wsSocketStates.set(socket, state);

    socket.on("data", (data) => {
      state.buffer = Buffer.concat([state.buffer, data]);
      processWSFrames(socket, state);
    });

    socket.on("close", () => {
      if (state.peerId) {
        wsPeers.delete(state.peerId);
      }
      wsSocketStates.delete(socket);
    });

    socket.on("error", () => {
      if (state.peerId) {
        wsPeers.delete(state.peerId);
      }
      wsSocketStates.delete(socket);
    });

    // Process any data that was bundled with the upgrade request
    if (state.buffer.length > 0) {
      processWSFrames(socket, state);
    }
  });
}

// ─── Main ──────────────────────────────────────────────────────
const server = http.createServer(handleRequest);

setupWebSocket(server);

server.listen(PORT, "0.0.0.0", () => {
  printBanner();

  // Start TCP relay
  startTCPRelay();

  // Periodic cleanup
  setInterval(cleanup, CLEANUP_MS);

  // Show active count on interval
  setInterval(() => {
    process.stdout.write(`\x1b[1A\x1b[K  Active peers: ${peers.size} | WS connected: ${wsPeers.size}\n`);
  }, 2000);
});

process.on("SIGINT", () => {
  console.log("\n  Shutting down relay daemon...");
  console.log(`  Final peer count: ${peers.size}`);

  // Gracefully close all WebSocket connections with close frame
  const closePayload = Buffer.alloc(2);
  closePayload.writeUInt16BE(1000, 0);
  const closeFrame = createWSFrame(closePayload, 0x8);

  for (const [socket] of wsSocketStates) {
    try {
      socket.write(closeFrame);
      socket.end();
    } catch (e) { /* ignore */ }
  }

  console.log("  Goodbye!\n");
  process.exit(0);
});
