#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════════
//  dweb v0.1.0 — Unified P2P Server + Web Development IDE + Free Hosting Platform
//
//  Run:   node dweb.cjs
//  Env:   PORT=49737, RELAY_PORT=49736, MODE=auto, NAME=my-dweb
//
//  Every dweb instance is:
//    1. A P2P relay node (helps peers discover & connect)
//    2. A web development server (serves the React IDE + AI agent)  
//    3. A free hosting platform (hosts services, domains, APIs)
//
//  When two dweb instances connect, they collaborate:
//    - Share hosted services between machines
//    - Share AI agent sessions
//    - Proxy traffic through the P2P network
//
//  Zero npm dependencies — pure Node.js stdlib
// ═══════════════════════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const crypto = require("crypto");
const net   = require("net");
const { execSync } = require("child_process");

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const PORT          = parseInt(process.env.PORT, 10) || 49737;     // Frontend + API
const RELAY_PORT    = parseInt(process.env.RELAY_PORT, 10) || 49736;  // P2P relay
const TCP_RELAY_PORT = parseInt(process.env.TCP_PORT, 10) || 49738;   // TCP proxy
const PEER_TTL_MS   = parseInt(process.env.PEER_TTL, 10) || 60000;
const DIST_DIR      = path.resolve(__dirname, "dist");
const MODE          = (process.env.MODE || "auto").toLowerCase();   // auto | relay | peer | isolated
const INSTANCE_NAME = process.env.NAME || os.hostname();

const SERVER_ID     = crypto.randomUUID().split("-")[0].slice(0, 8);
const PEER_ID       = `dweb-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${SERVER_ID}`;
const START_TIME    = Date.now();
const LOCAL_IPS     = getLocalIPs();

// Upstream relay to connect to (can be this instance or another)
const UPSTREAM_RELAY = process.env.UPSTREAM || null;
let relayConnected = false;
let relayError = null;

// Shared directory for file share
const SHARE_DIR = path.resolve(__dirname, "shared-files");
if (!fs.existsSync(SHARE_DIR)) {
  fs.mkdirSync(SHARE_DIR, { recursive: true });
  console.log(`  [fileshare] Created share directory: ${SHARE_DIR}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════════

const peers       = new Map();    // peerId → PeerRecord (relay peer store)
const signals     = new Map();    // peerId → signal[]
const hostedServices = [];        // Services hosted on THIS instance
const sharedSessions = [];        // Shared AI/code sessions
const peerServices = new Map();   // peerId → services[]
const tcpRelays   = new Map();    // peerId → TCP socket

// ═══════════════════════════════════════════════════════════════════════════════
//  PEER RECORD
// ═══════════════════════════════════════════════════════════════════════════════

class PeerRecord {
  constructor(id, info = {}) {
    this.id = id;
    this.publicKey = info.publicKey || id;
    this.address = info.address || "0.0.0.0";
    this.port = info.port || PORT;
    this.hostname = info.hostname || os.hostname();
    this.platform = info.platform || process.platform;
    this.version = info.version || "0.1.0";
    this.mode = info.mode || "p2p-visible";
    this.services = info.services || [];
    this.relayPort = info.relayPort || RELAY_PORT;
    this.firstSeen = Date.now();
    this.lastSeen = Date.now();
  }
  get isStale() { return (Date.now() - this.lastSeen) > PEER_TTL_MS; }
  touch() { this.lastSeen = Date.now(); }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getLocalIPs() {
  const ifaces = os.networkInterfaces(), ips = [];
  for (const n of Object.keys(ifaces))
    for (const i of ifaces[n])
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
  return ips.length ? ips : ["127.0.0.1"];
}

function peerToJSON(p) {
  return {
    id: p.id, publicKey: p.publicKey, address: p.address, port: p.port,
    hostname: p.hostname, platform: p.platform, version: p.version,
    mode: p.mode, services: p.services, relayPort: p.relayPort,
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
    req.on("data", c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json",
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  if (!fs.existsSync(filePath)) {
    // SPA fallback
    const indexPath = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexPath)) return serveFile(res, indexPath);
    return json(res, 404, { error: "Not found" });
  }
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": mime, "Access-Control-Allow-Origin": "*",
    "Cache-Control": ext === ".html" ? "no-cache" : "max-age=86400",
  });
  res.end(data);
}

function httpReq(method, host, port, pathname, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = { hostname: host, port, path: pathname, method, timeout: 5000 };
    if (body) { opts.headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }; }
    const r = http.request(opts, res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } });
    });
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
    if (body) r.write(body);
    r.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RELAY CLIENT — Register with upstream relay
// ═══════════════════════════════════════════════════════════════════════════════

async function registerWithUpstream() {
  if (!UPSTREAM_RELAY) return;
  const [host, portStr] = UPSTREAM_RELAY.split(":");
  const port = parseInt(portStr, 10) || RELAY_PORT;
  try {
    const res = await httpReq("POST", host, port, "/register", {
      id: PEER_ID, hostname: os.hostname(), platform: process.platform,
      version: "0.1.0", address: LOCAL_IPS[0] || "127.0.0.1",
      port: PORT, relayPort: RELAY_PORT,
      mode: "p2p-visible", services: hostedServices.map(s => s.name),
    });
    relayConnected = res?.status === "ok";
    relayError = relayConnected ? null : "registration failed";
    if (relayConnected) console.log(`  [upstream] Registered with ${UPSTREAM_RELAY}`);
  } catch (e) {
    relayConnected = false;
    relayError = e.message;
    console.log(`  [upstream] Cannot reach ${UPSTREAM_RELAY}`);
  }
}

async function heartbeatUpstream() {
  if (!UPSTREAM_RELAY || !relayConnected) return;
  const [host, portStr] = UPSTREAM_RELAY.split(":");
  try { await httpReq("POST", host, parseInt(portStr, 10) || RELAY_PORT, "/heartbeat", { peerId: PEER_ID }); }
  catch { relayConnected = false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIGNAL STORE
// ═══════════════════════════════════════════════════════════════════════════════

function storeSignal(targetId, signal) {
  if (!signals.has(targetId)) signals.set(targetId, []);
  const list = signals.get(targetId);
  list.push({ ...signal, ts: Date.now() });
  if (list.length > 100) list.splice(0, list.length - 100);
}

function popSignals(targetId) {
  const list = signals.get(targetId) || [];
  signals.delete(targetId);
  return list;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COLLABORATION APIS
// ═══════════════════════════════════════════════════════════════════════════════

// Add a hosted service (called internally or via API)
function addHostedService(name, type, port, url) {
  const existing = hostedServices.findIndex(s => s.name === name);
  const svc = { name, type, port, url: url || `http://127.0.0.1:${port}`, added: Date.now() };
  if (existing >= 0) hostedServices[existing] = svc;
  else hostedServices.push(svc);
  return svc;
}

// Share a session with connected peers
function shareSession(sessionId, type, title, data) {
  const existing = sharedSessions.findIndex(s => s.id === sessionId);
  const session = { id: sessionId, type, title, data, peerId: PEER_ID, shared: Date.now() };
  if (existing >= 0) sharedSessions[existing] = session;
  else sharedSessions.push(session);
  // Keep max 50 sessions
  if (sharedSessions.length > 50) sharedSessions.splice(0, sharedSessions.length - 50);
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTTP ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    // ────────────────────────────────────────────────────────────
    //  PUBLIC RELAY API (port RELAY_PORT)
    // ────────────────────────────────────────────────────────────

    // PING
    if (pathname === "/ping" && method === "GET") {
      return json(res, 200, {
        status: "ok", server: "dweb",
        id: SERVER_ID, hostname: os.hostname(), platform: process.platform,
        version: "0.1.0", uptime: Math.floor((Date.now() - START_TIME) / 1000),
        mode: MODE, peers: peers.size, services: hostedServices.length,
      });
    }

    // STATUS
    if (pathname === "/status" && method === "GET") {
      const modeCounts = {};
      for (const p of peers.values()) modeCounts[p.mode] = (modeCounts[p.mode] || 0) + 1;
      return json(res, 200, {
        status: "ok", serverId: SERVER_ID, peerId: PEER_ID,
        hostname: os.hostname(), version: "0.1.0",
        mode: MODE, uptime: Math.floor((Date.now() - START_TIME) / 1000),
        peersOnline: peers.size, hostedServices: hostedServices.length,
        sharedSessions: sharedSessions.length,
        upstreamRelay: UPSTREAM_RELAY, relayConnected,
        localIPs: LOCAL_IPS, port: PORT, relayPort: RELAY_PORT, tcpPort: TCP_RELAY_PORT,
        modes: modeCounts, platform: process.platform,
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
        },
      });
    }

    // REGISTER
    if (pathname === "/register" && method === "POST") {
      const body = await parseBody(req);
      const id = body.id || crypto.randomUUID();
      const existing = peers.get(id);
      if (existing) {
        existing.touch();
        Object.assign(existing, body, { lastSeen: Date.now() });
        return json(res, 200, { status: "ok", action: "updated", peerId: id, peersOnline: peers.size });
      }
      const peer = new PeerRecord(id, body);
      peers.set(id, peer);
      console.log(`  [p2p] ${id.slice(0, 16)}… registered  (${peers.size} total)`);
      return json(res, 201, { status: "ok", action: "registered", peerId: id, peersOnline: peers.size });
    }

    // HEARTBEAT
    if (pathname === "/heartbeat" && method === "POST") {
      const body = await parseBody(req);
      const peer = peers.get(body.peerId);
      if (!peer) return json(res, 404, { error: "Unknown peer" });
      peer.touch();
      return json(res, 200, { status: "ok", peersOnline: peers.size });
    }

    // DISCOVER
    if (pathname === "/discover" && method === "GET") {
      const modeFilter = url.searchParams.get("mode");
      const list = [];
      for (const p of peers.values()) {
        if (modeFilter && p.mode !== modeFilter) continue;
        list.push(peerToJSON(p));
      }
      return json(res, 200, { status: "ok", count: list.length, peers: list });
    }

    // PEER INFO / DELETE
    const peerMatch = pathname.match(/^\/peer\/(.+)$/);
    if (peerMatch && method === "GET") {
      const peer = peers.get(peerMatch[1]);
      if (!peer) return json(res, 404, { error: "Peer not found" });
      return json(res, 200, { status: "ok", peer: peerToJSON(peer) });
    }
    if (peerMatch && method === "DELETE") {
      peers.delete(peerMatch[1]);
      signals.delete(peerMatch[1]);
      return json(res, 200, { status: "ok", message: "Peer removed" });
    }

    // SIGNAL (WebRTC signaling exchange)
    if (pathname === "/signal") {
      if (method === "POST") {
        const body = await parseBody(req);
        if (!body.targetPeerId) return json(res, 400, { error: "Missing targetPeerId" });
        storeSignal(body.targetPeerId, {
          fromPeerId: body.fromPeerId || "anonymous", type: body.type || "unknown",
          sdp: body.sdp || null, candidate: body.candidate || null,
        });
        if (!peers.has(body.targetPeerId)) {
          console.log(`  [signal] ${(body.fromPeerId||"?").slice(0,12)} → ${body.targetPeerId.slice(0,12)} (queued, peer offline)`);
        }
        return json(res, 200, { status: "ok", queued: true });
      }
      if (method === "GET") {
        const peerId = url.searchParams.get("peerId");
        if (!peerId) return json(res, 400, { error: "Missing peerId" });
        return json(res, 200, { status: "ok", count: signals.get(peerId)?.length || 0, signals: popSignals(peerId) });
      }
    }

    // ────────────────────────────────────────────────────────────
    //  COLLABORATION API (port PORT)
    // ────────────────────────────────────────────────────────────

    // DWEB STATUS
    if (pathname === "/dweb-status" && method === "GET") {
      return json(res, 200, {
        status: "ok", peerId: PEER_ID, hostname: os.hostname(),
        platform: process.platform, localIPs: LOCAL_IPS,
        port: PORT, relayPort: RELAY_PORT, mode: MODE,
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        relayConnected, upstreamRelay: UPSTREAM_RELAY,
        relayError, peersOnline: peers.size,
        hostedServices: hostedServices.length,
        sharedSessions: sharedSessions.length,
        services: ["frontend", "p2p-relay", "hosting", "collab"],
      });
    }

    // HOSTED SERVICES
    if (pathname === "/collab/services" && method === "GET") {
      return json(res, 200, { status: "ok", count: hostedServices.length, services: hostedServices });
    }

    if (pathname === "/collab/services" && method === "POST") {
      const body = await parseBody(req);
      const svc = addHostedService(body.name, body.type, body.port, body.url);
      return json(res, 201, { status: "ok", service: svc });
    }

    // SHARED SESSIONS (AI agent, code, etc.)
    if (pathname === "/collab/sessions" && method === "GET") {
      return json(res, 200, { status: "ok", count: sharedSessions.length, sessions: sharedSessions });
    }

    if (pathname === "/collab/sessions" && method === "POST") {
      const body = await parseBody(req);
      const session = shareSession(body.id || crypto.randomUUID(), body.type, body.title, body.data);
      return json(res, 201, { status: "ok", session });
    }

    // PEER SERVICES (services hosted by connected peers)
    if (pathname === "/collab/peer-services" && method === "GET") {
      const all = [];
      for (const [peerId, svcs] of peerServices) {
        for (const svc of svcs) all.push({ ...svc, peerId });
      }
      return json(res, 200, { status: "ok", count: all.length, services: all });
    }

    // ────────────────────────────────────────────────────────────
    //  WELCOME PAGE
    // ────────────────────────────────────────────────────────────

    if (pathname === "/welcome" && method === "GET") {
      const welcomePath = path.join(__dirname, "welcome", "welcome.html");
      return serveFile(res, welcomePath);
    }
    if (pathname === "/welcome/source" && method === "GET") {
      const welcomePath = path.join(__dirname, "welcome", "welcome.html");
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(fs.readFileSync(welcomePath));
    }

    // ────────────────────────────────────────────────────────────
    //  FILE SHARE UI
    // ────────────────────────────────────────────────────────────

    if (pathname === "/fileshare" && method === "GET") {
      const fsPath = path.join(__dirname, "welcome", "fileshare.html");
      return serveFile(res, fsPath);
    }

    // File Share API — list files
    if (pathname === "/fileshare/api/list" && method === "GET") {
      try {
        const files = fs.readdirSync(SHARE_DIR).map(name => {
          const stat = fs.statSync(path.join(SHARE_DIR, name));
          return { name, size: stat.size, added: stat.mtimeMs, isDir: stat.isDirectory() };
        });
        return json(res, 200, { status: "ok", count: files.length, files });
      } catch (e) {
        return json(res, 500, { error: e.message });
      }
    }

    // File Share API — upload
    if (pathname === "/fileshare/api/upload" && method === "POST") {
      const ct = req.headers["content-type"] || "";
      if (!ct.includes("multipart/form-data")) {
        return json(res, 400, { error: "Expected multipart/form-data" });
      }
      let rawBody = [];
      let totalBytes = 0;
      const boundary = "--" + ct.split("boundary=")[1];
      req.on("data", c => { rawBody.push(c); totalBytes += c.length; if (totalBytes > 100e6) req.destroy(); });
      req.on("end", () => {
        try {
          const full = Buffer.concat(rawBody);
          const parts = full.toString("latin1").split(boundary);
          let saved = 0;
          for (const part of parts) {
            if (part.includes("filename=\"")) {
              const fnMatch = part.match(/filename="(.+?)"/);
              if (!fnMatch) continue;
              const fileName = fnMatch[1];
              const headerEnd = part.indexOf("\r\n\r\n") + 4;
              const content = part.slice(headerEnd, part.lastIndexOf("\r\n--"));
              const buf = Buffer.from(content, "latin1");
              fs.writeFileSync(path.join(SHARE_DIR, fileName), buf);
              saved++;
            }
          }
          json(res, 200, { status: "ok", saved });
        } catch (e) {
          json(res, 500, { error: e.message });
        }
      });
      return;
    }

    // File Share API — download
    const downloadMatch = pathname.match(/^\/fileshare\/api\/download\/(.+)$/);
    if (downloadMatch && method === "GET") {
      const fileName = decodeURIComponent(downloadMatch[1]);
      const filePath = path.join(SHARE_DIR, fileName);
      if (!filePath.startsWith(SHARE_DIR)) return json(res, 403, { error: "Forbidden" });
      if (!fs.existsSync(filePath)) return json(res, 404, { error: "File not found" });
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": stat.size,
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // File Share API — delete
    if (pathname === "/fileshare/api/delete" && method === "POST") {
      parseBody(req).then(body => {
        const filePath = path.join(SHARE_DIR, body.name);
        if (!filePath.startsWith(SHARE_DIR)) return json(res, 403, { error: "Forbidden" });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        json(res, 200, { status: "ok" });
      }).catch(e => json(res, 500, { error: e.message }));
      return;
    }

    // ────────────────────────────────────────────────────────────
    //  BUILD & DEPLOY API — register a user-built project as a service
    // ────────────────────────────────────────────────────────────

    if (pathname === "/api/publish" && method === "POST") {
      const body = await parseBody(req);
      const { name, type, files } = body;
      if (!name || !files || !Array.isArray(files)) {
        return json(res, 400, { error: "Missing name or files array" });
      }
      // Create project directory
      const projectDir = path.join(__dirname, "projects", name.replace(/[^a-zA-Z0-9-_]/g, "_"));
      if (fs.existsSync(projectDir)) {
        // Clean it
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      fs.mkdirSync(projectDir, { recursive: true });
      for (const f of files) {
        const filePath = path.join(projectDir, f.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, f.content, "utf-8");
      }
      // Determine port (increment from base)
      const basePort = 49200;
      const existingProjects = fs.readdirSync(path.join(__dirname, "projects")).length;
      const appPort = basePort + existingProjects;
      // Register as hosted service
      addHostedService(name, type || "Web App", PORT, `http://localhost:${PORT}/project/${name.replace(/[^a-zA-Z0-9-_]/g, "_")}`);
      // Create a simple symlink or serve from /project/:name route
      const routeName = name.replace(/[^a-zA-Z0-9-_]/g, "_");
      console.log(`  [deploy] Published "${name}" → /project/${routeName}`);
      return json(res, 201, {
        status: "ok", project: { name, route: `/project/${routeName}`, path: projectDir, port: appPort },
        url: `http://localhost:${PORT}/project/${routeName}`,
      });
    }

    // Serve published projects
    const projectMatch = pathname.match(/^\/project\/([a-zA-Z0-9_-]+)(\/.*)?$/);
    if (projectMatch && method === "GET") {
      const projectName = projectMatch[1];
      let subPath = projectMatch[2] || "/index.html";
      const projectDir = path.join(__dirname, "projects", projectName);
      if (!fs.existsSync(projectDir)) {
        return json(res, 404, { error: "Project not found" });
      }
      let filePath = path.join(projectDir, subPath);
      if (!filePath.startsWith(projectDir)) return json(res, 403, { error: "Forbidden" });
      // If path is a directory, look for index.html
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        subPath = path.join(subPath.replace(/\/$/, ""), "index.html");
        filePath = path.join(projectDir, subPath);
      }
      if (!fs.existsSync(filePath)) {
        // SPA fallback — serve index.html
        const indexPath = path.join(projectDir, "index.html");
        if (fs.existsSync(indexPath)) return serveFile(res, indexPath);
        return json(res, 404, { error: "File not found" });
      }
      return serveFile(res, filePath);
    }

    // List published projects
    if (pathname === "/api/projects" && method === "GET") {
      const projectsDir = path.join(__dirname, "projects");
      if (!fs.existsSync(projectsDir)) return json(res, 200, { status: "ok", projects: [] });
      const projects = fs.readdirSync(projectsDir).map(name => {
        const stats = fs.statSync(path.join(projectsDir, name));
        return { name, added: stats.mtimeMs, route: `/project/${name}`, url: `http://localhost:${PORT}/project/${name}` };
      });
      return json(res, 200, { status: "ok", count: projects.length, projects });
    }

    // ────────────────────────────────────────────────────────────
    //  OPENCODE STATUS
    // ────────────────────────────────────────────────────────────

    // Repo context
    if (pathname === "/api/repo/status" && method === "GET") {
      let branch = "unknown", commit = "", files = 0, repoRoot = "";
      try {
        repoRoot = execSync("git rev-parse --show-toplevel 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
        branch = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
        commit = execSync("git rev-parse --short HEAD 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
        files = parseInt(execSync("git ls-files 2>/dev/null | wc -l", { timeout: 3000, encoding: "utf-8" }).trim(), 10) || 0;
      } catch {}
      return json(res, 200, { status: "ok", repo: path.basename(repoRoot) || "dweb", branch, commit, files, path: repoRoot });
    }

    if (pathname === "/api/opencode/status" && method === "GET") {
      let version = null;
      let available = false;
      try {
        const v = execSync("opencode --version 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
        version = v;
        available = true;
      } catch {}
      return json(res, 200, { status: "ok", available, version, instance: INSTANCE_NAME });
    }

    // Run opencode command (prompt mode — properly shell-escaped)
    if (pathname === "/api/opencode/run" && method === "POST") {
      const body = await parseBody(req);
      const { command } = body;
      if (!command) return json(res, 400, { error: "Missing command" });
      // Expand common shorthand commands
      let cmd = command.trim();
      const shorthands = {
        "build": "run npm run build in the dweb repo",
        "test": "run npm test in the dweb repo and fix any failures",
        "dev": "explain the current development setup and how to start developing",
        "status": "show the current state of the dweb repo, its architecture, and what can be built next",
        "help": "list available commands and how to use this opencode agent",
      };
      const expanded = shorthands[cmd.toLowerCase()] || cmd;
      try {
        const output = execSync(`opencode run -m opencode/deepseek-v4-flash-free ${JSON.stringify(expanded)} 2>&1`, {
          timeout: 300000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        });
        return json(res, 200, { status: "ok", output, command: expanded });
      } catch (e) {
        return json(res, 200, { status: "error", output: (e.stderr || e.message || "").toString(), command: expanded });
      }
    }

    // ────────────────────────────────────────────────────────────
    //  STATIC FILES (frontend)
    // ────────────────────────────────────────────────────────────

    let filePath = path.join(DIST_DIR, pathname === "/" ? "index.html" : pathname);
    if (!filePath.startsWith(DIST_DIR)) return json(res, 403, { error: "Forbidden" });
    serveFile(res, filePath);

  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TCP RELAY SERVER (for proxying traffic between peers)
// ═══════════════════════════════════════════════════════════════════════════════

function startTCPRelay() {
  const server = net.createServer(socket => {
    let peerId = null, buffer = "";
    socket.on("data", data => {
      buffer += data.toString();
      if (!peerId) {
        const nl = buffer.indexOf("\n");
        if (nl === -1) return;
        try {
          const msg = JSON.parse(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          if (msg.type === "register" && msg.peerId) {
            peerId = msg.peerId;
            tcpRelays.set(peerId, socket);
            socket.write(JSON.stringify({ type: "registered", peerId }) + "\n");
            if (buffer.length > 0) { forwardRelayData(peerId, buffer); buffer = ""; }
          }
        } catch {}
        return;
      }
      try {
        const msg = JSON.parse(buffer);
        if (msg.type === "relay" && msg.targetPeerId) {
          const target = tcpRelays.get(msg.targetPeerId);
          if (target) target.write(JSON.stringify({ type: "relay", fromPeerId: peerId, data: msg.data }) + "\n");
          storeSignal(msg.targetPeerId, { fromPeerId: peerId, type: "relay-data", data: msg.data });
        }
      } catch {}
      buffer = "";
    });
    socket.on("close", () => { if (peerId) tcpRelays.delete(peerId); });
    socket.on("error", () => {});
  });
  server.on("error", err => {
    if (err.code === "EADDRINUSE") console.log(`  [tcp] Port ${TCP_RELAY_PORT} in use`);
    else console.log(`  [tcp] Error: ${err.message}`);
  });
  server.listen(TCP_RELAY_PORT, "0.0.0.0", () => {
    console.log(`  TCP Relay : tcp://0.0.0.0:${TCP_RELAY_PORT}`);
  });
  return server;
}

function forwardRelayData(fromPeerId, data) {
  // Forward buffered data to target if identifiable
  try {
    const msg = JSON.parse(data);
    if (msg.targetPeerId) {
      const target = tcpRelays.get(msg.targetPeerId);
      if (target) target.write(JSON.stringify({ type: "relay", fromPeerId, data: msg.data }) + "\n");
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

function cleanupStalePeers() {
  let removed = 0;
  for (const [id, peer] of peers) {
    if (peer.isStale) { peers.delete(id); signals.delete(id); removed++; }
  }
  if (removed > 0) console.log(`  [cleanup] Removed ${removed} stale peers`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BANNER
// ═══════════════════════════════════════════════════════════════════════════════

function printBanner() {
  const isRelay = MODE === "relay" || MODE === "auto";
  const isPeer = MODE === "peer" || MODE === "auto";

  console.log();
  console.log(`  ╔══════════════════════════════════════════════════╗`);
  console.log(`  ║         dweb — P2P Dev + Hosting Platform       ║`);
  console.log(`  ║         ───────────────────────────────          ║`);
  console.log(`  ║  Instance : ${INSTANCE_NAME.padEnd(37)}║`);
  console.log(`  ║  Peer ID  : ${PEER_ID.padEnd(37)}║`);
  console.log(`  ║  Mode     : ${MODE.padEnd(37)}║`);
  console.log(`  ╚══════════════════════════════════════════════════╝`);
  console.log(`  ╔══════════════════════════════════════════════════╗`);
  if (isRelay) {
    console.log(`  ║  P2P Relay    : http://0.0.0.0:${String(RELAY_PORT).padEnd(5)}              ║`);
  }
  console.log(`  ║  Web IDE      : http://0.0.0.0:${String(PORT).padEnd(5)}              ║`);
  console.log(`  ║  TCP Proxy    : tcp://0.0.0.0:${String(TCP_RELAY_PORT).padEnd(5)}              ║`);
  console.log(`  ║                                                    ║`);
  console.log(`  ║  Network access:                                    ║`);
  for (const ip of LOCAL_IPS) {
    const label = `http://${ip}:${PORT}/`;
    console.log(`  ║    ${label.padEnd(48)}║`);
  }
  console.log(`  ║                                                    ║`);
  console.log(`  ║  Core APIs:                                        ║`);
  console.log(`  ║    /ping          — Health check                   ║`);
  console.log(`  ║    /status        — Full instance status           ║`);
  console.log(`  ║    /register      — Register a peer (P2P)          ║`);
  console.log(`  ║    /discover      — Discover online peers          ║`);
  console.log(`  ║    /signal        — WebRTC signaling               ║`);
  console.log(`  ║    /collab/services  — Hosted services             ║`);
  console.log(`  ║    /collab/sessions  — Shared dev sessions         ║`);
  console.log(`  ║    /dweb-status   — Instance status                ║`);
  console.log(`  ║    /              — dweb Web IDE frontend          ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝`);
  console.log(`  Upstream relay: ${UPSTREAM_RELAY || "(none — this is a relay node)"}`);
  console.log(`  Press Ctrl+C to stop.\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════

const isRelayMode = MODE === "relay" || MODE === "auto";
const isPeerMode = MODE === "peer" || MODE === "auto";

// Create HTTP server that handles everything
const server = http.createServer(handleRequest);

// Start listening on both ports if in relay mode
function startServer() {
  if (isRelayMode) {
    // Listen on RELAY_PORT for P2P traffic, on PORT for frontend + API
    // Use a single server that handles all ports via different listeners
    server.listen(RELAY_PORT, "0.0.0.0", () => {
      console.log(`  P2P Relay : http://0.0.0.0:${RELAY_PORT}`);
    });

    // Start a second server for the frontend port
    const webServer = http.createServer(handleRequest);
    webServer.listen(PORT, "0.0.0.0", () => {});
    
    return webServer;
  } else {
    server.listen(PORT, "0.0.0.0", () => {});
    return server;
  }
}

const webServer = startServer();
startTCPRelay();

// Auto-register default services
addHostedService("My Static Website", "Static Site", PORT, `http://localhost:${PORT}/welcome`);
addHostedService("File Share", "File Browser", PORT, `http://localhost:${PORT}/fileshare`);
console.log(`  [services] Auto-registered: "My Static Website" → /welcome`);
console.log(`  [services] Auto-registered: "File Share" → /fileshare`);

printBanner();

// Register with upstream relay
if (UPSTREAM_RELAY && isPeerMode) {
  registerWithUpstream();
  setInterval(heartbeatUpstream, 30000);
}

// Periodic peer cleanup
setInterval(cleanupStalePeers, 15000);

// Status line
setInterval(() => {
  const line = `  [${new Date().toLocaleTimeString()}] Peers: ${peers.size}  |  Services: ${hostedServices.length}  |  Sessions: ${sharedSessions.length}`;
  process.stdout.write(`\x1b[2K\x1b[1A\x1b[2K${line}\n`);
}, 3000);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n  Shutting down dweb...");
  console.log(`  Final state: ${peers.size} peers, ${hostedServices.length} services`);
  tcpRelays.forEach(s => s.end());
  server.close();
  webServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => process.exit(0));

// Export key info for programmatic use
module.exports = { PEER_ID, SERVER_ID, PORT, RELAY_PORT, peers, hostedServices, sharedSessions };
