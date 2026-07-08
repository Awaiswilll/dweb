// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Configuration & Constants
// ═══════════════════════════════════════════════════════════════════════════════

const os = require("os");
const path = require("path");
const crypto = require("crypto");
const MOVIES = require("./movies.cjs");

function getLocalIPs() {
  const ifaces = os.networkInterfaces(), ips = [];
  for (const n of Object.keys(ifaces))
    for (const i of ifaces[n])
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
  return ips.length ? ips : ["127.0.0.1"];
}

// Ports are tried dynamically — env vars set the preferred start value
let _PORT          = parseInt(process.env.PORT, 10) || 49737;
let _RELAY_PORT    = parseInt(process.env.RELAY_PORT, 10) || 49736;
let _TCP_RELAY_PORT = parseInt(process.env.TCP_PORT, 10) || 49738;

const PEER_TTL_MS   = parseInt(process.env.PEER_TTL, 10) || 60000;
const DIST_DIR      = path.resolve(__dirname, "..", "dist");
const MODE          = (process.env.MODE || "auto").toLowerCase();
const INSTANCE_NAME = process.env.NAME || os.hostname();

const START_TIME    = Date.now();
const LOCAL_IPS     = getLocalIPs();

// Generate a unique peer ID from 2 random movie names
function generateMoviePeerId() {
  const m1 = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  let m2 = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  // Ensure we get 2 different movies
  while (m2 === m1 && MOVIES.length > 1) {
    m2 = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  }
  return `${m1}-${m2}`;
}
const PEER_ID = `dweb-${generateMoviePeerId()}`;

const UPSTREAM_RELAY = process.env.UPSTREAM || null;

const SHARE_DIR = path.resolve(__dirname, "..", "shared-files");

// Local discovery
const MULTICAST_ADDR = "239.255.0.100";
const MULTICAST_PORT = 49739;
const DISCOVERY_DIR = "/tmp/dweb-instances";

// Track assigned ports to prevent collisions
const _usedPorts = new Set();

// SERVER_ID — short internal identifier (not the human-facing peer ID)
const SERVER_ID = crypto.randomUUID().split("-")[0];

module.exports = {
  get PORT() { return _PORT; },
  set PORT(v) { _PORT = v; },
  get RELAY_PORT() { return _RELAY_PORT; },
  set RELAY_PORT(v) { _RELAY_PORT = v; },
  get TCP_RELAY_PORT() { return _TCP_RELAY_PORT; },
  set TCP_RELAY_PORT(v) { _TCP_RELAY_PORT = v; },
  PEER_TTL_MS, DIST_DIR, MODE, INSTANCE_NAME, SERVER_ID, START_TIME,
  UPSTREAM_RELAY, SHARE_DIR, LOCAL_IPS, PEER_ID, getLocalIPs,
  MULTICAST_ADDR, MULTICAST_PORT, DISCOVERY_DIR, _usedPorts,
};
