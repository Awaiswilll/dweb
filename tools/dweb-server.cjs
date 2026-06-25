#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════
//  dweb Desktop Server v0.2.0
//  Standalone HTTP server for the dweb app
//  - Serves the built React frontend (dist/) with ETag caching
//  - Relay client: WebSocket relay with HTTP fallback
//  - Connectivity test endpoints: /ping, /dweb-status, /relay/*
//  - AI API proxy: Ollama, OpenAI, Anthropic (keys stay server-side)
//  - In-memory rate limiter (200 req/min per IP)
//  - Zero npm dependencies — uses only Node.js built-ins
// ═══════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const net  = require("net");
const crypto = require("crypto");

// ── Config ─────────────────────────────────────────────────────
const PORT            = parseInt(process.env.PORT, 10) || 49737;
const RELAY_ADDR      = process.env.RELAY_ADDR || "localhost:49736";
const DIST_DIR        = (() => {
  const local = path.resolve(__dirname, "dist");
  const parent = path.resolve(__dirname, "..", "dist");
  return (fs.existsSync(local) && fs.statSync(local).isDirectory()) ? local : parent;
})();
const PEER_ID         = `dweb-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const START_TIME      = Date.now();
const SERVER_NAME     = "dweb-desktop-server";
const HEARTBEAT_MS    = 30000;
const SIGNAL_POLL_MS  = 5000;
const WS_RECONNECT_MS = 5000;
const RATE_LIMIT_MAX  = 200;
const RATE_WINDOW_MS  = 60000;

// ── State ──────────────────────────────────────────────────────
let relayRegistered    = false;
let relayError         = null;
let relayPeers         = [];
let pendingSignals     = [];
let relayConnectionState = "disconnected";

let wsRelayConnected   = false;
let wsRelaySocket      = null;
let relayWsError       = null;
let wsFrameBuffer      = Buffer.alloc(0);

const rateLimitMap     = new Map();

// ── MIME types ─────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

// ── Helpers ────────────────────────────────────────────────────
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips.length ? ips : ["127.0.0.1"];
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

function httpGet(host, port, pathname) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port, path: pathname, method: "GET", timeout: 5000 };
    const req = http.request(opts, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

function httpPost(host, port, pathname, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = {
      hostname: host, port, path: pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 5000,
    };
    const req = http.request(opts, res => {
      let resp = "";
      res.on("data", c => resp += c);
      res.on("end", () => {
        try { resolve(JSON.parse(resp)); }
        catch { resolve(null); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

function setRelayConnectionState(state) {
  if (state !== relayConnectionState) {
    const prev = relayConnectionState;
    relayConnectionState = state;
    console.log(`  [relay] Connection state: ${prev} \u2192 ${state}`);
  }
}

// ── Rate limiter ───────────────────────────────────────────────
function checkRateLimit(req) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, entry);
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count++;
  return true;
}

// ── File serving with ETag caching ─────────────────────────────
function serveFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";

  fs.stat(filePath, (err, stat) => {
    if (err) {
      if (err.code === "ENOENT" && !filePath.endsWith(".html")) {
        serveFile(req, res, path.join(DIST_DIR, "index.html"));
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      }
      return;
    }

    const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, {
        "Cache-Control": ext === ".html" ? "no-cache" : "max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "ETag": etag,
      });
      return res.end();
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": ext === ".html" ? "no-cache" : "max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "ETag": etag,
      });
      res.end(data);
    });
  });
}

// ── WebSocket relay client (RFC 6455) ──────────────────────────
function wsRelaySendFrame(socket, opcode, payload) {
  if (!socket || !socket.writable) return;

  const maskKey = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4];
  }

  let headerSize;
  if (payload.length < 126) headerSize = 2;
  else if (payload.length < 65536) headerSize = 4;
  else headerSize = 10;
  headerSize += 4;

  const frame = Buffer.alloc(headerSize + payload.length);
  let offset = 0;
  frame[offset++] = 0x80 | opcode;
  if (payload.length < 126) {
    frame[offset++] = 0x80 | payload.length;
  } else if (payload.length < 65536) {
    frame[offset++] = 0x80 | 126;
    frame.writeUInt16BE(payload.length, offset);
    offset += 2;
  } else {
    frame[offset++] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(payload.length), offset);
    offset += 8;
  }
  maskKey.copy(frame, offset, 0, 4);
  offset += 4;
  masked.copy(frame, offset);

  socket.write(frame);
}

function wsRelaySendText(socket, text) {
  wsRelaySendFrame(socket, 0x01, Buffer.from(text, "utf8"));
}

function onWsRelayMessage(msg) {
  if (msg.type === "signals" && Array.isArray(msg.signals)) {
    if (msg.signals.length > 0) {
      pendingSignals.push(...msg.signals);
      console.log(`  [relay-ws] Received ${msg.signals.length} signal(s)`);
    }
  } else if (msg.type === "peers" && Array.isArray(msg.peers)) {
    relayPeers = msg.peers;
  } else if (msg.type === "heartbeat_ack") {
    // acknowledged
  } else if (msg.type === "register_ack") {
    relayRegistered = true;
    relayError = null;
  }
}

function processWsFrames(socket, data) {
  wsFrameBuffer = Buffer.concat([wsFrameBuffer, data]);

  while (wsFrameBuffer.length >= 2) {
    const firstByte = wsFrameBuffer[0];
    const opcode = firstByte & 0x0F;
    const secondByte = wsFrameBuffer[1];
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7F;
    let offset = 2;

    if (payloadLen === 126) {
      if (wsFrameBuffer.length < 4) return;
      payloadLen = wsFrameBuffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (wsFrameBuffer.length < 10) return;
      const bigLen = wsFrameBuffer.readBigUInt64BE(2);
      if (bigLen > Number.MAX_SAFE_INTEGER) { socket.destroy(); return; }
      payloadLen = Number(bigLen);
      offset = 10;
    }

    let maskOffset = 0;
    if (masked) {
      if (wsFrameBuffer.length < offset + 4) return;
      maskOffset = 4;
    }

    if (wsFrameBuffer.length < offset + maskOffset + payloadLen) return;

    const payloadStart = offset + maskOffset;
    let payload = wsFrameBuffer.slice(payloadStart, payloadStart + payloadLen);

    if (masked) {
      const maskKey = wsFrameBuffer.slice(offset, offset + 4);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    wsFrameBuffer = wsFrameBuffer.slice(payloadStart + payloadLen);

    if (opcode === 0x08) {
      wsRelaySendFrame(socket, 0x08, Buffer.from([0x03, 0xE8]));
      socket.end();
      wsRelayConnected = false;
      return;
    }
    if (opcode === 0x09) {
      wsRelaySendFrame(socket, 0x0A, payload);
      continue;
    }
    if (opcode === 0x0A) continue;

    if (opcode === 0x01) {
      try {
        const msg = JSON.parse(payload.toString("utf8"));
        onWsRelayMessage(msg);
      } catch {}
    }
  }
}

function wsRelayConnect() {
  if (wsRelayConnected) return;

  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  const rp = parseInt(relayPort, 10) || 49736;

  const socket = new net.Socket();
  let handshakeBuf = Buffer.alloc(0);
  let handshakeDone = false;

  const wsKey = crypto.randomBytes(16).toString("base64");
  const expectedAccept = crypto.createHash("sha1")
    .update(wsKey + "258EAFA5-E914-47DA-95CA-5AB9DC11B785")
    .digest("base64");

  socket.connect(rp, relayHost, () => {
    socket.write([
      "GET /ws HTTP/1.1",
      `Host: ${RELAY_ADDR}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${wsKey}`,
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n"));
  });

  socket.on("data", (data) => {
    if (!handshakeDone) {
      handshakeBuf = Buffer.concat([handshakeBuf, data]);

      const headerEnd = handshakeBuf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const headerStr = handshakeBuf.slice(0, headerEnd).toString("utf8");
      const lines = headerStr.split("\r\n");
      const statusLine = lines[0];

      if (!statusLine.includes(" 101 ")) {
        console.log(`  [relay-ws] Upgrade failed: ${statusLine}`);
        socket.destroy();
        return;
      }

      const acceptLine = lines.find(l =>
        l.trim().toLowerCase().startsWith("sec-websocket-accept:")
      );
      if (!acceptLine) {
        console.log(`  [relay-ws] Missing Sec-WebSocket-Accept`);
        socket.destroy();
        return;
      }

      const accept = acceptLine.split(":")[1].trim();
      if (accept !== expectedAccept) {
        console.log(`  [relay-ws] Invalid accept key`);
        socket.destroy();
        return;
      }

      handshakeDone = true;
      wsRelayConnected = true;
      wsRelaySocket = socket;
      relayWsError = null;
      setRelayConnectionState("connected");
      console.log(`  [relay-ws] Connected to ${RELAY_ADDR}`);

      wsRelaySendText(socket, JSON.stringify({
        type: "register", peerId: PEER_ID,
        hostname: os.hostname(), platform: process.platform,
        version: "0.1.0", port: PORT,
      }));

      wsFrameBuffer = Buffer.alloc(0);
      const leftover = handshakeBuf.slice(headerEnd + 4);
      if (leftover.length > 0) processWsFrames(socket, leftover);
      return;
    }

    processWsFrames(socket, data);
  });

  socket.on("close", () => {
    if (wsRelayConnected || relayConnectionState === "connected") {
      setRelayConnectionState("disconnected");
      console.log(`  [relay-ws] Disconnected from ${RELAY_ADDR}`);
    }
    wsRelayConnected = false;
    wsRelaySocket = null;
    wsFrameBuffer = Buffer.alloc(0);
    setTimeout(wsRelayConnect, WS_RECONNECT_MS);
  });

  socket.on("error", (err) => {
    relayWsError = err.message;
    wsRelayConnected = false;
    wsRelaySocket = null;
    socket.destroy();
  });

  socket.setTimeout(10000, () => {
    if (!handshakeDone) {
      console.log(`  [relay-ws] Handshake timeout`);
      socket.destroy();
    }
  });
}

function wsRelayHeartbeat() {
  if (wsRelayConnected && wsRelaySocket && wsRelaySocket.writable) {
    wsRelaySendText(wsRelaySocket, JSON.stringify({ type: "heartbeat", peerId: PEER_ID }));
  }
}

// ── HTTP relay client (fallback) ───────────────────────────────
async function registerWithRelay() {
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  const rp = parseInt(relayPort, 10) || 49736;
  const localIPs = getLocalIPs();

  try {
    const result = await httpPost(relayHost, rp, "/register", {
      id: PEER_ID,
      hostname: os.hostname(),
      platform: process.platform,
      version: "0.1.0",
      address: localIPs[0] || "127.0.0.1",
      port: PORT,
      mode: process.env.P2P_MODE || "p2p-visible",
      services: ["frontend", "ping", "dweb-status"],
      publicKey: PEER_ID,
    });
    if (result && result.status === "ok") {
      relayRegistered = true;
      relayError = null;
      console.log(`  [relay] Registered as ${PEER_ID}  (${result.peersOnline} peers online)`);
    } else {
      relayError = "registration failed";
    }
  } catch (e) {
    relayError = e.message;
    console.log(`  [relay] Cannot reach relay at ${RELAY_ADDR} — ${e.message}`);
  }
}

async function sendHeartbeat() {
  if (wsRelayConnected) { wsRelayHeartbeat(); return; }
  if (!relayRegistered) return;
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    await httpPost(relayHost, parseInt(relayPort, 10) || 49736, "/heartbeat", { peerId: PEER_ID });
  } catch {}
}

async function discoverPeers() {
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    const result = await httpGet(relayHost, parseInt(relayPort, 10) || 49736, "/discover");
    if (result && result.status === "ok") {
      relayPeers = result.peers || [];
    }
  } catch {}
}

async function pollSignals() {
  if (wsRelayConnected) return;
  if (!relayRegistered) return;
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    const result = await httpGet(relayHost, parseInt(relayPort, 10) || 49736, `/signal?peerId=${PEER_ID}`);
    if (result && result.status === "ok" && result.signals && result.signals.length > 0) {
      pendingSignals.push(...result.signals);
      console.log(`  [relay] Received ${result.signals.length} signal(s)`);
    }
  } catch {}
}

async function sendSignal(targetPeerId, type, sdp, candidate) {
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    const result = await httpPost(relayHost, parseInt(relayPort, 10) || 49736, "/signal", {
      targetPeerId,
      fromPeerId: PEER_ID,
      type,
      sdp: sdp || null,
      candidate: candidate || null,
    });
    return result;
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

// ── AI API proxy ───────────────────────────────────────────────
function proxyUpstream(clientReq, clientRes, targetUrl, extraHeaders) {
  const url = new URL(targetUrl);
  const mod = url.protocol === "https:" ? https : http;
  const port = url.port || (url.protocol === "https:" ? 443 : 80);

  const options = {
    hostname: url.hostname,
    port,
    path: url.pathname + url.search,
    method: clientReq.method,
    headers: { ...extraHeaders },
    timeout: 120000,
  };

  if (clientReq.headers["content-type"]) {
    options.headers["Content-Type"] = clientReq.headers["content-type"];
  }

  const proxyReq = mod.request(options, (proxyRes) => {
    const respHeaders = { ...proxyRes.headers };
    delete respHeaders["transfer-encoding"];
    respHeaders["Access-Control-Allow-Origin"] = "*";
    clientRes.writeHead(proxyRes.statusCode, respHeaders);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      clientRes.end(JSON.stringify({ error: err.message }));
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!clientRes.headersSent) {
      clientRes.writeHead(504, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      clientRes.end(JSON.stringify({ error: "Upstream timeout" }));
    }
  });

  clientReq.pipe(proxyReq);
}

// ── Request handler ────────────────────────────────────────────
function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    });
    return res.end();
  }

  // Rate limiting
  if (!checkRateLimit(req)) {
    res.writeHead(429, {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": "60",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(JSON.stringify({ error: "Too many requests", retryAfter: 60 }));
  }

  // ── PING ───────────────────────────────────────────────────
  if (pathname === "/ping") {
    return jsonResponse(res, 200, {
      status: "ok",
      server: {
        name: SERVER_NAME,
        hostname: os.hostname(),
        platform: process.platform,
        version: "0.2.0",
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
      },
      request: {
        ip: req.socket.remoteAddress,
        method: req.method,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ── DWEB STATUS ────────────────────────────────────────────
  if (pathname === "/dweb-status") {
    const mem = process.memoryUsage();
    return jsonResponse(res, 200, {
      status: "ok",
      peerId: PEER_ID,
      hostname: os.hostname(),
      platform: process.platform,
      localIPs: getLocalIPs(),
      port: PORT,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      relayConnected: relayRegistered || wsRelayConnected,
      relayAddress: RELAY_ADDR,
      relayError: relayError || relayWsError,
      relayWsConnected: wsRelayConnected,
      relayConnectionState,
      peersOnline: relayPeers.length,
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + "MB",
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB",
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
      },
      services: ["frontend", "ping", "dweb-status", "relay-client", "ai-proxy"],
      timestamp: new Date().toISOString(),
    });
  }

  // ── RELAY STATUS ───────────────────────────────────────────
  if (pathname === "/relay/status") {
    return jsonResponse(res, 200, {
      connected: relayRegistered || wsRelayConnected,
      relayAddress: RELAY_ADDR,
      error: relayError || relayWsError,
      peerId: PEER_ID,
      wsConnected: wsRelayConnected,
      connectionState: relayConnectionState,
      peersOnline: relayPeers.length,
      pendingSignals: pendingSignals.length,
      localIPs: getLocalIPs(),
    });
  }

  // ── RELAY PEERS ────────────────────────────────────────────
  if (pathname === "/relay/peers") {
    const filtered = relayPeers.filter(p => p.id !== PEER_ID);
    return jsonResponse(res, 200, {
      status: "ok",
      count: filtered.length,
      peers: filtered,
    });
  }

  // ── RELAY PEER INFO ────────────────────────────────────────
  const peerInfoMatch = pathname.match(/^\/relay\/peer\/(.+)$/);
  if (peerInfoMatch && req.method === "GET") {
    const targetId = peerInfoMatch[1];
    const peer = relayPeers.find(p => p.id === targetId);
    if (peer) {
      return jsonResponse(res, 200, { status: "ok", peer });
    }
    return jsonResponse(res, 404, { status: "error", message: "Peer not found" });
  }

  // ── RELAY SIGNAL SEND ──────────────────────────────────────
  if (pathname === "/relay/signal" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const result = await sendSignal(data.targetPeerId, data.type, data.sdp, data.candidate);
        return jsonResponse(res, result.status === "ok" ? 200 : 500, result);
      } catch (e) {
        return jsonResponse(res, 400, { status: "error", message: "Invalid JSON" });
      }
    });
    return;
  }

  // ── RELAY SIGNALS POLL ─────────────────────────────────────
  if (pathname === "/relay/signals" && req.method === "GET") {
    const signals = pendingSignals.splice(0, pendingSignals.length);
    return jsonResponse(res, 200, {
      status: "ok",
      count: signals.length,
      signals,
    });
  }

  // ── RELAY CONNECT ──────────────────────────────────────────
  if (pathname === "/relay/connect" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const result = await sendSignal(data.targetPeerId, "offer", data.sdp || "v=0\r\n");
        return jsonResponse(res, result.status === "ok" ? 200 : 500, result);
      } catch (e) {
        return jsonResponse(res, 400, { status: "error", message: "Invalid JSON" });
      }
    });
    return;
  }

  // ── AI OLLAMA CHAT ─────────────────────────────────────────
  if (pathname === "/ai/ollama/chat" && req.method === "POST") {
    return proxyUpstream(req, res, "http://localhost:11434/api/chat", {
      "Content-Type": "application/json",
    });
  }

  // ── AI OPENAI CHAT ─────────────────────────────────────────
  if (pathname === "/ai/openai/chat" && req.method === "POST") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(res, 500, { error: "OPENAI_API_KEY not configured" });
    }
    return proxyUpstream(req, res, "https://api.openai.com/v1/chat/completions", {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });
  }

  // ── AI ANTHROPIC MESSAGES ──────────────────────────────────
  if (pathname === "/ai/anthropic/messages" && req.method === "POST") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return jsonResponse(res, 500, { error: "ANTHROPIC_API_KEY not configured" });
    }
    return proxyUpstream(req, res, "https://api.anthropic.com/v1/messages", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });
  }

  // ── AI STATUS ──────────────────────────────────────────────
  if (pathname === "/ai/status") {
    return jsonResponse(res, 200, {
      ollama: true,
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    });
  }

  // ── Static files ────────────────────────────────────────────
  let filePath = path.join(DIST_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  serveFile(req, res, filePath);
}

// ── Start ──────────────────────────────────────────────────────
const server = http.createServer(handleRequest);
const localIPs = getLocalIPs();

server.listen(PORT, "0.0.0.0", () => {
  const banner = `
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551              dweb Desktop Server v0.2.0          \u2551
  \u2551              \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2551
  \u2551  Hostname : ${os.hostname().padEnd(37)}\u2551
  \u2551  Peer ID  : ${PEER_ID.padEnd(37)}\u2551
  \u2551  Platform : ${process.platform.padEnd(37)}\u2551
  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551  Local access:                                    \u2551
  \u2551    http://127.0.0.1:${String(PORT).padEnd(5)}  (this machine)         \u2551
  \u2551                                                    \u2551
  \u2551  Network access (other machines):                  \u2551
`;
  const lines = banner.split("\n");
  for (const ip of localIPs) {
    lines.push(`  \u2551    http://${ip}:${String(PORT).padEnd(5)}  (${ip})${" ".repeat(20 - ip.length)}\u2551`);
  }
  lines.push(`  \u2551                                                    \u2551`);
  lines.push(`  \u2551  Endpoints:                                       \u2551`);
  lines.push(`  \u2551    /ping          - Connectivity test             \u2551`);
  lines.push(`  \u2551    /dweb-status   - Server status                 \u2551`);
  lines.push(`  \u2551    /relay/status  - Relay connection status       \u2551`);
  lines.push(`  \u2551    /relay/peers   - List peers from relay         \u2551`);
  lines.push(`  \u2551    /relay/signal  - Send signal to peer           \u2551`);
  lines.push(`  \u2551    /relay/signals - Poll incoming signals         \u2551`);
  lines.push(`  \u2551    /ai/status     - AI provider config status     \u2551`);
  lines.push(`  \u2551    /ai/ollama/chat - Ollama chat proxy            \u2551`);
  lines.push(`  \u2551    /ai/openai/chat - OpenAI chat proxy            \u2551`);
  lines.push(`  \u2551    /ai/anthropic/messages - Anthropic messages    \u2551`);
  lines.push(`  \u2551    /              - dweb app frontend             \u2551`);
  lines.push(`  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d`);
  lines.push(`\n  Relay: ${RELAY_ADDR}  (WS: ${wsRelayConnected ? "connected" : "connecting\u2026"})`);
  lines.push(`\x1b[2m  Rate limit: ${RATE_LIMIT_MAX} req/min per IP\x1b[0m`);
  lines.push(`  Server started. Press Ctrl+C to stop.\n`);
  console.log(lines.join("\n"));

  // Register with relay (HTTP)
  registerWithRelay();

  // Start WebSocket relay client
  wsRelayConnect();

  // Periodic tasks
  setInterval(sendHeartbeat, HEARTBEAT_MS);
  setInterval(discoverPeers, 15000);
  setInterval(pollSignals, SIGNAL_POLL_MS);

  // Rate limit map cleanup every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetTime) rateLimitMap.delete(key);
    }
  }, 120000);

  // Open browser
  const openCmd = (() => {
    switch (process.platform) {
      case "win32": return `start http://127.0.0.1:${PORT}`;
      case "darwin": return `open http://127.0.0.1:${PORT}`;
      default: return `xdg-open http://127.0.0.1:${PORT}`;
    }
  })();
  require("child_process").exec(openCmd, () => {});
});

process.on("SIGINT", () => {
  console.log("\n  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("  \u2551  Server stopped. Goodbye!                        \u2551");
  console.log("  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n");
  process.exit(0);
});
