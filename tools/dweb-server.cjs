#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════
//  dweb Desktop Server v0.1.0
//  Standalone HTTP server for the dweb app
//  - Serves the built React frontend (dist/)
//  - Relay client: auto-registers with relay, heartbeat, peer discovery
//  - Connectivity test endpoints: /ping, /dweb-status, /relay/*
//  - Auto-opens browser on start
//  - Zero npm dependencies — uses only Node.js built-ins
// ═══════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ── Config ─────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT, 10) || 49737;
const RELAY_ADDR    = process.env.RELAY_ADDR || "localhost:49736";
const DIST_DIR      = path.resolve(__dirname, "..", "dist");
const PEER_ID       = `dweb-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const START_TIME    = Date.now();
const SERVER_NAME   = "dweb-desktop-server";
const HEARTBEAT_MS  = 30000;  // send heartbeat every 30s
const SIGNAL_POLL_MS = 5000;  // poll for signals every 5s

// ── State ──────────────────────────────────────────────────────
let relayRegistered = false;
let relayError = null;
let relayPeers = [];
let pendingSignals = [];

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

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT" && !filePath.endsWith(".html")) {
        serveFile(res, path.join(DIST_DIR, "index.html"));
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      }
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": ext === ".html" ? "no-cache" : "max-age=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
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

// ── Relay Client ───────────────────────────────────────────────
async function registerWithRelay() {
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  const rp = parseInt(relayPort, 10) || 49737;
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
  if (!relayRegistered) return;
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    await httpPost(relayHost, parseInt(relayPort, 10) || 49737, "/heartbeat", { peerId: PEER_ID });
  } catch { /* relay might be down */ }
}

async function discoverPeers() {
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    const result = await httpGet(relayHost, parseInt(relayPort, 10) || 49737, "/discover");
    if (result && result.status === "ok") {
      relayPeers = result.peers || [];
    }
  } catch { /* ignore */ }
}

async function pollSignals() {
  if (!relayRegistered) return;
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    const result = await httpGet(relayHost, parseInt(relayPort, 10) || 49737, `/signal?peerId=${PEER_ID}`);
    if (result && result.status === "ok" && result.signals && result.signals.length > 0) {
      pendingSignals.push(...result.signals);
      console.log(`  [relay] Received ${result.signals.length} signal(s)`);
    }
  } catch { /* ignore */ }
}

async function sendSignal(targetPeerId, type, sdp, candidate) {
  const [relayHost, relayPort] = RELAY_ADDR.split(":");
  try {
    const result = await httpPost(relayHost, parseInt(relayPort, 10) || 49737, "/signal", {
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

// ── Request handler ────────────────────────────────────────────
function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ── PING ───────────────────────────────────────────────────
  if (pathname === "/ping") {
    return jsonResponse(res, 200, {
      status: "ok",
      server: {
        name: SERVER_NAME,
        hostname: os.hostname(),
        platform: process.platform,
        version: "0.1.0",
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
      relayConnected: relayRegistered,
      relayAddress: RELAY_ADDR,
      relayError: relayError,
      peersOnline: relayPeers.length,
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + "MB",
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB",
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
      },
      services: ["frontend", "ping", "dweb-status", "relay-client"],
      timestamp: new Date().toISOString(),
    });
  }

  // ── RELAY STATUS ───────────────────────────────────────────
  if (pathname === "/relay/status") {
    return jsonResponse(res, 200, {
      connected: relayRegistered,
      relayAddress: RELAY_ADDR,
      error: relayError,
      peerId: PEER_ID,
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
    // Send a WebRTC offer to a target peer
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

  // ── Static files ────────────────────────────────────────────
  let filePath = path.join(DIST_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  serveFile(res, filePath);
}

// ── Start ──────────────────────────────────────────────────────
const server = http.createServer(handleRequest);
const localIPs = getLocalIPs();

server.listen(PORT, "0.0.0.0", () => {
  const banner = `
  ╔══════════════════════════════════════════════════╗
  ║              dweb Desktop Server v0.1.0          ║
  ║              ──────────────────────              ║
  ║  Hostname : ${os.hostname().padEnd(37)}║
  ║  Peer ID  : ${PEER_ID.padEnd(37)}║
  ║  Platform : ${process.platform.padEnd(37)}║
  ╚══════════════════════════════════════════════════╝
  ╔══════════════════════════════════════════════════╗
  ║  Local access:                                    ║
  ║    http://127.0.0.1:${String(PORT).padEnd(5)}  (this machine)         ║
  ║                                                    ║
  ║  Network access (other machines):                  ║
`;
  const lines = banner.split("\n");
  for (const ip of localIPs) {
    lines.push(`  ║    http://${ip}:${String(PORT).padEnd(5)}  (${ip})${" ".repeat(20 - ip.length)}║`);
  }
  lines.push(`  ║                                                    ║`);
  lines.push(`  ║  Endpoints:                                       ║`);
  lines.push(`  ║    /ping          - Connectivity test             ║`);
  lines.push(`  ║    /dweb-status   - Server status                 ║`);
  lines.push(`  ║    /relay/status  - Relay connection status       ║`);
  lines.push(`  ║    /relay/peers   - List peers from relay         ║`);
  lines.push(`  ║    /relay/signal  - Send signal to peer           ║`);
  lines.push(`  ║    /relay/signals - Poll incoming signals         ║`);
  lines.push(`  ║    /              - dweb app frontend             ║`);
  lines.push(`  ╚══════════════════════════════════════════════════╝`);
  lines.push(`\n  Relay: ${RELAY_ADDR}`);
  lines.push(`  Server started. Press Ctrl+C to stop.\n`);
  console.log(lines.join("\n"));

  // Register with relay
  registerWithRelay();

  // Periodic heartbeat + discovery + signal polling
  setInterval(sendHeartbeat, HEARTBEAT_MS);
  setInterval(discoverPeers, 15000);
  setInterval(pollSignals, SIGNAL_POLL_MS);

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
  console.log("\n  ╔══════════════════════════════════════════════════╗");
  console.log("  ║  Server stopped. Goodbye!                        ║");
  console.log("  ╚══════════════════════════════════════════════════╝\n");
  process.exit(0);
});
