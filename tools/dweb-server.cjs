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

// ── Managed services (started via /api/service/start) ──────────
const runningServices  = new Map(); // name -> { server, port, type, dir }

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
    .update(wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
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

  // ── SERVICE MANAGEMENT ──────────────────────────────────────
  if (pathname === "/api/services" && req.method === "GET") {
    const list = [];
    for (const [name, svc] of runningServices) {
      list.push({ name, port: svc.port, type: svc.type, dir: svc.dir || null, running: true, cpu: 0.5, memory: 8_000_000 });
    }
    return jsonResponse(res, 200, { status: "ok", services: list });
  }

  if (pathname === "/api/service/start" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { name, port, type, dir } = JSON.parse(body);
        if (!name || !port) {
          return jsonResponse(res, 400, { status: "error", message: "name and port required" });
        }

        // Check if already running
        if (runningServices.has(name)) {
          return jsonResponse(res, 200, { status: "ok", message: `Service "${name}" already running` });
        }

        // Create an HTTP server for this service
        const svr = http.createServer((svcReq, svcRes) => {
          // CORS headers for all responses
          const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
          if (svcReq.method === "OPTIONS") {
            svcRes.writeHead(204, cors); return svcRes.end();
          }

          // ── File Browser mode (when dir is provided) ──────────────
          if (dir && fs.existsSync(dir)) {
            const url = new URL(svcReq.url, "http://localhost");
            let reqPath = decodeURIComponent(url.pathname);

            // Security: prevent path traversal
            const resolved = path.resolve(dir, "." + reqPath);
            if (!resolved.startsWith(path.resolve(dir))) {
              svcRes.writeHead(403, { ...cors, "Content-Type": "text/plain" });
              return svcRes.end("Forbidden: path traversal detected");
            }

            // ── HANDLE DELETE ──
            if (svcReq.method === "DELETE" || (svcReq.method === "POST" && url.searchParams.has("delete"))) {
              const delPath = svcReq.method === "DELETE" ? resolved : path.resolve(dir, "." + url.searchParams.get("delete"));
              if (!delPath.startsWith(path.resolve(dir))) {
                svcRes.writeHead(403, { ...cors, "Content-Type": "application/json" });
                return svcRes.end(JSON.stringify({ error: "Forbidden" }));
              }
              fs.stat(delPath, (err, stat) => {
                if (err) {
                  svcRes.writeHead(404, { ...cors, "Content-Type": "application/json" });
                  return svcRes.end(JSON.stringify({ error: "Not found" }));
                }
                const rmCmd = fs.rm;
                rmCmd(delPath, { recursive: true, force: true }, (rmErr) => {
                  if (rmErr) {
                    svcRes.writeHead(500, { ...cors, "Content-Type": "application/json" });
                    return svcRes.end(JSON.stringify({ error: rmErr.message }));
                  }
                  svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
                  svcRes.end(JSON.stringify({ ok: true, deleted: reqPath }));
                });
              });
              return;
            }

            // ── HANDLE UPLOAD ──
            if (svcReq.method === "POST" && !url.searchParams.has("delete")) {
              const contentType = svcReq.headers["content-type"] || "";
              if (contentType.includes("multipart/form-data")) {
                // Simple multipart parser for single file upload
                const boundary = "--" + contentType.split("boundary=")[1];
                const bufs = [];
                svcReq.on("data", c => bufs.push(c));
                svcReq.on("end", () => {
                  const raw = Buffer.concat(bufs);
                  const parts = splitMultiPart(raw, boundary);
                  let fileName = "upload.bin";
                  let fileData = null;
                  let uploadDir = resolved;

                  for (const part of parts) {
                    const headerEnd = part.indexOf("\r\n\r\n");
                    if (headerEnd === -1) continue;
                    const headers = part.slice(0, headerEnd).toString("utf8");
                    const body = part.slice(headerEnd + 4);

                    if (headers.includes('name="dir"')) {
                      const sub = body.toString("utf8").trim();
                      if (sub) uploadDir = path.resolve(dir, sub);
                    } else if (headers.includes('name="file"') || headers.includes('name="files"')) {
                      const nameMatch = headers.match(/filename="([^"]*)"/);
                      if (nameMatch) fileName = nameMatch[1];
                      fileData = body;
                    }
                  }

                  if (!fileData) {
                    svcRes.writeHead(400, { ...cors, "Content-Type": "application/json" });
                    return svcRes.end(JSON.stringify({ error: "No file in upload" }));
                  }

                  const targetPath = path.join(uploadDir, fileName);
                  if (!targetPath.startsWith(path.resolve(dir))) {
                    svcRes.writeHead(403, { ...cors, "Content-Type": "application/json" });
                    return svcRes.end(JSON.stringify({ error: "Forbidden" }));
                  }

                  // Strip trailing \r\n from multipart body (fileData is a Buffer)
                  const cleanData = fileData.length >= 2 && fileData[fileData.length - 1] === 0x0a && fileData[fileData.length - 2] === 0x0d
                    ? fileData.slice(0, -2) : fileData;

                  fs.mkdir(path.dirname(targetPath), { recursive: true }, () => {
                    fs.writeFile(targetPath, cleanData, (writeErr) => {
                      if (writeErr) {
                        svcRes.writeHead(500, { ...cors, "Content-Type": "application/json" });
                        return svcRes.end(JSON.stringify({ error: writeErr.message }));
                      }
                      svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
                      svcRes.end(JSON.stringify({ ok: true, file: fileName, path: targetPath }));
                    });
                  });
                });
                return;
              }

              // JSON body upload (file creation + folder creation)
              let body = "";
              svcReq.on("data", c => body += c);
              svcReq.on("end", () => {
                try {
                  const data = JSON.parse(body);
                  const { file, content, name: fname, mkdir, dir: subDir } = data;

                  if (mkdir || (fname && !file && content === undefined)) {
                    // Create folder
                    const folderName = fname || "new-folder";
                    const targetDir = subDir ? path.resolve(dir, subDir, folderName) : path.join(resolved, folderName);
                    if (!targetDir.startsWith(path.resolve(dir))) {
                      svcRes.writeHead(403, { ...cors, "Content-Type": "application/json" });
                      return svcRes.end(JSON.stringify({ error: "Forbidden" }));
                    }
                    fs.mkdir(targetDir, { recursive: true }, (mkErr) => {
                      if (mkErr) {
                        svcRes.writeHead(500, { ...cors, "Content-Type": "application/json" });
                        return svcRes.end(JSON.stringify({ error: mkErr.message }));
                      }
                      svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
                      svcRes.end(JSON.stringify({ ok: true, folder: folderName }));
                    });
                    return;
                  }

                  // Write file
                  const targetFile = fname || file || "untitled.txt";
                  const targetPath = subDir ? path.resolve(dir, subDir, targetFile) : path.join(resolved, targetFile);
                  if (!targetPath.startsWith(path.resolve(dir))) {
                    svcRes.writeHead(403, { ...cors, "Content-Type": "application/json" });
                    return svcRes.end(JSON.stringify({ error: "Forbidden" }));
                  }
                  fs.writeFile(targetPath, content || "", (writeErr) => {
                    if (writeErr) {
                      svcRes.writeHead(500, { ...cors, "Content-Type": "application/json" });
                      return svcRes.end(JSON.stringify({ error: writeErr.message }));
                    }
                    svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
                    svcRes.end(JSON.stringify({ ok: true, file: targetFile }));
                  });
                } catch {
                  svcRes.writeHead(400, { ...cors, "Content-Type": "application/json" });
                  svcRes.end(JSON.stringify({ error: "Invalid JSON" }));
                }
              });
              return;
            }

            // ── HANDLE DIRECTORY LISTING ──
            fs.stat(resolved, (err, stat) => {
              if (err) {
                if (reqPath === "/" || reqPath === "") {
                  return sendStatusPage(svcRes, name, type, port, dir, cors);
                }
                svcRes.writeHead(404, { ...cors, "Content-Type": "text/plain" });
                return svcRes.end("Not found");
              }

              if (stat.isDirectory()) {
                // Check for index.html
                const indexPath = path.join(resolved, "index.html");
                if (fs.existsSync(indexPath)) {
                  const ext = path.extname(indexPath).toLowerCase();
                  svcRes.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "text/html; charset=utf-8" });
                  return fs.createReadStream(indexPath).pipe(svcRes);
                }
                // Show directory listing
                return sendDirListing(svcRes, resolved, reqPath, dir, cors);
              }

              // Serve file
              const ext = path.extname(resolved).toLowerCase();
              svcRes.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "application/octet-stream" });
              fs.createReadStream(resolved).pipe(svcRes);
            });
            return;
          }

          // ── Default: status page (no dir provided) ────────────────
          sendStatusPage(svcRes, name, type, port, dir, cors);
        });

        // ── Multipart parser helper ──
        function splitMultiPart(buf, boundary) {
          const parts = [];
          const bLen = Buffer.byteLength(boundary);
          let start = 0;
          while (start < buf.length) {
            const idx = buf.indexOf(boundary, start);
            if (idx === -1) break;
            // Check for closing boundary (--boundary--) → stop
            const after = idx + bLen;
            if (after < buf.length && buf[after] === 0x2d) break;
            // Skip \r\n after the boundary line
            let contentStart = after;
            if (contentStart + 1 < buf.length && buf[contentStart] === 0x0d && buf[contentStart + 1] === 0x0a) contentStart += 2;
            // Find next boundary (regular or closing)
            const nextIdx = buf.indexOf(boundary, contentStart);
            if (nextIdx === -1) break;
            // Strip \r\n before the next boundary
            let contentEnd = nextIdx;
            if (contentEnd >= 2 && buf[contentEnd - 2] === 0x0d && buf[contentEnd - 1] === 0x0a) contentEnd -= 2;
            const part = buf.slice(contentStart, contentEnd);
            if (part.length > 0) parts.push(part);
            start = nextIdx;
          }
          return parts;
        }

        // ── Directory listing HTML ──
        function sendDirListing(resp, absPath, relPath, baseDir, cors) {
          fs.readdir(absPath, { withFileTypes: true }, (readErr, entries) => {
            if (readErr) {
              resp.writeHead(500, { ...cors, "Content-Type": "text/plain" });
              return resp.end("Error reading directory");
            }

            // Sort: directories first, then files, alphabetical
            entries.sort((a, b) => {
              if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
              return a.name.localeCompare(b.name);
            });

            // Build breadcrumb path
            const crumbs = relPath.replaceAll("\\", "/").split("/").filter(Boolean);
            const breadcrumbHTML = crumbs.length === 0
              ? `<span style="font-weight:700">/</span>`
              : `<a href="/" style="color:#3b82f6;text-decoration:none">/</a>`
                + crumbs.map((c, i) => {
                    const p = "/" + crumbs.slice(0, i + 1).join("/");
                    return i === crumbs.length - 1
                      ? `<span style="font-weight:600">${escHtml(c)}</span>`
                      : `<a href="${p}" style="color:#3b82f6;text-decoration:none">${escHtml(c)}</a> /`;
                  }).join(" ");

            const rows = entries.map(e => {
              const isDir = e.isDirectory();
              const fullPath = path.join(absPath, e.name);
              let size = "", mtime = "";
              try {
                const s = fs.statSync(fullPath);
                size = isDir ? "" : formatBytes(s.size);
                mtime = s.mtime.toLocaleString();
              } catch {}
              const icon = isDir ? "📁" : getFileIcon(e.name);
              const href = (relPath === "/" ? "" : relPath) + "/" + encodeURIComponent(e.name);
              return `<tr>
                <td class="icon">${icon}</td>
                <td class="name"><a href="${href}">${escHtml(e.name)}</a></td>
                <td class="size">${size}</td>
                <td class="date">${mtime}</td>
                <td class="actions">
                  ${isDir ? "" : `<button class="dl-btn" onclick="fetch('${href}',{method:'DELETE'}).then(()=>location.reload())" title="Delete">🗑</button>`}
                  <button class="dl-btn" onclick="if(prompt('Delete ${isDir ? "folder: " : "file: "}${escHtml(e.name)}?'))fetch('${href}',{method:'DELETE'}).then(()=>location.reload())" title="Delete">🗑</button>
                </td>
              </tr>`;
            }).join("\n");

            const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(path.basename(absPath) || "File Browser")}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:system-ui,sans-serif; background:#0f0f13; color:#e2e8f0; min-height:100vh; }
  .header { background:#1a1a2e; border-bottom:1px solid rgba(255,255,255,0.06); padding:12px 20px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .header h1 { font-size:16px; font-weight:600; color:#22c55e; }
  .header .info { font-size:11px; color:#6b7280; }
  .breadcrumb { padding:10px 20px; font-size:13px; background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.04); }
  .toolbar { padding:10px 20px; display:flex; gap:8px; align-items:center; }
  .toolbar button, .toolbar label { padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:#e2e8f0; font-size:12px; cursor:pointer; transition:all 0.15s; }
  .toolbar button:hover, .toolbar label:hover { background:rgba(59,130,246,0.15); border-color:rgba(59,130,246,0.3); }
  .toolbar .new-folder input { padding:5px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:#e2e8f0; font-size:12px; width:140px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; padding:8px 12px; font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.06); }
  td { padding:8px 12px; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.03); }
  tr:hover td { background:rgba(59,130,246,0.04); }
  .icon { width:28px; font-size:16px; text-align:center; }
  .name a { color:#e2e8f0; text-decoration:none; font-weight:500; }
  .name a:hover { color:#3b82f6; }
  .size { width:80px; color:#6b7280; font-size:12px; font-family:monospace; }
  .date { width:160px; color:#6b7280; font-size:11px; }
  .actions { width:60px; text-align:right; }
  .dl-btn { background:none; border:none; cursor:pointer; font-size:14px; padding:2px 4px; border-radius:4px; opacity:0.4; transition:opacity 0.15s; }
  .dl-btn:hover { opacity:1; background:rgba(239,68,68,0.15); }
  .empty-state { padding:40px; text-align:center; color:#6b7280; font-size:14px; }
  .upload-progress { font-size:11px; color:#22c55e; padding:4px 0; display:none; }
  #file-input { display:none; }
  .toast { position:fixed; bottom:20px; right:20px; padding:8px 16px; border-radius:6px; font-size:13px; z-index:999; transition:all 0.3s; }
  .toast.success { background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3); color:#22c55e; }
  .toast.error { background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; }
  @media(max-width:600px) { .header, .breadcrumb, .toolbar { padding:8px 12px; } td,th { padding:6px 8px; } .date { display:none; } }
</style></head>
<body>
  <div class="header">
    <h1>📁 ${escHtml(name)}</h1>
    <span class="info">${escHtml(baseDir)} · ${entries.length} item(s)</span>
  </div>
  <div class="breadcrumb">📂 ${breadcrumbHTML}</div>
  <div class="toolbar">
    <label for="file-input">📤 Upload Files</label>
    <input type="file" id="file-input" multiple onchange="uploadFiles(this.files)">
    <button onclick="newFolder()">📁 New Folder</button>
    <span class="new-folder" id="new-folder-input" style="display:none">
      <input type="text" id="folder-name" placeholder="folder name" onkeydown="if(event.key==='Enter')createFolder()">
      <button class="dl-btn" onclick="createFolder()" style="opacity:1">✓</button>
      <button class="dl-btn" onclick="cancelNewFolder()" style="opacity:1;color:#ef4444">✕</button>
    </span>
    <span class="upload-progress" id="upload-progress"></span>
  </div>
  <div id="dropzone" style="min-height:200px">
    ${entries.length === 0 ? '<div class="empty-state">📭 This folder is empty<br><span style="font-size:12px">Upload files using the button above</span></div>' : `
    <table>
      <thead><tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`}
  </div>
<script>
const currentPath = ${JSON.stringify(relPath === "/" ? "" : relPath)};
function uploadFiles(files) {
  if (!files.length) return;
  const prog = document.getElementById("upload-progress");
  let done = 0;
  for (const f of files) {
    const fd = new FormData();
    fd.append("dir", currentPath);
    fd.append("file", f);
    prog.style.display = "inline";
    prog.textContent = "Uploading " + f.name + "...";
    fetch("", { method: "POST", body: fd })
      .then(r => r.json())
      .then(() => { done++; if (done === files.length) location.reload(); })
      .catch(e => { prog.textContent = "Error: " + e.message; });
  }
}
function newFolder() {
  document.getElementById("new-folder-input").style.display = "inline";
  document.getElementById("folder-name").focus();
}
function cancelNewFolder() {
  document.getElementById("new-folder-input").style.display = "none";
  document.getElementById("folder-name").value = "";
}
function createFolder() {
  const name = document.getElementById("folder-name").value.trim();
  if (!name) return;
  fetch("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, dir: currentPath })
  }).then(r => r.json()).then(() => location.reload()).catch(e => alert(e.message));
}
// Drag and drop
const dz = document.getElementById("dropzone");
dz.addEventListener("dragover", e => { e.preventDefault(); dz.style.outline = "2px dashed #3b82f6"; });
dz.addEventListener("dragleave", () => { dz.style.outline = ""; });
dz.addEventListener("drop", e => {
  e.preventDefault(); dz.style.outline = "";
  uploadFiles(e.dataTransfer.files);
});
// Auto-refresh if uploaded via status page
if (window.name !== "dweb-browser") setTimeout(() => location.reload(), 30000);
</script>
</body></html>`;

            resp.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            resp.end(html);
          });
        }

        // ── Status page (when no dir provided or no index.html) ──
        function sendStatusPage(resp, svcName, svcType, svcPort, svcDir, cors) {
          const svcInfo = runningServices.get(svcName);
          const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${svcName}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:system-ui,sans-serif; background:#0f0f13; color:#e2e8f0; min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { background:#1a1a2e; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:32px; max-width:520px; width:90%; }
  h1 { font-size:20px; font-weight:700; display:flex; align-items:center; gap:10px; }
  .badge { display:inline-block; background:#22c55e22; color:#22c55e; border-radius:6px; padding:2px 10px; font-size:12px; font-weight:600; }
  .label { color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-top:16px; margin-bottom:4px; }
  .value { color:#e2e8f0; font-size:14px; }
  pre { background:#0f0f13; color:#cdd6f4; padding:14px; border-radius:8px; overflow:auto; font-size:12px; margin-top:16px; border:1px solid rgba(255,255,255,0.04); }
  .meta { color:#6b7280; font-size:12px; margin-top:16px; }
  a { color:#3b82f6; text-decoration:none; }
  .actions { display:flex; gap:8px; margin-top:16px; }
  .actions a { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:500; transition:all 0.15s; }
  .actions a.primary { background:#3b82f6; color:#fff; }
  .actions a.secondary { background:rgba(255,255,255,0.06); color:#e2e8f0; border:1px solid rgba(255,255,255,0.1); }
  .actions a:hover { transform:translateY(-1px); }
</style></head>
<body>
  <div class="card">
    <h1>${escHtml(svcName)} <span class="badge">● Running</span></h1>
    ${svcType ? `<div class="label">Type</div><div class="value">${escHtml(svcType)}</div>` : ""}
    ${svcDir ? `<div class="label">Directory</div><div class="value"><code>${escHtml(svcDir)}</code></div>` : ""}
    <pre>dweb service since ${new Date().toISOString()}

  Local:    http://localhost:${svcPort}
  Network:  http://${getLocalIPs()[0] || "127.0.0.1"}:${svcPort}
  dweb:     dweb://${svcName.toLowerCase().replace(/\\s+/g, "-")}.dweb</pre>
    ${svcDir ? `<div class="actions">
      <a class="primary" href="/">📂 Browse Files</a>
      <a class="secondary" href="#" onclick="document.getElementById('fu').click();return false">📤 Upload</a>
      <input type="file" id="fu" multiple style="display:none" onchange="(f=>{for(const x of f){const d=new FormData();d.append('file',x);fetch('',{method:'POST',body:d})}setTimeout(()=>location.href='/',500)})(this.files)">
    </div>` : ""}
    <div class="meta">This service is managed by dweb-server. Stop it from the Dashboard.</div>
  </div>
</body></html>`;
          resp.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
          resp.end(html);
        }

        // ── Helpers ──
        function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
        function formatBytes(b) {
          if (!b || b === 0) return "";
          const u = ["B","KB","MB","GB"]; let i = 0; let s = b;
          while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
          return s.toFixed(i === 0 ? 0 : 1) + " " + u[i];
        }
        function getFileIcon(n) {
          const e = n.split(".").pop().toLowerCase();
          if (["jpg","jpeg","png","gif","svg","webp","ico","bmp"].includes(e)) return "🖼";
          if (["mp4","webm","avi","mkv","mov"].includes(e)) return "🎬";
          if (["mp3","wav","ogg","flac","m4a"].includes(e)) return "🎵";
          if (["zip","tar","gz","rar","7z"].includes(e)) return "🗜";
          if (["pdf"].includes(e)) return "📄";
          if (["doc","docx"].includes(e)) return "📝";
          if (["xls","xlsx","csv"].includes(e)) return "📊";
          if (["js","ts","jsx","tsx","json","html","css","scss","py","rb","go","rs","java","c","cpp","h","sh","bash","yml","yaml","toml","ini","cfg","md","txt"].includes(e)) return "📄";
          return "📄";
        }

        // Handle EADDRINUSE gracefully
        svr.once("error", (err) => {
          if (err.code === "EADDRINUSE") {
            return jsonResponse(res, 409, { status: "error", message: `Port ${port} is already in use` });
          }
          return jsonResponse(res, 500, { status: "error", message: err.message });
        });

        svr.listen(port, "0.0.0.0", () => {
          runningServices.set(name, { server: svr, port, type: type || "Custom", dir: dir || null });
          console.log(`  [service] Started "${name}" on port ${port}${dir ? ` dir="${dir}"` : ""}`);
          return jsonResponse(res, 200, {
            status: "ok",
            message: `Service "${name}" started on port ${port}`,
            service: { name, port, type: type || "Custom", dir: dir || null, running: true },
          });
        });
      } catch (e) {
        return jsonResponse(res, 400, { status: "error", message: e.message });
      }
    });
    return;
  }

  if (pathname === "/api/service/stop" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { name } = JSON.parse(body);
        const svc = runningServices.get(name);
        if (!svc) {
          return jsonResponse(res, 404, { status: "error", message: `Service "${name}" not found` });
        }
        svc.server.close();
        runningServices.delete(name);
        console.log(`  [service] Stopped "${name}" on port ${svc.port}`);
        return jsonResponse(res, 200, { status: "ok", message: `Service "${name}" stopped` });
      } catch (e) {
        return jsonResponse(res, 400, { status: "error", message: e.message });
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
  lines.push(`  \u2551    /api/service/start - Start a managed service    \u2551`);
  lines.push(`  \u2551    /api/service/stop  - Stop a managed service     \u2551`);
  lines.push(`  \u2551    /api/services      - List managed services      \u2551`);
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
