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
const MOVIES = require("../server/movies.cjs");

// ── Config ─────────────────────────────────────────────────────
const PORT            = parseInt(process.env.PORT, 10) || 49737;
const RELAY_ADDR      = process.env.RELAY_ADDR || "localhost:49736";
const DIST_DIR        = (() => {
  const local = path.resolve(__dirname, "dist");
  const parent = path.resolve(__dirname, "..", "dist");
  return (fs.existsSync(local) && fs.statSync(local).isDirectory()) ? local : parent;
})();
function generateMoviePeerId() {
  const m1 = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  let m2 = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  while (m2 === m1 && MOVIES.length > 1) m2 = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  return `${m1}-${m2}`;
}
const PEER_ID         = `dweb-${generateMoviePeerId()}`;
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
const SERVICES_FILE    = path.join(os.homedir(), ".dweb", "services.json");

function saveServices() {
  try {
    const dir = path.dirname(SERVICES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = [];
    for (const [name, svc] of runningServices) {
      data.push({ name, port: svc.port, type: svc.type, dir: svc.dir });
    }
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("  [services] Failed to save services:", e.message);
  }
}

// ── Domain Registry ────────────────────────────────────────────
// Domains map: name -> DomainRecord
// Persisted to ~/.dweb/domains.json
const DOMAINS_FILE = path.join(os.homedir(), ".dweb", "domains.json");
const domainRegistry = new Map(); // name -> DomainRecord
const domainCache = new Map();    // name -> { result, expiresAt }  (in-memory TTL cache)

const DOMAIN_TIERS = {
  free:     { label: "Free",     price: 0,    ttlDays: 90,  permanent: false, customDomain: false, ssl: false, description: "Basic .dweb domain with 90-day renewal" },
  premium:  { label: "Premium",  price: 499,  ttlDays: 0,   permanent: true,  customDomain: false, ssl: false, description: "Permanent .dweb domain, never expires" },
  business: { label: "Business", price: 1999, ttlDays: 0,   permanent: true,  customDomain: true,  ssl: true,  description: "Custom domain (bring your own) + SSL + analytics" },
};

function loadDomains() {
  try {
    if (!fs.existsSync(DOMAINS_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(DOMAINS_FILE, "utf8"));
    if (!Array.isArray(data)) return 0;
    domainRegistry.clear();
    for (const d of data) {
      domainRegistry.set(d.name, d);
      // Pre-warm cache for active domains
      if (d.active) {
        domainCache.set(d.name, { result: d, expiresAt: Date.now() + 300000 });
      }
    }
    return domainRegistry.size;
  } catch (e) {
    console.error("  [domains] Failed to load domains:", e.message);
    return 0;
  }
}

function saveDomains() {
  try {
    const dir = path.dirname(DOMAINS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = Array.from(domainRegistry.values());
    fs.writeFileSync(DOMAINS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("  [domains] Failed to save domains:", e.message);
  }
}

function generateDomainKey() {
  return "dweb_" + crypto.randomBytes(16).toString("hex");
}

function getDomainTTL(tier) {
  const t = DOMAIN_TIERS[tier] || DOMAIN_TIERS.free;
  if (t.permanent) return null; // never expires
  return t.ttlDays * 86400000;
}

function resolveDomainFromRegistry(name) {
  // Check in-memory cache first (5 min TTL)
  const cached = domainCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  // Lookup from registry
  const record = domainRegistry.get(name);
  if (!record) return null;

  // Check expiry
  if (!record.tierInfo.permanent && record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
    record.active = false;
    saveDomains();
    return null;
  }

  // Update cache
  domainCache.set(name, { result: record, expiresAt: Date.now() + 300000 });
  return record;
}

function invalidateDomainCache(name) {
  domainCache.delete(name);
}

// Ask each currently-known peer (learned via the relay's /discover, refreshed
// every 15s into `relayPeers`) whether *it* has this domain registered and
// bound. This is what actually lets Peer B resolve a domain that Peer A
// registered — the local domainRegistry is never itself replicated, so
// without this fan-out, cross-peer resolution has no path to succeed.
async function resolveDomainAcrossPeers(name) {
  const candidates = relayPeers.filter(p => p.id !== PEER_ID && p.address && p.port);
  for (const peer of candidates) {
    try {
      const result = await httpGet(peer.address, peer.port, `/api/domain/resolve?name=${encodeURIComponent(name)}`);
      if (result && result.status === "ok" && result.record) {
        return {
          record: result.record,
          address: result.address || peer.address,
          port: result.port || peer.port,
          url: result.url || (result.address && result.port ? `http://${result.address}:${result.port}/` : null),
          peerId: peer.id,
        };
      }
    } catch {
      // peer unreachable or timed out — try the next one
    }
  }
  return null;
}

// ── Domain API Route Handler ───────────────────────────────────
function handleDomainAPI(req, res, url, body) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

  // ── POST /api/domain/register ──
  if (url.pathname === "/api/domain/register" && req.method === "POST") {
    const { name, tier } = body || {};
    if (!name || !/^[a-z0-9-]{3,63}$/.test(name)) {
      return jsonResponse(res, 400, { error: "Domain name must be 3-63 chars: lowercase, numbers, hyphens" });
    }
    if (tier && !DOMAIN_TIERS[tier]) {
      return jsonResponse(res, 400, { error: "Invalid tier. Choose: free, premium, or business" });
    }
    const finalTier = tier || "free";
    const tierInfo = DOMAIN_TIERS[finalTier];

    if (domainRegistry.has(name)) {
      return jsonResponse(res, 409, { error: "Domain already registered" });
    }

    const now = Date.now();
    const record = {
      name,
      owner_key: generateDomainKey(),
      address: null,   // set when bound to a service
      tier: finalTier,
      tierInfo,
      service_name: null,
      port: null,
      custom_domain: null,
      registered_at: new Date(now).toISOString(),
      expires_at: tierInfo.permanent ? null : new Date(now + tierInfo.ttlDays * 86400000).toISOString(),
      auto_renew: finalTier !== "free",
      active: true,
      paid_until: tierInfo.price > 0 ? new Date(now + 365 * 86400000).toISOString() : null,
    };

    domainRegistry.set(name, record);
    saveDomains();
    invalidateDomainCache(name);
    console.log(`  [domains] Registered "${name}" (${finalTier})`);
    return jsonResponse(res, 200, record);
  }

  // ── POST /api/domain/bind ──
  if (url.pathname === "/api/domain/bind" && req.method === "POST") {
    const { name, service_name, port, custom_domain } = body || {};
    if (!name || !domainRegistry.has(name)) {
      return jsonResponse(res, 404, { error: "Domain not found" });
    }
    if (!port) {
      return jsonResponse(res, 400, { error: "Port is required" });
    }

    const record = domainRegistry.get(name);

    // Custom domain only for Business tier
    if (custom_domain && record.tier !== "business") {
      return jsonResponse(res, 403, { error: "Custom domains require Business tier" });
    }

    // Check if port is in use by another domain
    for (const [d, r] of domainRegistry) {
      if (r.port === port && r.name !== name && r.active) {
        return jsonResponse(res, 409, { error: `Port ${port} is already bound to domain "${d}"` });
      }
    }

    record.service_name = service_name || null;
    record.port = port;
    record.address = port ? `${getLocalIPs()[0] || "127.0.0.1"}:${port}` : null;
    record.custom_domain = custom_domain || null;
    record.active = true;

    domainRegistry.set(name, record);
    saveDomains();
    invalidateDomainCache(name);
    console.log(`  [domains] Bound "${name}" → ${service_name || "port " + port}`);
    return jsonResponse(res, 200, record);
  }

  // ── POST /api/domain/unbind ──
  if (url.pathname === "/api/domain/unbind" && req.method === "POST") {
    const { name } = body || {};
    if (!name || !domainRegistry.has(name)) {
      return jsonResponse(res, 404, { error: "Domain not found" });
    }
    const record = domainRegistry.get(name);
    record.service_name = null;
    record.port = null;
    record.address = null;
    domainRegistry.set(name, record);
    saveDomains();
    invalidateDomainCache(name);
    return jsonResponse(res, 200, record);
  }

  // ── GET /api/domain/resolve?name=xxx ──
  // Response contract: { status: "ok"|"error", record, address, port, url, source }
  // `source` is "local" if resolved from this instance's own registry, or "peer"
  // if a connected peer (found via relayPeers, itself learned from the relay's
  // /discover) answered on our behalf.
  if (url.pathname === "/api/domain/resolve" && req.method === "GET") {
    const name = url.searchParams.get("name");
    if (!name) return jsonResponse(res, 400, { status: "error", error: "name query parameter required" });

    const localRecord = resolveDomainFromRegistry(name);
    if (localRecord) {
      const hostPart = (localRecord.address || "").split(":")[0] || null;
      const resolvedUrl = hostPart && localRecord.port ? `http://${hostPart}:${localRecord.port}/` : null;
      return jsonResponse(res, 200, {
        status: "ok",
        record: localRecord,
        address: hostPart,
        port: localRecord.port || null,
        url: resolvedUrl,
        source: "local",
      });
    }

    // Not registered on this instance — ask connected peers before giving up.
    resolveDomainAcrossPeers(name)
      .then((remote) => {
        if (remote) {
          return jsonResponse(res, 200, {
            status: "ok",
            record: remote.record,
            address: remote.address,
            port: remote.port,
            url: remote.url,
            source: "peer",
            peerId: remote.peerId,
          });
        }
        return jsonResponse(res, 404, { status: "error", error: "Domain not found or expired" });
      })
      .catch(() => {
        jsonResponse(res, 404, { status: "error", error: "Domain not found or expired" });
      });
    return; // handled asynchronously
  }

  // ── GET /api/domain/list ──
  if (url.pathname === "/api/domain/list" && req.method === "GET") {
    const list = Array.from(domainRegistry.values());
    return jsonResponse(res, 200, list);
  }

  // ── POST /api/domain/renew ──
  if (url.pathname === "/api/domain/renew" && req.method === "POST") {
    const { name } = body || {};
    if (!name || !domainRegistry.has(name)) {
      return jsonResponse(res, 404, { error: "Domain not found" });
    }
    const record = domainRegistry.get(name);
    const now = Date.now();
    const tierInfo = DOMAIN_TIERS[record.tier] || DOMAIN_TIERS.free;

    if (tierInfo.permanent) {
      return jsonResponse(res, 200, { ...record, message: "Permanent domain — no renewal needed" });
    }

    record.expires_at = new Date(now + tierInfo.ttlDays * 86400000).toISOString();
    record.active = true;
    domainRegistry.set(name, record);
    saveDomains();
    invalidateDomainCache(name);
    return jsonResponse(res, 200, record);
  }

  // ── POST /api/domain/upgrade ──
  if (url.pathname === "/api/domain/upgrade" && req.method === "POST") {
    const { name, new_tier } = body || {};
    if (!name || !domainRegistry.has(name)) {
      return jsonResponse(res, 404, { error: "Domain not found" });
    }
    if (!new_tier || !DOMAIN_TIERS[new_tier]) {
      return jsonResponse(res, 400, { error: "Invalid tier" });
    }
    const record = domainRegistry.get(name);
    const oldTier = record.tier;
    const tierInfo = DOMAIN_TIERS[new_tier];

    // If upgrading to a paid tier, simulate payment
    if (tierInfo.price > 0) {
      const { payment_method } = body || {};
      if (!payment_method) {
        return jsonResponse(res, 402, { error: "Payment required", tier: new_tier, amount: tierInfo.price, currency: "USD" });
      }
    }

    record.tier = new_tier;
    record.tierInfo = tierInfo;
    if (tierInfo.permanent) {
      record.expires_at = null;
    }
    if (tierInfo.price > 0) {
      record.paid_until = new Date(Date.now() + 365 * 86400000).toISOString();
    }
    record.auto_renew = new_tier !== "free";
    record.active = true;
    domainRegistry.set(name, record);
    saveDomains();
    invalidateDomainCache(name);
    console.log(`  [domains] Upgraded "${name}" from ${oldTier} → ${new_tier}`);
    return jsonResponse(res, 200, record);
  }

  // ── GET /api/domain/pricing ──
  if (url.pathname === "/api/domain/pricing" && req.method === "GET") {
    return jsonResponse(res, 200, { tiers: DOMAIN_TIERS });
  }

  // ── DELETE /api/domain/remove ──
  if (url.pathname === "/api/domain/remove" && req.method === "DELETE") {
    const { name } = body || {};
    if (!name || !domainRegistry.has(name)) {
      return jsonResponse(res, 404, { error: "Domain not found" });
    }
    domainRegistry.delete(name);
    saveDomains();
    invalidateDomainCache(name);
    return jsonResponse(res, 200, { ok: true, message: `Domain "${name}" removed` });
  }

  // ── GET /api/domain/services (list available services for binding) ──
  if (url.pathname === "/api/domain/services" && req.method === "GET") {
    const services = [];
    for (const [name, svc] of runningServices) {
      services.push({ name, port: svc.port, type: svc.type });
    }
    return jsonResponse(res, 200, services);
  }

  // ── GET /api/domain/cache/status ──
  if (url.pathname === "/api/domain/cache/status" && req.method === "GET") {
    return jsonResponse(res, 200, {
      registrySize: domainRegistry.size,
      cacheSize: domainCache.size,
      cacheEntries: Array.from(domainCache.keys()),
      tiers: DOMAIN_TIERS,
    });
  }

  return null; // not a domain route
}

function restoreServices() {
  try {
    if (!fs.existsSync(SERVICES_FILE)) return 0;
    var data = JSON.parse(fs.readFileSync(SERVICES_FILE, "utf8"));
    if (!Array.isArray(data)) return 0;
    var restored = 0;
    var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    var staticMime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".webp":"image/webp",".ico":"image/x-icon",".txt":"text/plain; charset=utf-8",".md":"text/markdown; charset=utf-8",".pdf":"application/pdf"};
    var dirTypes = ["Static Site","Single Page App","Documentation Site","Dashboard","File Browser","Image Gallery","Media Stream","Podcast Host","Log Viewer","Git Web UI"];

    function restoreDirHandler(entry, baseDir) {
      return function(svcReq, svcRes) {
        if (svcReq.method === "OPTIONS") { svcRes.writeHead(204, cors); return svcRes.end(); }
        var _u = new URL(svcReq.url, "http://localhost");
        var resolved = path.resolve(baseDir, "." + _u.pathname);
        if (!resolved.startsWith(path.resolve(baseDir))) { svcRes.writeHead(403, cors); return svcRes.end("Forbidden"); }
        // ── DELETE (File Browser only) ──
        if ((svcReq.method === "DELETE" || (svcReq.method === "POST" && _u.searchParams.has("delete"))) && entry.type === "File Browser") {
          var delPath = svcReq.method === "DELETE" ? resolved : path.resolve(baseDir, "." + _u.searchParams.get("delete"));
          if (!delPath.startsWith(path.resolve(baseDir))) { svcRes.writeHead(403, { ...cors, "Content-Type": "application/json" }); return svcRes.end(JSON.stringify({ error: "Forbidden" })); }
          try {
            var delStat = fs.statSync(delPath);
            fs.rmSync(delPath, { recursive: true, force: true });
            svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
            svcRes.end(JSON.stringify({ ok: true, deleted: _u.pathname }));
          } catch (e3) { svcRes.writeHead(404, { ...cors, "Content-Type": "application/json" }); svcRes.end(JSON.stringify({ error: "Not found" })); }
          return;
        }
        // ── POST upload (File Browser only) ──
        if (svcReq.method === "POST" && !_u.searchParams.has("delete") && entry.type === "File Browser") {
          var ct = svcReq.headers["content-type"] || "";
          if (ct.includes("multipart/form-data")) {
            var boundary = "--" + ct.split("boundary=")[1];
            var bufs = [];
            svcReq.on("data", function(c) { bufs.push(c); });
            svcReq.on("end", function() {
              var raw = Buffer.concat(bufs);
              var parts = raw.toString("binary").split(boundary).filter(function(p) { return p.indexOf("Content-Disposition") !== -1; });
              var fileName = "upload.bin", fileData = null, uploadDir = resolved;
              for (var pi = 0; pi < parts.length; pi++) {
                var headerEnd = parts[pi].indexOf("\r\n\r\n");
                if (headerEnd === -1) continue;
                var hdrs = parts[pi].substring(0, headerEnd);
                var body = parts[pi].substring(headerEnd + 4);
                if (hdrs.indexOf('name="dir"') !== -1) { var sub = body.trim(); if (sub) uploadDir = path.resolve(baseDir, sub); }
                else if (hdrs.indexOf('name="file"') !== -1 || hdrs.indexOf('name="files"') !== -1) {
                  var m = hdrs.match(/filename="([^"]*)"/);
                  if (m) fileName = m[1];
                  fileData = Buffer.from(body, "binary");
                }
              }
              if (!fileData) { svcRes.writeHead(400, { ...cors, "Content-Type": "application/json" }); return svcRes.end(JSON.stringify({ error: "No file" })); }
              var targetPath = path.join(uploadDir, fileName);
              if (!targetPath.startsWith(path.resolve(baseDir))) { svcRes.writeHead(403); return svcRes.end(JSON.stringify({ error: "Forbidden" })); }
              try {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.writeFileSync(targetPath, fileData);
                svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
                svcRes.end(JSON.stringify({ ok: true, file: fileName }));
              } catch (e4) { svcRes.writeHead(500); svcRes.end(JSON.stringify({ error: e4.message })); }
            });
            return;
          }
          // JSON upload
          var body = "";
          svcReq.on("data", function(c) { body += c; });
          svcReq.on("end", function() {
            try {
              var data = JSON.parse(body);
              // mkdir support: { name: "foldername", dir: "sub/path" }
              if (data.mkdir || (data.name && !data.file && data.content === undefined)) {
                var folderName = data.name || "new-folder";
                var targetFolder = data.dir ? path.resolve(baseDir, data.dir, folderName) : path.join(resolved, folderName);
                if (!targetFolder.startsWith(path.resolve(baseDir))) { svcRes.writeHead(403); return svcRes.end(JSON.stringify({ error: "Forbidden" })); }
                fs.mkdirSync(targetFolder, { recursive: true });
                svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
                return svcRes.end(JSON.stringify({ ok: true, folder: folderName }));
              }
              var fname = data.file || data.name || "untitled.txt";
              var targetFile = data.dir ? path.resolve(baseDir, data.dir, fname) : path.resolve(baseDir, fname);
              if (!targetFile.startsWith(path.resolve(baseDir))) { svcRes.writeHead(403); return svcRes.end(JSON.stringify({ error: "Forbidden" })); }
              fs.writeFileSync(targetFile, data.content || "");
              svcRes.writeHead(200, { ...cors, "Content-Type": "application/json" });
              svcRes.end(JSON.stringify({ ok: true, file: fname }));
            } catch (e5) { svcRes.writeHead(400); svcRes.end(JSON.stringify({ error: "Invalid JSON: " + e5.message })); }
          });
          return;
        }
        try {
          var st = fs.statSync(resolved);
          if (st.isDirectory()) {
            // JSON directory listing (?json)
            if (_u.searchParams && _u.searchParams.has("json")) {
              var fl2 = fs.readdirSync(resolved, { withFileTypes: true });
              var fileList = [];
              for (var fi2 = 0; fi2 < fl2.length; fi2++) {
                var ent = fl2[fi2];
                var info = { name: ent.name + (ent.isDirectory() ? "/" : ""), isDir: ent.isDirectory(), size: 0, mtime: null };
                try { var s2 = fs.statSync(path.join(resolved, ent.name)); info.size = s2.size; info.mtime = s2.mtime.toISOString(); } catch (e) {}
                fileList.push(info);
              }
              svcRes.writeHead(200, { ...cors, "Content-Type": "application/json; charset=utf-8" });
              svcRes.end(JSON.stringify({ path: _u.pathname, files: fileList }));
              return;
            }
            var ip = path.join(resolved, "index.html");
            if (fs.existsSync(ip) && entry.type !== "File Browser") { svcRes.writeHead(302, { ...cors, "Location": _u.pathname.replace(/\/?$/, "/") + "index.html" }); return svcRes.end(); }
            var fl = fs.readdirSync(resolved, { withFileTypes: true });
            var isFB = entry.type === "File Browser";
            var h = isFB ? '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escHtml(entry.name)+' — File Browser</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;min-height:100vh}.header{background:#1a1a2e;border-bottom:1px solid rgba(255,255,255,0.06);padding:12px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.header h1{font-size:16px;font-weight:600;color:#22c55e}.header .info{font-size:11px;color:#6b7280}.toolbar{padding:10px 20px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar button,.toolbar label{padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#e2e8f0;font-size:12px;cursor:pointer;transition:all 0.15s;font-family:system-ui,sans-serif}.toolbar button:hover,.toolbar label:hover{background:rgba(59,130,246,0.15);border-color:rgba(59,130,246,0.3)}.new-folder input{padding:5px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.3);color:#e2e8f0;font-size:12px;width:140px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.06)}td{padding:8px 12px;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.03)}tr:hover td{background:rgba(59,130,246,0.04)}.icon{width:28px;font-size:16px;text-align:center}.name a{color:#e2e8f0;text-decoration:none;font-weight:500}.name a:hover{color:#3b82f6}.size{width:80px;color:#6b7280;font-size:12px;font-family:monospace}.date{width:160px;color:#6b7280;font-size:11px}.actions{width:60px;text-align:right}.dl-btn{background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;opacity:0.4;transition:opacity 0.15s;font-family:system-ui,sans-serif}.dl-btn:hover{opacity:1;background:rgba(239,68,68,0.15)}.empty-state{padding:40px;text-align:center;color:#6b7280;font-size:14px}.upload-progress{font-size:11px;color:#22c55e;padding:4px 0;display:none}#file-input{display:none}.toast{position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:6px;font-size:13px;z-index:999;transition:all 0.3s}.toast.success{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e}.toast.error{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444}@media(max-width:600px){.header,.toolbar{padding:8px 12px}td,th{padding:6px 8px}.date{display:none}}</style></head><body><div class="header"><h1>📁 '+escHtml(entry.name)+'</h1><span class="info">'+escHtml(entry.dir||baseDir)+' · '+fl.length+' item(s)</span></div><div class="toolbar"><label for="file-input">📤 Upload Files</label><input type="file" id="file-input" multiple onchange="uploadFiles(this.files)"><button onclick="newFolder()">📁 New Folder</button><span class="new-folder" id="new-folder-input" style="display:none"><input type="text" id="folder-name" placeholder="folder name" onkeydown="if(event.key===\'Enter\')createFolder()"><button class="dl-btn" onclick="createFolder()" style="opacity:1">✓</button><button class="dl-btn" onclick="cancelNewFolder()" style="opacity:1;color:#ef4444">✕</button></span><span class="upload-progress" id="upload-progress"></span></div><div id="dropzone" style="min-height:200px">'+(fl.length===0?'<div class="empty-state">📭 This folder is empty<br><span style="font-size:12px">Upload files using the button above</span></div>':'<table><thead><tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>') : "<!DOCTYPE html><html><head><meta charset=utf-8><title>"+escHtml(entry.name)+"</title><style>body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}a{color:#3b82f6;text-decoration:none}td{padding:6px 12px}</style></head><body><h2>"+escHtml(entry.name)+"</h2><table>";
            for (var fi = 0; fi < fl.length; fi++) {
              var fn = fl[fi].name;
              var icon = fl[fi].isDirectory() ? "\uD83D\uDCC1" : "\uD83D\uDCC4";
              var href = _u.pathname.replace(/\/?$/, "/") + encodeURIComponent(fn);
              var s = null; try { s = fs.statSync(path.join(resolved, fn)); } catch(e){}
              var sz = s ? formatBytes(s.size) : "—";
              var mt = s ? s.mtime.toLocaleString() : "—";
              if (isFB) {
                h += "<tr><td class='icon'>"+icon+"</td><td class='name'><a href='"+href+"'>"+escHtml(fn)+"</a></td><td class='size'>"+sz+"</td><td class='date'>"+mt+"</td><td class='actions'>"+(fl[fi].isDirectory()?"<button class='dl-btn' onclick=\"if(prompt('Delete folder: "+escHtml(fn)+"?'))fetch('"+href+"',{method:'DELETE'}).then(()=>location.reload())\" title='Delete'>\uD83D\uDDD1</button>":"<button class='dl-btn' onclick=\"fetch('"+href+"',{method:'DELETE'}).then(()=>location.reload())\" title='Delete'>\uD83D\uDDD1</button>")+"</td></tr>";
              } else {
                h += "<tr><td>"+icon+"</td><td><a href='"+href+"'>"+escHtml(fn)+"</a></td></tr>";
              }
            }
            h += isFB ? "</tbody></table></div>" : "</table></body></html>";
            if (isFB) {
              h += '<script>var cp='+JSON.stringify(_u.pathname==="/"?"":_u.pathname)+';function uploadFiles(fs){if(!fs.length)return;var p=document.getElementById("upload-progress"),d=0;for(var f of fs){var fd=new FormData();fd.append("dir",cp);fd.append("file",f);p.style.display="inline";p.textContent="Uploading "+f.name+"...";fetch("",{method:"POST",body:fd}).then(r=>r.json()).then(()=>{d++;if(d===fs.length)location.reload()}).catch(e=>{p.textContent="Error: "+e.message})}}function newFolder(){document.getElementById("new-folder-input").style.display="inline";document.getElementById("folder-name").focus()}function cancelNewFolder(){document.getElementById("new-folder-input").style.display="none";document.getElementById("folder-name").value=""}function createFolder(){var n=document.getElementById("folder-name").value.trim();if(!n)return;fetch("",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,dir:cp})}).then(r=>r.json()).then(()=>location.reload()).catch(e=>alert(e.message))}var dz=document.getElementById("dropzone");dz.addEventListener("dragover",function(e){e.preventDefault();dz.style.outline="2px dashed #3b82f6"});dz.addEventListener("dragleave",function(){dz.style.outline=""});dz.addEventListener("drop",function(e){e.preventDefault();dz.style.outline="";uploadFiles(e.dataTransfer.files)});<\/script></body></html>';
            }
            svcRes.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            svcRes.end(h);
            return;
          }
          var ext = path.extname(resolved).toLowerCase();
          svcRes.writeHead(200, { ...cors, "Content-Type": staticMime[ext] || "application/octet-stream" });
          fs.createReadStream(resolved).pipe(svcRes);
        } catch (e2) { svcRes.writeHead(404, cors); svcRes.end("Not Found"); }
      };
    }

    function restoreProxyHandler(entry) {
      return function(req, res) {
        if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
        res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
        res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + entry.name + ' — Proxy Restore</title>'
          + '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:40px;text-align:center;max-width:600px;margin:auto}'
          + 'h1{font-size:20px;margin-bottom:8px}.badge{display:inline-block;background:#3b82f622;color:#3b82f6;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:600}'
          + 'pre{background:#1a1a2e;padding:14px;border-radius:8px;font-size:12px;text-align:left;margin:12px 0;overflow:auto;border:1px solid rgba(255,255,255,0.06)}'
          + '.muted{color:#6b7280;font-size:12px;margin-top:16px}</style></head><body>'
          + '<h1>⚡ ' + entry.name + ' <span class="badge">Proxy Restored</span></h1>'
          + '<p style="margin-bottom:12px;color:#94a3b8;font-size:14px">This service was restored after a server restart.</p>'
          + '<p style="font-size:13px;margin-bottom:8px">Restart your application on port <strong>' + entry.port + '</strong>:</p>'
          + '<pre># Your app needs to be running on port ' + entry.port + '\n# dweb proxies requests to that port.\n$ cd /path/to/your/project\n$ node server.js   # or python app.py, etc.</pre>'
          + '<div class="muted">dweb is proxying to port ' + entry.port + '. Start your app to use this service.</div></body></html>');
      };
    }

    function restoreGenericHandler(entry) {
      return function(req, res) {
        if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
        res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
        res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + entry.name + '</title>'
          + '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:40px;text-align:center;max-width:500px;margin:auto}'
          + 'h1{font-size:20px;margin-bottom:8px}.muted{color:#6b7280;font-size:13px}</style></head><body>'
          + '<h1>' + entry.type + ' ' + entry.name + '</h1>'
          + '<div class="muted">Restored on port ' + entry.port + '. Configure and restart from the dashboard.</div></body></html>');
      };
    }

    for (var i = 0; i < data.length; i++) {
      var entry = data[i];
      try {
        var handler = null;
        var baseDir = null;

        if (dirTypes.indexOf(entry.type) !== -1) {
          // Dir-based service — serve static files
          if (!entry.dir || !fs.existsSync(entry.dir)) {
            if (entry.dir && entry.dir.indexOf(os.tmpdir()) === 0) {
              try { fs.mkdirSync(entry.dir, { recursive: true }); fs.writeFileSync(path.join(entry.dir, "index.html"), '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + entry.name + '</title><style>body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}h1{font-size:24px;margin-bottom:8px}p{color:#94a3b8;font-size:14px}</style></head><body><h1>' + entry.name + '</h1><p>This directory was restored on restart. Add your files.</p></body></html>'); } catch (e) { console.error("  [services] Could not recreate dir for " + entry.name + ":", e.message); continue; }
            } else { continue; }
          }
          baseDir = path.resolve(entry.dir);
          handler = restoreDirHandler(entry, baseDir);
        } else if (entry.type === "Node.js API" || entry.type === "Python Web App" || entry.type === "PHP Site") {
          // Process proxy — show restart instructions
          handler = restoreProxyHandler(entry);
        } else {
          // In-memory / generic — show placeholder (Webhook Tester, Pastebin, API Proxy, Health Check, Custom Command)
          handler = restoreGenericHandler(entry);
        }

        if (!handler) continue;
        var svr = http.createServer(handler);
        var targetPort = entry.port;
        svr.on("error", function(err) {
          if (err.code === "EADDRINUSE") {
            console.error("  [services] Port " + targetPort + " in use for \"" + entry.name + "\" — skipping restore");
          } else {
            console.error("  [services] Error restoring \"" + entry.name + "\":", err.message);
          }
        });
        svr.listen(targetPort, "0.0.0.0");
        runningServices.set(entry.name, { server: svr, port: targetPort, type: entry.type, dir: entry.dir || null });
        restored++;
        console.log("  [services] Restored \"" + entry.name + "\" (" + entry.type + ") on port " + targetPort);
      } catch (e) { console.error("  [services] Failed to restore " + entry.name + ":", e.message); }
    }
    if (restored > 0) { console.log("  [services] Restored " + restored + " service(s) from disk"); }
  } catch (e) { console.error("  [services] Failed to load services:", e.message); }
  return restored;
}

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

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function formatBytes(b) {
  if (!b || b === 0) return "";
  const u = ["B","KB","MB","GB"]; let i = 0; let s = b;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return s.toFixed(i === 0 ? 0 : 1) + " " + u[i];
}
function getFileIcon(n) {
  const e = n.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","svg","webp","ico","bmp"].includes(e)) return "\uD83D\uDDBC";
  if (["mp4","webm","avi","mkv","mov"].includes(e)) return "\uD83C\uDFAC";
  if (["mp3","wav","ogg","flac","m4a"].includes(e)) return "\uD83C\uDFB5";
  if (["zip","tar","gz","rar","7z"].includes(e)) return "\uD83D\uDDDC";
  if (["pdf"].includes(e)) return "\uD83D\uDCC4";
  if (["doc","docx"].includes(e)) return "\uD83D\uDCDD";
  if (["xls","xlsx","csv"].includes(e)) return "\uD83D\uDCCA";
  if (["js","ts","jsx","tsx","json","html","css","scss","py","rb","go","rs","java","c","cpp","h","sh","bash","yml","yaml","toml","ini","cfg","md","txt"].includes(e)) return "\uD83D\uDCC4";
  return "\uD83D\uDCC4";
}

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
        // ── Service type dispatch ──────────────────────────────────
        // Factory functions defined here for clean closure access.
        // Factory functions are hoisted before body parsing.
        function getDemoDir(type_, name_, port_) {
          var DEMO_ROOT = path.join(os.tmpdir(), "dweb-demo");
          var safeName = String(name_).replace(/[^a-zA-Z0-9_-]/g, "_");
          var demoDir = path.join(DEMO_ROOT, safeName + "-" + port_);
          if (fs.existsSync(demoDir)) return demoDir;
          try {
            fs.mkdirSync(demoDir, { recursive: true });
            var t = type_ || "";
            // ── File Browser ──
            if (t === "File Browser") {
              fs.writeFileSync(path.join(demoDir, "README.md"),
                '# Welcome to \' + name_ + \'\n\nThis is a demo file browser directory.\n\n## Quick Start\n- Upload files using the toolbar above\n- Create folders to organize content\n- Drag & drop files to upload\n- Files are served immediately\n'
                  .replace("' + name_ + '", name_));
              fs.writeFileSync(path.join(demoDir, "index.html"),
                '<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Demo</title><style>body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:#1a1a2e;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:40px;max-width:520px;text-align:center}.icon{font-size:48px;margin-bottom:16px}h1{font-size:24px;font-weight:700;margin-bottom:8px;color:#f1f5f9}p{color:#94a3b8;font-size:14px;line-height:1.7;margin-bottom:20px}.tag{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;background:rgba(59,130,246,0.1);color:#60a5fa;border:1px solid rgba(59,130,246,0.2);margin:2px}.hint{color:#6b7280;font-size:12px;margin-top:20px}</style></head><body><div class=\"card\"><div class=\"icon\">&#128196;</div><h1>\' + name_ + \'</h1><p>This is a <strong>demo environment</strong>. Upload your own files or create folders. All files are served instantly.</p><div><span class=\"tag\">Upload</span><span class=\"tag\">Drag & Drop</span><span class=\"tag\">Delete</span><span class=\"tag\">Browse</span></div><div class=\"hint\">This is a temporary demo. Configure a directory path for persistent storage.</div></div></body></html>'
                  .replace("' + name_ + '", name_));
              fs.writeFileSync(path.join(demoDir, "hello.js"),
                '// Demo JavaScript file\nconsole.log(\'Hello from \' + name_ + \'!\');\n\nfunction greet(name) {\n  return \'Hello, \' + name + \'! Welcome to dweb.\';\n}\n'
                  .replace("' + name_ + '", name_));
              fs.writeFileSync(path.join(demoDir, "style.css"),
                '/* Demo Stylesheet */\n:root {\n  --bg: #0f0f13;\n  --text: #e2e8f0;\n  --accent: #3b82f6;\n}\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody {\n  font-family: system-ui, sans-serif;\n  background: var(--bg);\n  color: var(--text);\n  line-height: 1.6;\n}\n');
            }
            // ── Image Gallery ──
            if (t === "Image Gallery") {
              var _colors = [{"name":"Sunset","bg1":"#f97316","bg2":"#ef4444"},{"name":"Mountains","bg1":"#3b82f6","bg2":"#1d4ed8"},{"name":"Forest","bg1":"#22c55e","bg2":"#15803d"},{"name":"Ocean","bg1":"#06b6d4","bg2":"#0891b2"},{"name":"Lavender","bg1":"#a855f7","bg2":"#7c3aed"},{"name":"Rose","bg1":"#f43f5e","bg2":"#e11d48"}];
              for (var ci = 0; ci < _colors.length; ci++) {
                var c = _colors[ci];
                var svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"600\"><defs><linearGradient id=\"g\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"%C1%\"/><stop offset=\"100%\" stop-color=\"%C2%\"/></linearGradient></defs><rect width=\"800\" height=\"600\" fill=\"url(#g)\"/><text x=\"400\" y=\"300\" text-anchor=\"middle\" fill=\"rgba(255,255,255,0.4)\" font-size=\"36\" font-family=\"system-ui,sans-serif\" font-weight=\"bold\">%NAME%</text><text x=\"400\" y=\"340\" text-anchor=\"middle\" fill=\"rgba(255,255,255,0.2)\" font-size=\"14\" font-family=\"system-ui,sans-serif\">Demo Image - dweb Gallery</text></svg>'
                  .replace(/%C1%/g, c.bg1)
                  .replace(/%C2%/g, c.bg2)
                  .replace(/%NAME%/g, c.name);
                fs.writeFileSync(path.join(demoDir, c.name.toLowerCase() + ".svg"), svg);
              }
              fs.writeFileSync(path.join(demoDir, "_demo.txt"), 'Image Gallery Demo\n\nThis directory contains sample SVG images for demonstration.\nUpload your own images (JPG, PNG, GIF, WebP) to populate the gallery.\n');
            }
            // ── Media Stream / Podcast Host ──
            if (t === "Media Stream" || t === "Podcast Host") {
              var _sampleRate = 44100;
              var _duration = 2;
              var _numSamples = _sampleRate * _duration;
              var _wavBuf = Buffer.alloc(44 + _numSamples * 2);
              _wavBuf.write("RIFF", 0);
              _wavBuf.writeUInt32LE(36 + _numSamples * 2, 4);
              _wavBuf.write("WAVE", 8);
              _wavBuf.write("fmt ", 12);
              _wavBuf.writeUInt32LE(16, 16);
              _wavBuf.writeUInt16LE(1, 20);
              _wavBuf.writeUInt16LE(1, 22);
              _wavBuf.writeUInt32LE(_sampleRate, 24);
              _wavBuf.writeUInt32LE(_sampleRate * 2, 28);
              _wavBuf.writeUInt16LE(2, 32);
              _wavBuf.writeUInt16LE(16, 34);
              _wavBuf.write("data", 36);
              _wavBuf.writeUInt32LE(_numSamples * 2, 40);
              for (var wi = 0; wi < _numSamples; wi++) {
                var _t = wi / _sampleRate;
                var _sample = Math.sin(2 * Math.PI * 440 * _t) * 0.3 + Math.sin(2 * Math.PI * 880 * _t) * 0.15;
                var _val = Math.max(-1, Math.min(1, _sample));
                _wavBuf.writeInt16LE(Math.round(_val * 32767), 44 + wi * 2);
              }
              var _prefix = t === "Podcast Host" ? "episode" : "track";
              fs.writeFileSync(path.join(demoDir, _prefix + "_001_demo.wav"), _wavBuf);
              fs.writeFileSync(path.join(demoDir, _prefix + "_002_demo.wav"), _wavBuf);
              fs.writeFileSync(path.join(demoDir, "_info.txt"),
                '%TYPE% Demo\n\nThis directory contains demo audio files (WAV format, 44100Hz mono).\nUpload your own media files to replace them.\n\nFor %TYPE%, supported formats include:\n- Audio: MP3, WAV, OGG, FLAC, M4A\n- Video: MP4, WebM, MKV, MOV, AVI\n'.replace(/%TYPE%/g, t));
            }
            // ── Git Web UI ──
            // Note: Git Web UI expects a PARENT directory containing repo subfolders,
            // each with their own .git. So we create a subfolder "demo-repo" inside demoDir.
            if (t === "Git Web UI") {
              var _gitRepoDir = path.join(demoDir, "demo-repo");
              fs.mkdirSync(_gitRepoDir, { recursive: true });
              try {
                var _cp = require("child_process");
                _cp.execSync("git init", { cwd: _gitRepoDir, stdio: "ignore" });
              } catch (_) { /* git not available */ }
              fs.writeFileSync(path.join(_gitRepoDir, "README.md"), '# Demo Repository\n\nThis is a demo Git repository created for the Git Web UI service.\n\n## Features\n- Browse commit history\n- View branch information\n- Check repository status\n\n## Getting Started\nClone this repo or configure a real repository path in the service settings.\n');
              fs.writeFileSync(path.join(_gitRepoDir, "index.js"), '// Demo Project\nconst http = require(\'http\');\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { \'Content-Type\': \'text/plain\' });\n  res.end(\'Hello from dweb!\\n\');\n});\n\nserver.listen(3000, () => {\n  console.log(\'Server running on http://localhost:3000\');\n});\n');
              try {
                _cp.execSync("git add .", { cwd: _gitRepoDir, stdio: "ignore" });
                _cp.execSync("git -C " + _gitRepoDir + " config user.email demo@dweb.local", { stdio: "ignore" });
                _cp.execSync("git -C " + _gitRepoDir + " config user.name \"dweb Demo\"", { stdio: "ignore" });
                _cp.execSync("git commit -m \"Initial commit: demo project files\"", { cwd: _gitRepoDir, stdio: "ignore" });
                fs.writeFileSync(path.join(_gitRepoDir, "README.md"),
                  '# Demo Repository\n\nThis is a demo Git repository created for the Git Web UI service.\n\n## Features\n- Browse commit history with git log\n- View branch information (main)\n- Check dirty/clean status\n\n### Demo Files\n- `index.js` - A simple Node.js HTTP server\n- `README.md` - This file\n\n## Getting Started\nClone this repo or configure a real repository path.\n\n### Example\n```bash\ngit clone http://localhost:%PORT%/repo/demo-repo\n```\n'.replace(/%PORT%/g, String(port_)));
                _cp.execSync("git add .", { cwd: _gitRepoDir, stdio: "ignore" });
                _cp.execSync("git commit -m \"Enhance README with detailed documentation\"", { cwd: _gitRepoDir, stdio: "ignore" });
              } catch (_) {}
            }
            // ── Log Viewer ──
            if (t === "Log Viewer") {
              var _now = Date.now();
              var _day = 86400000;
              function _fmtDate(offset) { return new Date(_now - offset).toISOString(); }
              fs.writeFileSync(path.join(demoDir, "app.log"),
                '[%DATE%] [INFO] Application started\n[%DATE%] [INFO] Database connection pool initialized (max: 20)\n[%DATE%] [WARN] Slow query detected: SELECT * FROM users WHERE status=\'active\' (320ms)\n[%DATE%] [INFO] User login: alice@example.com from IP 192.168.1.100\n[%DATE%] [ERROR] Failed to process payment #ORD-38472: upstream timeout after 30s\n[%DATE%] [INFO] Retry attempt 1/3 for payment #ORD-38472\n[%DATE%] [INFO] Payment #ORD-38472 completed successfully\n[%DATE%] [WARN] Memory usage threshold: 85% (limit: 1024MB)\n[%DATE2%] [INFO] Scheduled task: cleanup_temp_files started\n[%DATE2%] [INFO] Scheduled task: cleanup_temp_files completed (124 files removed, 2.3GB freed)\n[%DATE2%] [ERROR] Unhandled rejection: TypeError: Cannot read properties of undefined (reading \'data\') at /app/src/handler.js:42\n[%DATE3%] [INFO] Health check passed (uptime: 23h 45m 12s)\n[%DATE3%] [INFO] User logout: alice@example.com'
                  .replace(/%DATE%/g, _fmtDate(_day))
                  .replace(/%DATE2%/g, _fmtDate(_day / 2))
                  .replace(/%DATE3%/g, _fmtDate(600000))
                  + "\n");
              fs.writeFileSync(path.join(demoDir, "access.log"),
                '%DATE% 192.168.1.100 - - \"GET /api/users HTTP/1.1\" 200 1234 \"-\" \"Mozilla/5.0\"\n%DATE% 192.168.1.101 - - \"POST /api/login HTTP/1.1\" 200 56 \"-\" \"curl/7.88\"\n%DATE% 192.168.1.100 - - \"GET /api/data HTTP/1.1\" 304 0 \"-\" \"Mozilla/5.0\"\n%DATE% 10.0.0.1 - - \"GET /api/admin/users HTTP/1.1\" 403 23 \"-\" \"python-requests/2.31\"\n%DATE% 192.168.1.102 - - \"POST /api/orders HTTP/1.1\" 201 89 \"-\" \"axios/1.6\"\n%DATE3% 192.168.1.100 - - \"GET /api/status HTTP/1.1\" 200 12 \"-\" \"Mozilla/5.0\"'
                  .replace(/%DATE%/g, _fmtDate(_day))
                  .replace(/%DATE3%/g, _fmtDate(600000))
                  + "\n");
              fs.writeFileSync(path.join(demoDir, "error.log"),
                '[%DATE%] ERROR: Database connection timeout after 30s (host: db.internal, port: 5432)\n[%DATE%] ERROR: Payment gateway returned 503 Service Unavailable (upstream: payments.example.com)\n[%DATE%] ERROR: Rate limit exceeded for API key: sk-proj-...f8k2 (limit: 1000 req/hr)\n[%DATE2%] ERROR: Unhandled rejection at /app/src/handler.js:42:16\n[%DATE3%] ERROR: Disk space warning: 92% full on /dev/sda1 (available: 4.2GB)\n[%DATE3%] ERROR: TLS certificate for *.dweb.local expires in 14 days'
                  .replace(/%DATE%/g, _fmtDate(_day))
                  .replace(/%DATE2%/g, _fmtDate(_day / 2))
                  .replace(/%DATE3%/g, _fmtDate(1800000))
                  + "\n");
            }
            // ── Static serving types ──
            if (t === "Static Site" || t === "Single Page App" || t === "Documentation Site" || t === "Dashboard") {
              var _html = (function() {
                var icons = { "Static Site": "\u{1F310}", "Single Page App": "\u26A1", "Documentation Site": "\u{1F4DA}", "Dashboard": "\u{1F4CA}" };
                var icon = icons[t] || "\u{1F310}";
                var title = t === "Single Page App" ? "SPA" : t === "Documentation Site" ? "Documentation" : t;
                var isSpa = t === "Single Page App";
                var spaNav = isSpa ? '<nav style="background:#1a1a2e;padding:10px;display:flex;gap:20px;justify-content:center;border-bottom:1px solid rgba(255,255,255,0.06)"><a href="#" onclick="showPage(\'home\');return false" style="color:#3b82f6;text-decoration:none;font-size:14px;font-weight:500">Home</a><a href="#" onclick="showPage(\'about\');return false" style="color:#94a3b8;text-decoration:none;font-size:14px">About</a><a href="#" onclick="showPage(\'contact\');return false" style="color:#94a3b8;text-decoration:none;font-size:14px">Contact</a></nav>' : '';
                var spaJs = isSpa ? '<script>function showPage(p){var pages={home:"<h2>Welcome Home</h2><p>This is the SPA home page. Navigation works without page reloads.</p>",about:"<h2>About This SPA</h2><p>This demo Single Page App uses hash-free client-side routing. All page transitions happen instantly without full-page reloads.</p>",contact:"<h2>Contact</h2><p>Reach out via the demo contact form.</p><form style=margin-top:16px onsubmit=\\"alert(\'Form submitted (demo)\');return false\\"><input placeholder=\\"Your email\\" style=margin-right:8px;padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.3);color:#e2e8f0><button type=submit style=padding:6px 14px;border-radius:4px;border:none;background:#3b82f6;color:white;cursor:pointer>Send</button></form>"};document.getElementById("spa-content").innerHTML=pages[p]||pages.home;};document.addEventListener("DOMContentLoaded",function(){showPage("home");});<\/script>' : '';
                return '<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>DEMO_NAME - Demo</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f13;color:#e2e8f0;line-height:1.6}.hero{padding:80px 20px 60px;text-align:center;background:linear-gradient(180deg,rgba(59,130,246,0.08) 0%,transparent 100%)}.hero-icon{font-size:56px;margin-bottom:16px}.hero h1{font-size:36px;font-weight:800;margin-bottom:12px;background:linear-gradient(135deg,#60a5fa,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}.hero p{font-size:16px;color:#94a3b8;max-width:500px;margin:0 auto 24px}.badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2);margin-bottom:16px}.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;max-width:700px;margin:0 auto;padding:0 20px 60px}.feature{background:#1a1a2e;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:24px;text-align:center;transition:transform 0.2s,border-color 0.2s}.feature:hover{transform:translateY(-2px);border-color:rgba(59,130,246,0.3)}.feature-icon{font-size:28px;margin-bottom:8px}.feature h3{font-size:14px;font-weight:600;margin-bottom:4px}.feature p{font-size:12px;color:#6b7280}.footer{text-align:center;padding:20px;color:#6b7280;font-size:12px}.footer code{background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;font-size:11px}.spa-content{max-width:700px;margin:0 auto;padding:20px}.spa-content h2{font-size:24px;margin-bottom:12px}.spa-content p{color:#94a3b8;font-size:14px;line-height:1.7}</style></head><body>SPA_NAV<div class=\"hero\"><div class=\"hero-icon\">&#127760;</div><div class=\"badge\">&#9679; Running &bull; STATIC_SITE</div><h1>DEMO_NAME</h1><p>This is a demo static_site served by dweb. Configure a project directory to replace this with your own content.</p></div>SPA_CONTENT<div class=\"features\"><div class=\"feature\"><div class=\"feature-icon\">&#9889;</div><h3>Fast</h3><p>Served with HTTP/1.1 for maximum compatibility</p></div><div class=\"feature\"><div class=\"feature-icon\">&#128274;</div><h3>Local</h3><p>Running on your machine at port 8080</p></div><div class=\"feature\"><div class=\"feature-icon\">&#128196;</div><h3>THIRD_FEATURE</h3><p>THIRD_DESC</p></div></div><div class=\"footer\">dweb &bull; <code>http://localhost:8080</code></div>SPA_JS</body></html>'
                  .replace("&#127760;", icon)
                  .replace("&#9889;", isSpa ? "&#9889;" : "&#127760;")
                  .replace("&#128200;", "&#128200;")
                  .replace("&#128218;", "&#128218;")
                  .replace("SPA_NAV", spaNav)
                  .replace("SPA_CONTENT", isSpa ? '<div id="spa-content" class="spa-content"></div>' : "")
                  .replace("SPA_JS", spaJs);
              })();
              var typeBadge = t === "Single Page App" ? "SPA" : t === "Documentation Site" ? "DOCS" : t === "Dashboard" ? "DASHBOARD" : "STATIC_SITE";
              var typeSlug = t === "Single Page App" ? "spa" : t === "Documentation Site" ? "docs" : t === "Dashboard" ? "dashboard" : "static_site";
              var feat3Title = t === "Single Page App" ? "SPA Ready" : t === "Documentation Site" ? "Markdown" : t === "Dashboard" ? "Live Stats" : "Static";
              var feat3Desc = t === "Single Page App" ? "Client-side routing with dynamic pages" : t === "Documentation Site" ? "Render Markdown docs beautifully" : t === "Dashboard" ? "Real-time data dashboards" : "Serve HTML, CSS, JS, and assets";
              _html = _html
                .replaceAll("STATIC_SITE", typeBadge)
                .replaceAll("static_site", typeSlug)
                .replaceAll("DEMO_NAME", name_)
                .replaceAll("8080", String(port_))
                .replace("THIRD_FEATURE", feat3Title)
                .replace("THIRD_DESC", feat3Desc);
              fs.writeFileSync(path.join(demoDir, "index.html"), _html);
            }
            return demoDir;
          } catch (e) {
            console.error("  [demo] Failed to create demo dir for " + name_ + ":", e.message);
            return null;
          }
        }

        function createStaticHandler(baseDir, cors, spaFallback) {
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir(type, name, port);
          }
          return (req, res) => {
            if (!baseDir || !fs.existsSync(baseDir)) {
              return sendStatusPage(res, name, type, port, baseDir, cors);
            }
            const url = new URL(req.url, "http://localhost");
            let reqPath = decodeURIComponent(url.pathname);
            const resolved = path.resolve(baseDir, "." + reqPath);
            if (!resolved.startsWith(path.resolve(baseDir))) {
              res.writeHead(403, { ...cors, "Content-Type": "text/plain" });
              return res.end("Forbidden");
            }
            fs.stat(resolved, (err, stat) => {
              if (err || !stat) {
                if (spaFallback) {
                  const indexPath = path.join(baseDir, "index.html");
                  if (fs.existsSync(indexPath)) {
                    res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
                    return fs.createReadStream(indexPath).pipe(res);
                  }
                }
                res.writeHead(404, { ...cors, "Content-Type": "text/plain" });
                return res.end("Not found");
              }
              if (stat.isDirectory()) {
                const indexPath = path.join(resolved, "index.html");
                if (fs.existsSync(indexPath)) {
                  res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
                  return fs.createReadStream(indexPath).pipe(res);
                }
                return sendDirListing(res, resolved, reqPath, baseDir, cors);
              }
              const ext = path.extname(resolved).toLowerCase();
              res.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "application/octet-stream" });
              fs.createReadStream(resolved).pipe(res);
            });
          };
        }

        function createFileBrowserHandler(baseDir, cors) {
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir(type, name, port);
          }
          if (!baseDir || !fs.existsSync(baseDir)) {
            return (req, res) => sendStatusPage(res, name, type, port, baseDir, cors);
          }
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            let reqPath = decodeURIComponent(url.pathname);
            const resolved = path.resolve(baseDir, "." + reqPath);
            if (!resolved.startsWith(path.resolve(baseDir))) {
              res.writeHead(403, { ...cors, "Content-Type": "text/plain" });
              return res.end("Forbidden: path traversal detected");
            }
            // JSON directory listing (?json)
            if (url.searchParams.has("json") && req.method === "GET") {
              fs.stat(resolved, (err, st) => {
                if (err || !st) { res.writeHead(404, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "Not found" })); }
                if (!st.isDirectory()) { res.writeHead(400, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "Not a directory" })); }
                fs.readdir(resolved, { withFileTypes: true }, (rdErr, entries) => {
                  if (rdErr) { res.writeHead(500, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: rdErr.message })); }
                  const files = entries.map(e => {
                    let info = { name: e.name + (e.isDirectory() ? "/" : ""), isDir: e.isDirectory(), size: 0, mtime: null };
                    try { const s = fs.statSync(path.join(resolved, e.name)); info.size = s.size; info.mtime = s.mtime.toISOString(); } catch {}
                    return info;
                  });
                  res.writeHead(200, { ...cors, "Content-Type": "application/json" });
                  res.end(JSON.stringify({ path: reqPath, files }));
                });
              });
              return;
            }
            // DELETE
            if (req.method === "DELETE" || (req.method === "POST" && url.searchParams.has("delete"))) {
              const delPath = req.method === "DELETE" ? resolved : path.resolve(baseDir, "." + url.searchParams.get("delete"));
              if (!delPath.startsWith(path.resolve(baseDir))) {
                res.writeHead(403, { ...cors, "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Forbidden" }));
              }
              fs.stat(delPath, (err) => {
                if (err) { res.writeHead(404, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "Not found" })); }
                fs.rm(delPath, { recursive: true, force: true }, (rmErr) => {
                  if (rmErr) { res.writeHead(500, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: rmErr.message })); }
                  res.writeHead(200, { ...cors, "Content-Type": "application/json" });
                  res.end(JSON.stringify({ ok: true, deleted: reqPath }));
                });
              });
              return;
            }
            // POST upload
            if (req.method === "POST" && !url.searchParams.has("delete")) {
              const ct = req.headers["content-type"] || "";
              if (ct.includes("multipart/form-data")) {
                const boundary = "--" + ct.split("boundary=")[1];
                const bufs = [];
                req.on("data", c => bufs.push(c));
                req.on("end", () => {
                  const raw = Buffer.concat(bufs);
                  const parts = splitMultiPart(raw, boundary);
                  let fileName = "upload.bin", fileData = null, uploadDir = resolved;
                  for (const part of parts) {
                    const headerEnd = part.indexOf("\r\n\r\n");
                    if (headerEnd === -1) continue;
                    const hdrs = part.slice(0, headerEnd).toString("utf8");
                    const body = part.slice(headerEnd + 4);
                    if (hdrs.includes('name="dir"')) { const sub = body.toString("utf8").trim(); if (sub) uploadDir = path.resolve(baseDir, sub); }
                    else if (hdrs.includes('name="file"') || hdrs.includes('name="files"')) { const m = hdrs.match(/filename="([^"]*)"/); if (m) fileName = m[1]; fileData = body; }
                  }
                  if (!fileData) { res.writeHead(400, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "No file in upload" })); }
                  const targetPath = path.join(uploadDir, fileName);
                  if (!targetPath.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end(JSON.stringify({ error: "Forbidden" })); }
                  const clean = fileData.length >= 2 && fileData[fileData.length - 1] === 0x0a && fileData[fileData.length - 2] === 0x0d ? fileData.slice(0, -2) : fileData;
                  fs.mkdir(path.dirname(targetPath), { recursive: true }, () => {
                    fs.writeFile(targetPath, clean, (e) => { if (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); } res.writeHead(200); res.end(JSON.stringify({ ok: true, file: fileName })); });
                  });
                });
                return;
              }
              // JSON upload
              let body = "";
              req.on("data", c => body += c);
              req.on("end", () => {
                try {
                  const data = JSON.parse(body);
                  const { file, content, name: fname, mkdir, dir: subDir } = data;
                  if (mkdir || (fname && !file && content === undefined)) {
                    const folderName = fname || "new-folder";
                    const targetDir = subDir ? path.resolve(baseDir, subDir, folderName) : path.join(resolved, folderName);
                    if (!targetDir.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end(JSON.stringify({ error: "Forbidden" })); }
                    fs.mkdir(targetDir, { recursive: true }, (e) => { if (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); } res.writeHead(200); res.end(JSON.stringify({ ok: true, folder: folderName })); });
                    return;
                  }
                  const targetFile = fname || file || "untitled.txt";
                  const targetPath = subDir ? path.resolve(baseDir, subDir, targetFile) : path.join(resolved, targetFile);
                  if (!targetPath.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end(JSON.stringify({ error: "Forbidden" })); }
                  fs.writeFile(targetPath, content || "", (e) => { if (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); } res.writeHead(200); res.end(JSON.stringify({ ok: true, file: targetFile })); });
                } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); }
              });
              return;
            }
            // GET
            fs.stat(resolved, (err, stat) => {
              if (err) {
                if (reqPath === "/" || reqPath === "") return sendStatusPage(res, name, type, port, baseDir, cors);
                res.writeHead(404); return res.end("Not found");
              }
              if (stat.isDirectory()) {
                const indexPath = path.join(resolved, "index.html");
                if (fs.existsSync(indexPath)) { const ext = path.extname(indexPath).toLowerCase(); res.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "text/html; charset=utf-8" }); return fs.createReadStream(indexPath).pipe(res); }
                return sendDirListing(res, resolved, reqPath, baseDir, cors);
              }
              const ext = path.extname(resolved).toLowerCase();
              res.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "application/octet-stream" });
              fs.createReadStream(resolved).pipe(res);
            });
          };
        }

        function createGalleryHandler(baseDir, cors) {
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir("Image Gallery", name, port);
          }
          if (!baseDir || !fs.existsSync(baseDir)) return (req, res) => sendStatusPage(res, name, "Image Gallery", port, baseDir, cors);
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            let reqPath = decodeURIComponent(url.pathname);
            const resolved = path.resolve(baseDir, "." + reqPath);
            if (!resolved.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end("Forbidden"); }
            fs.stat(resolved, (err, stat) => {
              if (err) { res.writeHead(404); return res.end("Not found"); }
              if (stat.isDirectory()) {
                fs.readdir(resolved, (readErr, entries) => {
                  if (readErr) { res.writeHead(500); return res.end("Error"); }
                  const imgExt = ["jpg","jpeg","png","gif","webp","svg","ico","bmp"];
                  const images = entries.filter(e => imgExt.includes(e.split(".").pop().toLowerCase()));
                  const dirs = entries.filter(e => { try { return fs.statSync(path.join(resolved, e)).isDirectory(); } catch { return false; }});
                  const cards = images.map(img => `<div class="card"><a href="${encodeURIComponent(img)}"><img src="${encodeURIComponent(img)}" loading="lazy"></a><div class="label">${escHtml(img)}</div></div>`).join("");
                  const dirHTML = dirs.length ? dirs.map(d => `<li>📁 <a href="${encodeURIComponent(d)}/">${escHtml(d)}</a></li>`).join("") : "";
                  res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
                  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(name)} — Gallery</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.card{background:#1a1a2e;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)}
.card img{width:100%;height:150px;object-fit:cover;display:block}
.card .label{padding:6px 10px;font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
li{padding:4px 0}a{color:#3b82f6;text-decoration:none}.muted{color:#6b7280;font-size:12px;margin-top:16px}</style></head><body>
<h1>🖼️ ${escHtml(name)}</h1>
${dirHTML ? '<div style="margin-bottom:12px">' + dirHTML + '</div>' : ""}
<div class="grid">${cards || '<div class="muted" style="grid-column:1/-1;padding:40px;text-align:center">No images found</div>'}</div>
<div class="muted">${escHtml(baseDir)} — ${images.length} images</div></body></html>`);
                });
              } else { const ext = path.extname(resolved).toLowerCase(); res.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "application/octet-stream" }); fs.createReadStream(resolved).pipe(res); }
            });
          };
        }

        function createMediaHandler(baseDir, cors) {
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir("Media Stream", name, port);
          }
          if (!baseDir || !fs.existsSync(baseDir)) return (req, res) => sendStatusPage(res, name, "Media Stream", port, baseDir, cors);
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            let reqPath = decodeURIComponent(url.pathname);
            const resolved = path.resolve(baseDir, "." + reqPath);
            if (!resolved.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end("Forbidden"); }
            fs.stat(resolved, (err, stat) => {
              if (err) { res.writeHead(404); return res.end("Not found"); }
              if (stat.isDirectory()) {
                fs.readdir(resolved, (readErr, entries) => {
                  if (readErr) { res.writeHead(500); return res.end("Error"); }
                  const mediaExt = ["mp3","wav","ogg","flac","m4a","mp4","webm","mkv","mov","avi"];
                  const dirs = entries.filter(e => { try { return fs.statSync(path.join(resolved, e)).isDirectory(); } catch { return false; }});
                  const files = entries.filter(e => { try { return fs.statSync(path.join(resolved, e)).isFile(); } catch { return false; }});
                  const mediaFiles = files.filter(e => mediaExt.includes(e.split(".").pop().toLowerCase()));
                  const rows = [...dirs.map(d => `<tr><td>📁</td><td><a href="${encodeURIComponent(d)}/">${escHtml(d)}</a></td><td></td></tr>`),
                    ...mediaFiles.map(f => { const isAudio = ["mp3","wav","ogg","flac","m4a"].includes(f.split(".").pop().toLowerCase()); return `<tr><td>${isAudio ? "🎵" : "🎬"}</td><td><a href="${encodeURIComponent(f)}">${escHtml(f)}</a></td><td>${formatBytes(fs.statSync(path.join(resolved, f)).size)}</td></tr>`; })].join("");
                  res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
                  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Media</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:12px}table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05)}
a{color:#3b82f6;text-decoration:none}.muted{color:#6b7280;font-size:12px;margin-top:12px}</style></head><body>
<h1>🎵 ${escHtml(name)}</h1><table>${rows || '<tr><td colspan="3" style="padding:40px;text-align:center;color:#6b7280">No media files found</td></tr>'}</table>
<div class="muted">${escHtml(baseDir)}</div></body></html>`);
                });
              } else {
                const ext = path.extname(resolved).toLowerCase();
                const isVideo = ["mp4","webm","mkv","mov","avi"].includes(ext);
                const isAudio = ["mp3","wav","ogg","flac","m4a"].includes(ext);
                if (isVideo || isAudio) {
                  const fileSize = fs.statSync(resolved).size;
                  const range = req.headers.range;
                  if (range) {
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    res.writeHead(206, { ...cors, "Content-Range": `bytes ${start}-${end}/${fileSize}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": MIME[ext] || "application/octet-stream" });
                    return fs.createReadStream(resolved, { start, end }).pipe(res);
                  }
                  res.writeHead(200, { ...cors, "Accept-Ranges": "bytes", "Content-Length": fileSize, "Content-Type": MIME[ext] || "application/octet-stream" });
                  return fs.createReadStream(resolved).pipe(res);
                }
                res.writeHead(200, { ...cors, "Content-Type": MIME[ext] || "application/octet-stream" });
                fs.createReadStream(resolved).pipe(res);
              }
            });
          };
        }

        function createPodcastHandler(baseDir, cors) {
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir("Podcast Host", name, port);
          }
          if (!baseDir || !fs.existsSync(baseDir)) return (req, res) => sendStatusPage(res, name, "Podcast Host", port, baseDir, cors);
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            if (reqPath === "/feed.xml") {
              fs.readdir(baseDir, (err, entries) => {
                const audioExt = ["mp3","wav","ogg","flac","m4a"];
                const episodes = entries.filter(e => audioExt.includes(e.split(".").pop().toLowerCase()));
                const items = episodes.map(ep => { let size = 0; try { size = fs.statSync(path.join(baseDir, ep)).size; } catch {} const epUrl = `http://${req.headers.host || "localhost:" + port}/${encodeURIComponent(ep)}`; return `<item><title>${escHtml(ep)}</title><enclosure url="${epUrl}" length="${size}" type="audio/mpeg"/><guid>${epUrl}</guid></item>`; }).join("");
                res.writeHead(200, { ...cors, "Content-Type": "application/rss+xml; charset=utf-8" });
                res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>${escHtml(name)}</title><link>http://localhost:${port}</link><description>dweb podcast</description>${items}</channel></rss>`);
              });
              return;
            }
            const resolved = path.resolve(baseDir, "." + reqPath);
            if (!resolved.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end("Forbidden"); }
            fs.stat(resolved, (err, stat) => {
              if (err || !stat) { res.writeHead(404); return res.end("Not found"); }
              if (stat.isDirectory()) {
                fs.readdir(resolved, (readErr, entries) => {
                  if (readErr) { res.writeHead(500); return res.end("Error"); }
                  const audioExt = ["mp3","wav","ogg","flac","m4a"];
                  const audioFiles = entries.filter(e => { try { return fs.statSync(path.join(resolved, e)).isFile(); } catch { return false; }}).filter(f => audioExt.includes(f.split(".").pop().toLowerCase()));
                  const rows = audioFiles.map(f => `<tr><td>🎙️</td><td><a href="${encodeURIComponent(f)}">${escHtml(f)}</a></td><td>${formatBytes(fs.statSync(path.join(resolved, f)).size)}</td></tr>`).join("");
                  res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
                  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Podcast</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:12px}table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05)}
a{color:#3b82f6;text-decoration:none}.muted{color:#6b7280;font-size:12px;margin-top:12px}.rss{display:inline-block;margin-top:12px;padding:6px 12px;background:#1a1a2e;border-radius:6px;font-size:12px}</style></head><body>
<h1>🎙️ ${escHtml(name)}</h1><table>${rows || '<tr><td colspan="3" style="padding:40px;text-align:center;color:#6b7280">No audio files found</td></tr>'}</table>
<a class="rss" href="/feed.xml">📡 RSS Feed</a><div class="muted">${escHtml(baseDir)} — ${audioFiles.length} episodes</div></body></html>`);
                });
              } else {
                const ext = path.extname(resolved).toLowerCase();
                if (["mp3","wav","ogg","flac","m4a"].includes(ext)) {
                  const fileSize = fs.statSync(resolved).size; const range = req.headers.range;
                  if (range) { const p = range.replace(/bytes=/, "").split("-"); const s = parseInt(p[0], 10), e = p[1] ? parseInt(p[1], 10) : fileSize - 1; res.writeHead(206, { ...cors, "Content-Range": `bytes ${s}-${e}/${fileSize}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1, "Content-Type": MIME[ext] || "application/octet-stream" }); return fs.createReadStream(resolved, { start: s, end: e }).pipe(res); }
                  res.writeHead(200, { ...cors, "Accept-Ranges": "bytes", "Content-Length": fileSize, "Content-Type": MIME[ext] || "application/octet-stream" }); return fs.createReadStream(resolved).pipe(res);
                }
                res.writeHead(200, { ...cors, "Content-Type": "application/octet-stream" }); fs.createReadStream(resolved).pipe(res);
              }
            });
          };
        }

        function createLogViewerHandler(baseDir, cors) {
          const MAX_LINES = 500;
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir("Log Viewer", name, port);
          }
          if (!baseDir || !fs.existsSync(baseDir)) {
            return (req, res) => { res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" }); res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Log Viewer</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:40px;text-align:center}
h1{font-size:20px;margin-bottom:12px}.muted{color:#6b7280;font-size:14px}</style></head><body>
<h1>📋 ${escHtml(name)}</h1><div class="muted">This service needs a log directory. Stop it, then restart with a directory path.</div></body></html>`); };
          }
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            if (reqPath === "/api/logs/list") {
              fs.readdir(baseDir, (err, entries) => { if (err) return jsonResponse(res, 500, { error: err.message }); const files = entries.filter(e => { try { return fs.statSync(path.join(baseDir, e)).isFile(); } catch { return false; }}).map(f => { const st = fs.statSync(path.join(baseDir, f)); return { name: f, size: st.size, mtime: st.mtime.toISOString() }; }).sort((a, b) => b.mtime.localeCompare(a.mtime)); return jsonResponse(res, 200, { files }); });
              return;
            }
            if (reqPath.startsWith("/api/logs/tail/")) {
              const logFile = decodeURIComponent(reqPath.slice("/api/logs/tail/".length));
              const fullPath = path.resolve(baseDir, logFile);
              if (!fullPath.startsWith(path.resolve(baseDir))) { res.writeHead(403); return res.end("Forbidden"); }
              const nLines = parseInt(url.searchParams.get("lines") || "100", 10);
              const grep = url.searchParams.get("grep") || "";
              fs.readFile(fullPath, "utf8", (err, data) => { if (err) return jsonResponse(res, 404, { error: "Not found" }); let allLines = data.split("\n").filter(Boolean); if (grep) allLines = allLines.filter(l => l.toLowerCase().includes(grep.toLowerCase())); const tailed = allLines.slice(-Math.min(nLines, MAX_LINES)); return jsonResponse(res, 200, { file: logFile, total: allLines.length, lines: tailed, grep: grep || null }); });
              return;
            }
            // UI
            fs.readdir(baseDir, (err, entries) => {
              const files = entries ? entries.filter(e => { try { return fs.statSync(path.join(baseDir, e)).isFile(); } catch { return false; }}).sort() : [];
              const opts = files.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join("");
              res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
              res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Log Viewer</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:12px}.controls{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
select,input,button{background:#1a1a2e;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 10px;font-size:13px}
button{background:#3b82f6;border-color:#3b82f6;cursor:pointer}pre{background:#0f0f13;padding:12px;border-radius:8px;font-size:12px;overflow:auto;max-height:70vh;border:1px solid rgba(255,255,255,0.04)}
.muted{color:#6b7280;font-size:12px;margin-top:8px}</style></head><body>
<h1>📋 ${escHtml(name)}</h1><div class="controls">
<select id="logFile">${opts}</select>
<input type="number" id="lineCount" value="100" min="10" max="${MAX_LINES}" style="width:70px">
<input type="text" id="grepFilter" placeholder="Filter..." style="width:150px">
<button onclick="tailLog()">Tail</button>
<button onclick="tailLog(true)" title="Auto-refresh every 5s">🔄 Watch</button></div>
<pre id="output">Select a log file and click Tail</pre>
<script>
let watchInterval;
function tailLog(watch) {
  clearInterval(watchInterval);
  const file = document.getElementById("logFile").value;
  const lines = document.getElementById("lineCount").value || 100;
  const grep = document.getElementById("grepFilter").value;
  if (!file) return;
  document.getElementById("output").textContent = "Loading...";
  fetch("/api/logs/tail/" + encodeURIComponent(file) + "?lines=" + lines + (grep ? "&grep=" + encodeURIComponent(grep) : ""))
    .then(r => r.json()).then(d => {
      document.getElementById("output").textContent = d.lines.join("\\n") || "(empty or no matches)";
      if (watch) watchInterval = setInterval(() => tailLog(true), 5000);
    }).catch(e => { document.getElementById("output").textContent = "Error: " + e.message; });
}
document.getElementById("logFile").addEventListener("change", () => tailLog());
if (${files.length > 0 ? "true" : "false"}) tailLog();
</script>
<div class="muted">${escHtml(baseDir)} — ${files.length} files</div></body></html>`);
            });
          };
        }

        // ── API-based service handlers ──
        const webhookStore = []; const pasteStore = new Map();

        function createWebhookHandler(name, port, cors) {
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            if (["POST","PUT","PATCH"].includes(req.method)) {
              let body = ""; req.on("data", c => body += c); req.on("end", () => {
                const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), method: req.method, path: reqPath, headers: req.headers, body, timestamp: new Date().toISOString() };
                webhookStore.unshift(entry); if (webhookStore.length > 200) webhookStore.length = 200;
                res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, id: entry.id }));
              }); return;
            }
            if (reqPath === "/api/webhooks") return jsonResponse(res, 200, { total: webhookStore.length, webhooks: webhookStore });
            if (reqPath === "/api/webhooks/clear" && req.method === "POST") { webhookStore.length = 0; return jsonResponse(res, 200, { ok: true }); }
            const rows = webhookStore.slice(0, 50).map(w => { const s = w.body.length > 200 ? w.body.slice(0, 200) + "..." : w.body; return `<tr data-id="${w.id}"><td><span class="method method-${w.method}">${w.method}</span></td><td class="path">${escHtml(w.path)}</td><td class="time">${new Date(w.timestamp).toLocaleTimeString()}</td><td class="summary">${escHtml(s)}</td></tr>`; }).join("");
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Webhook Tester</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:4px}.sub{color:#6b7280;font-size:12px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px;color:#6b7280;font-size:11px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1)}
td{padding:8px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer}tr:hover{background:rgba(255,255,255,0.03)}
.method{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;color:#fff}
.method-POST{background:#22c55e}.method-PUT{background:#3b82f6}.method-PATCH{background:#f59e0b}.method-DELETE{background:#ef4444}
.path{color:#3b82f6}.time{color:#6b7280;white-space:nowrap}.summary{color:#94a3b8;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.actions{margin-bottom:12px}.btn{background:#1a1a2e;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-right:6px}
.btn.danger{background:#ef444422;border-color:#ef444444;color:#ef4444}
#detail{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100;padding:40px;overflow:auto}
#detail pre{background:#1a1a2e;padding:20px;border-radius:8px;max-width:800px;margin:auto;font-size:12px;white-space:pre-wrap}
#detail .close{position:absolute;top:20px;right:30px;font-size:24px;cursor:pointer;color:#fff}
</style></head><body>
<h1>🔔 ${escHtml(name)}</h1>
<div class="sub">Webhook URL: <code>http://${req.headers.host || "localhost:" + port}/</code></div>
<div class="actions">
<button class="btn" onclick="location.reload()">🔄 Refresh</button>
<button class="btn danger" onclick="if(confirm('Clear all webhooks?'))fetch('/api/webhooks/clear',{method:'POST'}).then(()=>location.reload())">🗑 Clear</button>
</div>
${webhookStore.length ? '<table><thead><tr><th>Method</th><th>Path</th><th>Time</th><th>Body</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div style="padding:40px;text-align:center;color:#6b7280">⏳ Waiting for webhooks...<br><span style="font-size:12px">Send a POST/PUT/PATCH to this URL</span></div>'}
<div id="detail" onclick="this.style.display='none'"><span class="close">&times;</span><pre id="detail-content"></pre></div>
<script>
document.querySelectorAll("tr[data-id]").forEach(tr => {
  tr.addEventListener("click", function() {
    const id = this.getAttribute("data-id");
    fetch("/api/webhooks").then(r => r.json()).then(d => {
      const w = d.webhooks.find(x => x.id === id);
      if (w) { document.getElementById("detail-content").textContent = JSON.stringify(w, null, 2); document.getElementById("detail").style.display = "block"; }
    });
  });
});
</script>
</body></html>`);
          };
        }

        function createPastebinHandler(name, port, cors) {
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            if (reqPath === "/api/pastes" && req.method === "POST") {
              let body = ""; req.on("data", c => body += c); req.on("end", () => {
                try { const data = JSON.parse(body); const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); pasteStore.set(key, { content: data.content || "", lang: data.lang || "text", created: new Date().toISOString() }); return jsonResponse(res, 200, { key, url: `http://${req.headers.host || "localhost:" + port}/p/${key}` }); } catch { return jsonResponse(res, 400, { error: "Invalid JSON" }); }
              }); return;
            }
            if (reqPath === "/api/pastes" && req.method === "GET") { const list = Array.from(pasteStore.entries()).map(([k, v]) => ({ key: k, ...v })); return jsonResponse(res, 200, { total: list.length, pastes: list }); }
            const apiMatch = reqPath.match(/^\/api\/pastes\/([a-z0-9]+)$/);
            if (apiMatch && req.method === "GET") { const key = apiMatch[1]; const paste = pasteStore.get(key); if (!paste) return jsonResponse(res, 404, { error: "Not found" }); return jsonResponse(res, 200, { key, ...paste }); }
            const viewMatch = reqPath.match(/^\/p\/([a-z0-9]+)$/);
            if (viewMatch) {
              const key = viewMatch[1]; const paste = pasteStore.get(key);
              if (!paste) { res.writeHead(404); return res.end("Paste not found"); }
              const langMap = { text: "", javascript: "javascript", python: "python", html: "markup", css: "css", json: "json", typescript: "typescript", bash: "bash" };
              res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
              res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Paste #${key}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:18px;margin-bottom:8px}pre{background:#1a1a2e;padding:16px;border-radius:8px;overflow:auto;font-size:13px;border:1px solid rgba(255,255,255,0.06);white-space:pre-wrap}
.meta{color:#6b7280;font-size:12px;margin-bottom:12px}a{color:#3b82f6}</style></head><body>
<h1>📝 Paste #${key}</h1><div class="meta">${paste.lang} — ${new Date(paste.created).toLocaleString()}</div>
<pre>${escHtml(paste.content)}</pre></body></html>`);
              return;
            }
            const pasteRows = Array.from(pasteStore.entries()).slice(-20).reverse().map(([k, v]) => `<tr><td><a href="/p/${k}">${k}</a></td><td>${escHtml(v.lang)}</td><td>${new Date(v.created).toLocaleString()}</td></tr>`).join("");
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Pastebin</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px;max-width:900px;margin:auto}
h1{font-size:20px;margin-bottom:4px}.sub{color:#6b7280;font-size:12px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:#1a1a2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px}
.card h3{font-size:14px;margin-bottom:8px}textarea{width:100%;height:140px;background:#0f0f13;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:10px;font-family:monospace;font-size:13px;resize:vertical}
select,input{background:#0f0f13;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 10px;font-size:13px;width:100%;margin-bottom:8px}
button{background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;width:100%}
button:hover{opacity:0.9}#result{margin-top:8px;word-break:break-all;font-size:12px}
a{color:#3b82f6;text-decoration:none}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
th{text-align:left;padding:6px 8px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.1)}
td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.04)}</style></head><body>
<h1>📝 ${escHtml(name)}</h1><div class="sub">Create and share text snippets</div>
<div class="grid">
<div class="card"><h3>New Paste</h3>
<select id="lang"><option value="text">Plain Text</option><option value="javascript">JavaScript</option><option value="python">Python</option><option value="html">HTML</option><option value="css">CSS</option><option value="json">JSON</option><option value="typescript">TypeScript</option><option value="bash">Shell</option></select>
<textarea id="content" placeholder="Paste your text here..."></textarea>
<button onclick="createPaste()">Create Paste</button>
<div id="result"></div></div>
<div class="card"><h3>Recent Pastes</h3>
${pasteRows ? '<table><thead><tr><th>Key</th><th>Lang</th><th>Created</th></tr></thead><tbody>' + pasteRows + '</tbody></table>' : '<div style="color:#6b7280;font-size:12px">No pastes yet</div>'}</div></div>
<script>
function createPaste() {
  const content = document.getElementById("content").value;
  const lang = document.getElementById("lang").value;
  if (!content.trim()) return;
  fetch("/api/pastes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({content,lang}) })
    .then(r=>r.json()).then(d => { document.getElementById("result").innerHTML = '<a href="/p/'+d.key+'" target="_blank">Open: p/'+d.key+'</a>'; setTimeout(() => location.reload(), 500); })
    .catch(e => alert(e.message));
}
</script></body></html>`);
          };
        }

        function createApiProxyHandler(name, cors) {
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            const targetUrl = url.searchParams.get("url");
            if (reqPath.startsWith("/proxy") && targetUrl) {
              const parsed = new URL(targetUrl);
              const mod = parsed.protocol === "https:" ? https : http;
              const options = { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === "https:" ? 443 : 80), path: parsed.pathname + parsed.search, method: req.method, headers: { ...req.headers, host: parsed.host }, timeout: 15000 };
              delete options.headers["x-forwarded-for"]; delete options.headers["host"];
              const proxyReq = mod.request(options, (proxyRes) => {
                const h = { ...cors }; if (proxyRes.headers["content-type"]) h["Content-Type"] = proxyRes.headers["content-type"];
                res.writeHead(proxyRes.statusCode, h); proxyRes.pipe(res);
              });
              proxyReq.on("error", (e) => { res.writeHead(502, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); });
              if (["POST","PUT","PATCH"].includes(req.method)) { let b = ""; req.on("data", c => b += c); req.on("end", () => proxyReq.end(b)); } else { proxyReq.end(); }
              return;
            }
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — API Proxy</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:40px;max-width:600px;margin:auto}
h1{font-size:20px;margin-bottom:8px}.muted{color:#6b7280;font-size:13px;margin-bottom:16px}
.card{background:#1a1a2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px}
label{display:block;font-size:12px;color:#94a3b8;margin-bottom:4px}
input[type=url]{width:100%;background:#0f0f13;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px 10px;font-size:13px;margin-bottom:8px}
button{background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer}
pre{background:#0f0f13;padding:12px;border-radius:6px;font-size:12px;margin-top:12px;max-height:400px;overflow:auto;border:1px solid rgba(255,255,255,0.04)}
code{background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:3px;font-size:12px}</style></head><body>
<h1>🔁 ${escHtml(name)}</h1>
<div class="muted">CORS proxy for external APIs. Use <code>/proxy?url=...</code></div>
<div class="card">
<label>Target URL</label>
<input type="url" id="targetUrl" placeholder="https://api.example.com/data" value="https://httpbin.org/get">
<button onclick="doRequest()">Send GET</button>
<pre id="result">Response will appear here</pre>
</div>
<script>
function doRequest() {
  const url = document.getElementById("targetUrl").value;
  if (!url) return;
  document.getElementById("result").textContent = "Loading...";
  fetch("/proxy?url=" + encodeURIComponent(url)).then(r => r.text()).then(t => { try { document.getElementById("result").textContent = JSON.stringify(JSON.parse(t), null, 2); } catch { document.getElementById("result").textContent = t; }}).catch(e => { document.getElementById("result").textContent = "Error: " + e.message; });
}
</script></body></html>`);
          };
        }

        function createGitWebHandler(baseDir, cors) {
          if (!baseDir || !fs.existsSync(baseDir)) {
            baseDir = getDemoDir("Git Web UI", name, port);
          }
          if (!baseDir || !fs.existsSync(baseDir)) return (req, res) => sendStatusPage(res, name, "Git Web UI", port, baseDir, cors);
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            if (reqPath === "/api/repos") {
              fs.readdir(baseDir, (err, entries) => { if (err) return jsonResponse(res, 500, { error: err.message }); const repos = entries.filter(e => { try { return fs.statSync(path.join(baseDir, e, ".git")).isDirectory(); } catch { return false; }}); return jsonResponse(res, 200, { repos }); });
              return;
            }
            const repoMatch = reqPath.match(/^\/api\/repo\/([^/]+)\/log$/);
            if (repoMatch && req.method === "GET") {
              const repoName = decodeURIComponent(repoMatch[1]); const repoPath = path.resolve(baseDir, repoName);
              if (!repoPath.startsWith(path.resolve(baseDir))) return jsonResponse(res, 403, { error: "Forbidden" });
              const maxCount = parseInt(url.searchParams.get("count") || "20", 10);
              try { const cp = require("child_process"); const log = cp.execSync(`git log --oneline --graph --decorate -${maxCount}`, { cwd: repoPath, encoding: "utf8", maxBuffer: 1024 * 1024 }); const branches = cp.execSync("git branch -a", { cwd: repoPath, encoding: "utf8" }); const status = cp.execSync("git status --short", { cwd: repoPath, encoding: "utf8" }); return jsonResponse(res, 200, { name: repoName, log: log.split("\n").filter(Boolean), branches: branches.split("\n").filter(Boolean).map(b => b.trim()), dirty: status.trim().length > 0, changes: status.split("\n").filter(Boolean) }); }
              catch (e) { return jsonResponse(res, 500, { error: e.message }); }
            }
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Git Web</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:8px}.sub{color:#6b7280;font-size:12px;margin-bottom:16px}
.repo{background:#1a1a2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin-bottom:12px}
.repo h3{margin-bottom:8px;display:flex;justify-content:space-between}
pre{background:#0f0f13;padding:12px;border-radius:6px;font-size:12px;overflow:auto;max-height:300px;border:1px solid rgba(255,255,255,0.04);color:#a0aec0}
.muted{color:#6b7280;font-size:12px}</style></head><body>
<h1>🔀 ${escHtml(name)}</h1>
<div class="sub">Browse git repositories — ${escHtml(baseDir)}</div>
<div id="repos">Scanning...</div>
<script>
fetch("/api/repos").then(r => r.json()).then(d => {
  if (!d.repos || !d.repos.length) { document.getElementById("repos").innerHTML = '<div class="muted" style="padding:40px;text-align:center">No git repositories found</div>'; return; }
  Promise.all(d.repos.map(r => fetch("/api/repo/" + encodeURIComponent(r) + "/log?count=10").then(r2 => r2.json()).catch(() => null))).then(results => {
    let html = "";
    d.repos.forEach((r, i) => { const info = results[i]; html += '<div class="repo"><h3><span>📂 ' + r + '</span><span class="muted">' + (info ? (info.dirty ? '⚠ modified' : '✓ clean') : '') + '</span></h3>'; if (info) { html += '<pre>' + escHtml(info.log.join("\\n")) + '</pre>'; if (info.branches && info.branches.length > 1) html += '<div class="muted">Branches: ' + info.branches.join(", ") + '</div>'; } else { html += '<div class="muted">Could not read repo</div>'; } html += '</div>'; });
    document.getElementById("repos").innerHTML = html;
  });
});
function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
</script></body></html>`);
          };
        }

        function createHealthCheckHandler(name, cors) {
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = decodeURIComponent(url.pathname);
            if (reqPath === "/ping") return jsonResponse(res, 200, { status: "ok", service: name, timestamp: new Date().toISOString(), uptime: Math.floor((Date.now() - START_TIME) / 1000) });
            if (reqPath === "/health" || reqPath === "/") { const mem = process.memoryUsage(); return jsonResponse(res, 200, { status: "healthy", service: name, hostname: os.hostname(), platform: process.platform, uptime: Math.floor((Date.now() - START_TIME) / 1000), memory: { rss: Math.round(mem.rss / 1024 / 1024) + "MB", heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB" }, timestamp: new Date().toISOString() }); }
            res.writeHead(404, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not found" }));
          };
        }

        function createProcessProxyHandler(proxyPort, name, port, cors) {
          return (req, res) => {
            const url = new URL(req.url, "http://localhost");
            const reqPath = url.pathname + url.search;
            const options = { hostname: "127.0.0.1", port: proxyPort, path: reqPath, method: req.method, headers: { ...req.headers, host: "localhost:" + proxyPort, connection: "close" }, timeout: 30000 };
            delete options.headers["x-forwarded-for"];
            const proxyReq = http.request(options, (proxyRes) => {
              const h = { ...cors, "Access-Control-Allow-Origin": "*" };
              for (const [k, v] of Object.entries(proxyRes.headers)) { if (!["transfer-encoding", "connection"].includes(k)) h[k] = v; }
              res.writeHead(proxyRes.statusCode, h); proxyRes.pipe(res);
            });
            proxyReq.on("error", () => {
              res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
              res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Proxy Setup</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:40px;text-align:center;max-width:600px;margin:auto}
h1{font-size:20px;margin-bottom:8px}.badge{display:inline-block;background:#3b82f622;color:#3b82f6;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:600}
pre{background:#1a1a2e;padding:14px;border-radius:8px;font-size:12px;text-align:left;margin:12px 0;overflow:auto;border:1px solid rgba(255,255,255,0.06)}
.muted{color:#6b7280;font-size:12px;margin-top:16px}</style></head><body>
<h1>⚡ ${escHtml(name)} <span class="badge">Proxy Mode</span></h1>
<p style="margin-bottom:12px;color:#94a3b8;font-size:14px">This service proxies requests to your app running on port <strong>${proxyPort}</strong>.</p>
<p style="font-size:13px;margin-bottom:8px">Start your application manually on port ${proxyPort}:</p>
<pre># Example:
$ cd /path/to/your/project
$ node server.js   # listen on port ${proxyPort}

# dweb proxies:
# http://localhost:${port} → http://localhost:${proxyPort}</pre>
<div class="muted">dweb is proxying to port ${proxyPort}. Your app must be running there.</div>
</body></html>`);
            });
            if (["POST","PUT","PATCH"].includes(req.method)) { let b = ""; req.on("data", c => b += c); req.on("end", () => proxyReq.end(b)); } else { proxyReq.end(); }
          };
        }

        function createCustomCommandHandler(name, port, cors) {
          return (req, res) => {
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(name)} — Custom Command</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;padding:40px;text-align:center;max-width:500px;margin:auto}
h1{font-size:20px;margin-bottom:8px}.muted{color:#6b7280;font-size:13px}</style></head><body>
<h1>⚙️ ${escHtml(name)}</h1>
<div class="muted">Custom Command service. Run your binary or script manually on port ${port}.</div>
</body></html>`);
          };
        }

        // ── Dispatch ──────────────────────────────────────────────
        function createServiceHandler(type, dir, name, port, cors) {
          switch (type) {
            case "Static Site": case "Documentation Site": case "Dashboard": return createStaticHandler(dir, cors, false);
            case "Single Page App": return createStaticHandler(dir, cors, true);
            case "File Browser": return createFileBrowserHandler(dir, cors);
            case "Image Gallery": return createGalleryHandler(dir, cors);
            case "Media Stream": return createMediaHandler(dir, cors);
            case "Podcast Host": return createPodcastHandler(dir, cors);
            case "Log Viewer": return createLogViewerHandler(dir, cors);
            case "Node.js API": case "Python Web App": case "PHP Site": return createProcessProxyHandler(port, name, port, cors);
            case "API Proxy": return createApiProxyHandler(name, cors);
            case "Webhook Tester": return createWebhookHandler(name, port, cors);
            case "Pastebin": return createPastebinHandler(name, port, cors);
            case "Git Web UI": return createGitWebHandler(dir, cors);
            case "Health Check": return createHealthCheckHandler(name, cors);
            case "Custom Command": return createCustomCommandHandler(name, port, cors);
            default: return createStaticHandler(dir, cors, false);
          }
        }

        // ── Parse request body ──
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

            // ── Create server with handler dispatch ───────────────────
            const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
            const handler = createServiceHandler(type || "Custom", dir, name, port, cors);
            const svr = http.createServer((svcReq, svcRes) => {
              if (svcReq.method === "OPTIONS") {
                svcRes.writeHead(204, cors); return svcRes.end();
              }
              handler(svcReq, svcRes);
            });


        // ── Helper functions ──
        function splitMultiPart(buf, boundary) {
          const parts = [];
          const bLen = Buffer.byteLength(boundary);
          let start = 0;
          while (start < buf.length) {
            const idx = buf.indexOf(boundary, start);
            if (idx === -1) break;
            const after = idx + bLen;
            if (after < buf.length && buf[after] === 0x2d) break;
            let contentStart = after;
            if (contentStart + 1 < buf.length && buf[contentStart] === 0x0d && buf[contentStart + 1] === 0x0a) contentStart += 2;
            const nextIdx = buf.indexOf(boundary, contentStart);
            if (nextIdx === -1) break;
            let contentEnd = nextIdx;
            if (contentEnd >= 2 && buf[contentEnd - 2] === 0x0d && buf[contentEnd - 1] === 0x0a) contentEnd -= 2;
            const part = buf.slice(contentStart, contentEnd);
            if (part.length > 0) parts.push(part);
            start = nextIdx;
          }
          return parts;
        }

        function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
        function formatBytes(b) {
          if (!b || b === 0) return "";
          const u = ["B","KB","MB","GB"]; let i = 0; let s = b;
          while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
          return s.toFixed(i === 0 ? 0 : 1) + " " + u[i];
        }
        function getFileIcon(n) {
          const e = n.split(".").pop().toLowerCase();
          if (["jpg","jpeg","png","gif","svg","webp","ico","bmp"].includes(e)) return "\uD83D\uDDBC";
          if (["mp4","webm","avi","mkv","mov"].includes(e)) return "\uD83C\uDFAC";
          if (["mp3","wav","ogg","flac","m4a"].includes(e)) return "\uD83C\uDFB5";
          if (["zip","tar","gz","rar","7z"].includes(e)) return "\uD83D\uDDDC";
          if (["pdf"].includes(e)) return "\uD83D\uDCC4";
          if (["doc","docx"].includes(e)) return "\uD83D\uDCDD";
          if (["xls","xlsx","csv"].includes(e)) return "\uD83D\uDCCA";
          if (["js","ts","jsx","tsx","json","html","css","scss","py","rb","go","rs","java","c","cpp","h","sh","bash","yml","yaml","toml","ini","cfg","md","txt"].includes(e)) return "\uD83D\uDCC4";
          return "\uD83D\uDCC4";
        }
        function sendDirListing(resp, absPath, relPath, baseDir, cors) {
          fs.readdir(absPath, { withFileTypes: true }, (readErr, entries) => {
            if (readErr) {
              resp.writeHead(500, { ...cors, "Content-Type": "text/plain" });
              return resp.end("Error reading directory");
            }
            entries.sort((a, b) => {
              if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
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
              const icon = isDir ? "\uD83D\uDCC1" : getFileIcon(e.name);
              const href = (relPath === "/" ? "" : relPath) + "/" + encodeURIComponent(e.name);
              return `<tr>
                <td class="icon">${icon}</td>
                <td class="name"><a href="${href}">${escHtml(e.name)}</a></td>
                <td class="size">${size}</td>
                <td class="date">${mtime}</td>
                <td class="actions">
                  ${isDir ? `<button class="dl-btn" onclick="if(prompt('Delete folder: ${escHtml(e.name)}?'))fetch('${href}',{method:'DELETE'}).then(()=>location.reload())" title="Delete">\uD83D\uDDD1</button>` : `<button class="dl-btn" onclick="fetch('${href}',{method:'DELETE'}).then(()=>location.reload())" title="Delete">\uD83D\uDDD1</button>`}
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

        // Handle EADDRINUSE gracefully
        svr.once("error", (err) => {
          if (err.code === "EADDRINUSE") {
            return jsonResponse(res, 409, { status: "error", message: `Port ${port} is already in use` });
          }
          return jsonResponse(res, 500, { status: "error", message: err.message });
        });

        svr.listen(port, "0.0.0.0", () => {
          runningServices.set(name, { server: svr, port, type: type || "Custom", dir: dir || null });
          saveServices();
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
        saveServices();
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

  // ── GET /api/proxy/fetch?url=... ─────────────────────────────
  // Fetches a resolved dweb:// target's content (from a bound local port,
  // or a remote peer's bound port) and streams the body back to the
  // browser UI so BrowserView can render it inline. This endpoint was
  // referenced by the frontend but never implemented, so every resolved
  // domain fell through to the "cannot proxy content" placeholder card
  // instead of showing the actual hosted page.
  if (pathname === "/api/proxy/fetch" && req.method === "GET") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return jsonResponse(res, 400, { error: "url query parameter required" });

    let parsedTarget;
    try { parsedTarget = new URL(targetUrl); } catch {
      return jsonResponse(res, 400, { error: "Invalid url" });
    }
    if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
      return jsonResponse(res, 400, { error: "Only http/https targets are supported" });
    }

    const mod = parsedTarget.protocol === "https:" ? https : http;
    const options = {
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || (parsedTarget.protocol === "https:" ? 443 : 80),
      path: parsedTarget.pathname + parsedTarget.search,
      method: "GET",
      headers: { "User-Agent": "dweb-browser-proxy/0.1.0" },
      timeout: 8000,
    };

    const proxyReq = mod.request(options, (proxyRes) => {
      const status = proxyRes.statusCode || 502;
      const contentType = proxyRes.headers["content-type"] || "text/html; charset=utf-8";
      res.writeHead(status, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      proxyRes.pipe(res);
    });
    proxyReq.on("error", (e) => {
      jsonResponse(res, 502, { error: `Could not reach host: ${e.message}` });
    });
    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      jsonResponse(res, 504, { error: "Upstream host timed out" });
    });
    proxyReq.end();
    return;
  }

  // ── OPENCODE TERMINAL ─────────────────────────────────────
  const opencodeSessions = new Map();

  // GET /api/opencode/status
  if (pathname === "/api/opencode/status" && req.method === "GET") {
    let installed = false;
    let binPath = null;
    let version = null;
    try {
      const which = require("child_process").execSync("command -v opencode", { timeout: 5000, encoding: "utf8" }).trim();
      if (which) {
        installed = true;
        binPath = which;
        try {
          const v = require("child_process").execSync("opencode --version", { timeout: 5000, encoding: "utf8" }).trim();
          version = v;
        } catch {}
      }
    } catch {}
    return jsonResponse(res, 200, { installed, path: binPath, version });
  }

  // POST /api/opencode/install
  if (pathname === "/api/opencode/install" && req.method === "POST") {
    const child = require("child_process").spawn("npm", ["install", "-g", "@opencode/cli"], {
      stdio: "ignore",
      detached: true,
    });
    return jsonResponse(res, 200, { status: "installing", pid: child.pid });
  }

  // POST /api/opencode/session
  if (pathname === "/api/opencode/session" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { directory, prompt } = JSON.parse(body);
        if (!directory) {
          return jsonResponse(res, 400, { error: "directory is required" });
        }
        try {
          fs.mkdirSync(directory, { recursive: true });
        } catch (e) {
          return jsonResponse(res, 500, { error: "Failed to create directory: " + e.message });
        }
        const sessionId = crypto.randomUUID();
        const args = prompt ? ["--prompt", prompt, directory] : [directory];
        const child = require("child_process").spawn("opencode", args, {
          cwd: directory,
          stdio: ["pipe", "pipe", "pipe"],
          detached: true,
        });
        const session = {
          pid: child.pid,
          directory,
          startedAt: new Date().toISOString(),
          status: "started",
          process: child,
          stdout: "",
          stderr: "",
        };
        child.stdout.on("data", (data) => {
          session.stdout += data.toString();
          if (session.stdout.length > 102400) session.stdout = session.stdout.slice(-102400);
        });
        child.stderr.on("data", (data) => {
          session.stderr += data.toString();
          if (session.stderr.length > 102400) session.stderr = session.stderr.slice(-102400);
        });
        child.on("exit", () => { session.status = "exited"; });
        opencodeSessions.set(sessionId, session);
        return jsonResponse(res, 200, { session_id: sessionId, pid: child.pid, directory, status: "started" });
      } catch (e) {
        return jsonResponse(res, 400, { error: e.message });
      }
    });
    return;
  }

  // GET /api/opencode/sessions
  if (pathname === "/api/opencode/sessions" && req.method === "GET") {
    const sessions = [];
    for (const [id, s] of opencodeSessions) {
      sessions.push({
        session_id: id,
        pid: s.pid,
        directory: s.directory,
        started_at: s.startedAt,
        status: s.status,
      });
    }
    return jsonResponse(res, 200, { sessions });
  }

  // POST /api/opencode/session/:id/stop
  const sessionStopMatch = pathname.match(/^\/api\/opencode\/session\/([^/]+)\/stop$/);
  if (sessionStopMatch && req.method === "POST") {
    const sessionId = sessionStopMatch[1];
    const session = opencodeSessions.get(sessionId);
    if (!session) {
      return jsonResponse(res, 404, { error: "Session not found" });
    }
    try {
      process.kill(session.pid);
    } catch {}
    session.status = "stopped";
    return jsonResponse(res, 200, { status: "stopped", session_id: sessionId });
  }

  // POST /api/opencode/session/:id/input
  const sessionInputMatch = pathname.match(/^\/api\/opencode\/session\/([^/]+)\/input$/);
  if (sessionInputMatch && req.method === "POST") {
    const sessionId = sessionInputMatch[1];
    const session = opencodeSessions.get(sessionId);
    if (!session) {
      return jsonResponse(res, 404, { error: "Session not found" });
    }
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { input } = JSON.parse(body);
        if (input === undefined) {
          return jsonResponse(res, 400, { error: "input is required" });
        }
        if (session.process && session.process.stdin && session.process.stdin.writable) {
          session.process.stdin.write(input + "\n");
          return jsonResponse(res, 200, { status: "sent" });
        }
        return jsonResponse(res, 400, { error: "Session process is not running or stdin is not available" });
      } catch (e) {
        return jsonResponse(res, 400, { error: e.message });
      }
    });
    return;
  }

  // ── OLLAMA MANAGEMENT ─────────────────────────────────────
  const ollamaCp = require("child_process");
  let ollamaProcess = null;
  let ollamaInstallPid = null;

  // GET /api/ollama/status
  if (pathname === "/api/ollama/status" && req.method === "GET") {
    let installed = false;
    let running = false;
    let version = null;
    let models = [];

    try {
      const v = ollamaCp.execSync("ollama --version", { timeout: 5000, encoding: "utf8" });
      installed = true;
      version = v.replace("ollama version ", "").trim();
    } catch {}

    if (installed) {
      try {
        const listOut = ollamaCp.execSync("ollama list", { timeout: 10000, encoding: "utf8" });
        running = true;
        const lines = listOut.trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s{2,}/);
          if (parts.length >= 3) {
            models.push({ name: parts[0], size: parts[1], modified: parts.slice(2).join(" ") });
          }
        }
      } catch {
        if (ollamaProcess && ollamaProcess.pid) {
          try {
            process.kill(ollamaProcess.pid, 0);
            running = true;
          } catch {
            ollamaProcess = null;
          }
        }
      }
    }

    return jsonResponse(res, 200, { installed, running, version, models, port: 11434 });
  }

  // POST /api/ollama/install
  if (pathname === "/api/ollama/install" && req.method === "POST") {
    const child = ollamaCp.spawn("sh", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
      stdio: "ignore",
      detached: true,
    });
    ollamaInstallPid = child.pid;
    child.on("exit", () => {
      ollamaInstallPid = null;
      const start = ollamaCp.spawn("ollama", ["serve"], { stdio: "ignore", detached: true });
      ollamaProcess = start;
    });
    child.on("error", () => { ollamaInstallPid = null; });
    return jsonResponse(res, 200, { status: "installing", pid: child.pid });
  }

  // POST /api/ollama/start
  if (pathname === "/api/ollama/start" && req.method === "POST") {
    try {
      const child = ollamaCp.spawn("ollama", ["serve"], {
        stdio: "ignore",
        detached: true,
      });
      ollamaProcess = child;
      child.on("error", (err) => { console.error("  [ollama] Start error:", err.message); });
      return jsonResponse(res, 200, { status: "started", pid: child.pid });
    } catch (e) {
      return jsonResponse(res, 500, { error: e.message });
    }
  }

  // POST /api/ollama/stop
  if (pathname === "/api/ollama/stop" && req.method === "POST") {
    try {
      ollamaCp.execSync("pkill ollama", { timeout: 5000 });
    } catch {}
    ollamaProcess = null;
    return jsonResponse(res, 200, { status: "stopped" });
  }

  // POST /api/ollama/pull
  if (pathname === "/api/ollama/pull" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { model } = JSON.parse(body);
        if (!model) {
          return jsonResponse(res, 400, { error: "model name required" });
        }
        const child = ollamaCp.spawn("ollama", ["pull", model], {
          stdio: "inherit",
          detached: true,
        });
        return jsonResponse(res, 200, { status: "pulling", model, pid: child.pid });
      } catch (e) {
        return jsonResponse(res, 400, { error: e.message });
      }
    });
    return;
  }

  // GET /api/ollama/models
  if (pathname === "/api/ollama/models" && req.method === "GET") {
    try {
      const listOut = ollamaCp.execSync("ollama list", { timeout: 10000, encoding: "utf8" });
      const lines = listOut.trim().split("\n");
      const models = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s{2,}/);
        if (parts.length >= 3) {
          models.push({ name: parts[0], size: parts[1], modified: parts.slice(2).join(" ") });
        }
      }
      return jsonResponse(res, 200, { models });
    } catch (e) {
      return jsonResponse(res, 200, { models: [] });
    }
  }

  // DELETE /api/ollama/models/:name
  const modelRemoveMatch = pathname.match(/^\/api\/ollama\/models\/(.+)$/);
  if (modelRemoveMatch && req.method === "DELETE") {
    const modelName = decodeURIComponent(modelRemoveMatch[1]);
    try {
      ollamaCp.execSync(`ollama rm ${modelName}`, { timeout: 30000, encoding: "utf8" });
      return jsonResponse(res, 200, { status: "removed", model: modelName });
    } catch (e) {
      return jsonResponse(res, 500, { error: e.message });
    }
  }

  // ── DOMAIN MANAGEMENT ────────────────────────────────────────
  // All /api/domain/* routes
  if (pathname.startsWith("/api/domain/")) {
    // Parse body for POST/DELETE
    if (req.method === "POST" || req.method === "DELETE") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        let parsed = {};
        try { if (body) parsed = JSON.parse(body); } catch {}
        const result = handleDomainAPI(req, res, url, parsed);
        if (result === null) {
          jsonResponse(res, 404, { error: "Unknown domain API route" });
        }
      });
      return;
    }
    // GET requests (no body)
    const result = handleDomainAPI(req, res, url, {});
    if (result === null) {
      jsonResponse(res, 404, { error: "Unknown domain API route" });
    }
    return;
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

  // Restore persisted services from disk
  restoreServices();

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
