#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════
//  dweb Relay Client v0.1.0
//  Standalone peer that registers with a relay and discovers peers
//  Usage:
//    node relay-client.cjs                          → interactive mode
//    node relay-client.cjs --relay=192.168.1.10:49736  → connect to relay
//    node relay-client.cjs --register               → register once and exit
//    node relay-client.cjs --discover               → list peers and exit
// ═══════════════════════════════════════════════════════════════

const http = require("http");
const os = require("os");
const crypto = require("crypto");

const RELAY = process.env.RELAY_ADDR || process.argv.find(a => a.startsWith("--relay="))?.split("=")[1] || "localhost:49736";
const [RELAY_HOST, RELAY_PORT] = RELAY.split(":");
const RP = parseInt(RELAY_PORT, 10) || 49736;
const PEER_ID = `peer-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${crypto.randomUUID().slice(0, 4)}`;

// ── HTTP helpers ───────────────────────────────────────────────
function req(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: RELAY_HOST, port: RP, path, method,
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
      timeout: 5000,
    };
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

function getLocalIPs() {
  const ifaces = os.networkInterfaces(), ips = [];
  for (const n of Object.keys(ifaces))
    for (const i of ifaces[n])
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
  return ips.length ? ips : ["127.0.0.1"];
}

// ── Commands ───────────────────────────────────────────────────
async function register() {
  console.log(`\n  Registering ${PEER_ID} with ${RELAY}...`);
  const res = await req("POST", "/register", {
    id: PEER_ID, hostname: os.hostname(), platform: process.platform,
    version: "0.1.0", address: getLocalIPs()[0] || "127.0.0.1",
    mode: "p2p-visible", services: ["relay-client"],
  });
  if (res.status === "ok") {
    console.log(`  ✓ Registered!  Relay has ${res.peersOnline} peer(s)`);
    return true;
  }
  console.log(`  ✗ Failed: ${res.message || "unknown"}`);
  return false;
}

async function discover() {
  const res = await req("GET", "/discover");
  if (res.status === "ok") {
    console.log(`\n  ${res.count} peer(s) online:\n`);
    for (const p of res.peers) {
      console.log(`    ${p.id.slice(0, 20).padEnd(22)} ${p.mode.padEnd(14)} ${p.address}:${p.port || "?"}  ${p.hostname}`);
    }
    console.log();
    return res.peers || [];
  }
  console.log(`  ✗ Discover failed: ${res.message || "unknown"}`);
  return [];
}

async function ping() {
  const res = await req("GET", "/ping");
  if (res.status === "ok") {
    console.log(`  Relay: ${res.server.hostname}  uptime=${res.server.uptime}s  peers=${res.server.peers}`);
    return res;
  }
  console.log(`  ✗ Relay not responding`);
  return null;
}

async function signal(targetPeerId) {
  console.log(`  Sending signal to ${targetPeerId.slice(0, 16)}...`);
  const res = await req("POST", "/signal", {
    targetPeerId, fromPeerId: PEER_ID, type: "offer", sdp: "v=0\r\n",
  });
  console.log(`  ${res.status === "ok" ? "✓" : "✗"} Signal queued: ${res.queued}`);
}

// ── Interactive mode ───────────────────────────────────────────
async function interactive() {
  console.clear();
  console.log(`\n  ╔════════════════════════════════════════════╗`);
  console.log(`  ║     dweb Relay Client v0.1.0              ║`);
  console.log(`  ║     ────────────────                       ║`);
  console.log(`  ║  Peer ID : ${PEER_ID.slice(0, 28).padEnd(28)}║`);
  console.log(`  ║  Relay   : ${RELAY.padEnd(36)}║`);
  console.log(`  ╚════════════════════════════════════════════╝\n`);

  // Auto-register
  await register();

  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function menu() {
    console.log(`  Commands:`);
    console.log(`    1  ping         — ping the relay`);
    console.log(`    2  discover     — list online peers`);
    console.log(`    3  signal <id>  — send signal to a peer`);
    console.log(`    4  heartbeat    — send heartbeat`);
    console.log(`    5  status       — show relay status`);
    console.log(`    0  quit         — exit`);
    console.log();
    rl.question(`  > `, async (cmd) => {
      const c = cmd.trim();
      if (c === "0" || c === "quit") { console.log("  Goodbye!\n"); process.exit(0); }
      if (c === "1" || c === "ping") await ping();
      if (c === "2" || c === "discover") await discover();
      if (c.startsWith("3") || c.startsWith("signal")) {
        const id = c.split(" ").slice(1).join(" ");
        if (id) await signal(id); else console.log("  Usage: signal <peerId>");
      }
      if (c === "4") { await req("POST", "/heartbeat", { peerId: PEER_ID }); console.log("  Heartbeat sent"); }
      if (c === "5") { const s = await req("GET", "/status"); console.log(`  ${s.peersOnline} peers, uptime ${s.uptime}s`); }
      console.log();
      menu();
    });
  }
  menu();
}

// ── CLI dispatch ──────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--interactive") || args.includes("-i")) { interactive(); }
else if (args.includes("--register") || args.includes("-r")) { register().then(() => process.exit(0)); }
else if (args.includes("--discover") || args.includes("-d")) { discover().then(() => process.exit(0)); }
else if (args.includes("--ping") || args.includes("-p")) { ping().then(() => process.exit(0)); }
else if (args.includes("--signal")) {
  const idx = args.indexOf("--signal");
  const target = args[idx + 1];
  if (target) { register().then(() => signal(target)).then(() => process.exit(0)); }
  else { console.log("Usage: --signal <peerId>"); process.exit(1); }
}
else { interactive(); }
