// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Utility Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const os = require("os");
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { _usedPorts } = require("./config.cjs");

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

function probePort(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => { s.close(); resolve(port); });
    s.listen(port, "0.0.0.0");
  });
}

async function findFreePort(envVar, preferred, maxAttempts = 10) {
  const envPort = parseInt(process.env[envVar], 10);
  const startPort = envPort || preferred;
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (_usedPorts.has(port)) continue;
    const free = await probePort(port);
    if (free) { _usedPorts.add(free); return free; }
  }
  for (let i = 0; i < 100; i++) {
    const free = await probePort(0);
    if (free && !_usedPorts.has(free)) { _usedPorts.add(free); return free; }
  }
  return startPort;
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
  const { DIST_DIR } = require("./config.cjs");
  if (!fs.existsSync(filePath)) {
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

module.exports = {
  getLocalIPs, peerToJSON, json, parseBody, probePort, findFreePort,
  MIME, serveFile, httpReq,
};
