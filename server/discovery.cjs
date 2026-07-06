// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Local Discovery (UDP Multicast + File-Based)
// ═══════════════════════════════════════════════════════════════════════════════

const os = require("os");
const fs = require("fs");
const path = require("path");
const dgram = require("dgram");
const config = require("./config.cjs");
const { PEER_ID, MODE, LOCAL_IPS, MULTICAST_ADDR, MULTICAST_PORT, DISCOVERY_DIR } = config;
const { peers, localPeers, hostedServices } = require("./state.cjs");
const { httpReq } = require("./helpers.cjs");

let discoverySocket = null;
let fileDiscoveryStarted = false;

// ── UDP Multicast Discovery ────────────────────────────────────────────────────

function startLocalDiscovery() {
  try {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });

    sock.on("listening", () => {
      try {
        sock.addMembership(MULTICAST_ADDR);
        sock.setBroadcast(true);
        sock.setMulticastTTL(2);
      } catch (e) {
        console.log(`  [discovery] Membership error: ${e.message}`);
      }
    });

    sock.on("message", (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.peerId && data.peerId !== PEER_ID) {
          const existing = localPeers.get(data.peerId);
          localPeers.set(data.peerId, { ...data, lastSeen: Date.now(), address: rinfo.address });
          if (!existing && !peers.has(data.peerId)) {
            registerWithDiscoveredPeer(data, rinfo.address).catch(() => {});
          }
        }
      } catch {}
    });

    sock.on("error", (err) => {
      if (err.code !== "EADDRINUSE") {
        console.log(`  [discovery] Socket error: ${err.message}`);
      }
    });

    sock.bind(MULTICAST_PORT, () => {
      console.log(`  Discovery  : udp://${MULTICAST_ADDR}:${MULTICAST_PORT}`);
    });

    // Periodic announcement broadcast (every 5 seconds)
    setInterval(() => {
      try {
        const msg = JSON.stringify({
          peerId: PEER_ID, port: config.PORT, relayPort: config.RELAY_PORT,
          tcpPort: config.TCP_RELAY_PORT, hostname: os.hostname(),
          platform: process.platform, version: "0.1.0",
          mode: MODE, localIPs: LOCAL_IPS,
        });
        sock.send(msg, MULTICAST_PORT, MULTICAST_ADDR);
      } catch {}
    }, 5000);

    discoverySocket = sock;
    return sock;
  } catch (e) {
    console.log(`  [discovery] UDP failed: ${e.message}`);
    return null;
  }
}

// ── File-Based Local Discovery ─────────────────────────────────────────────────

function startFileDiscovery() {
  try {
    if (!fs.existsSync(DISCOVERY_DIR)) fs.mkdirSync(DISCOVERY_DIR, { recursive: true });
  } catch (e) {
    console.log(`  [discovery] Cannot create ${DISCOVERY_DIR}: ${e.message}`);
    return;
  }
  fileDiscoveryStarted = true;

  const ourFile = path.join(DISCOVERY_DIR, `${PEER_ID}.json`);
  function writeOurInfo() {
    try {
      const info = {
      peerId: PEER_ID, port: config.PORT, relayPort: config.RELAY_PORT,
      tcpPort: config.TCP_RELAY_PORT, hostname: os.hostname(),
        platform: process.platform, version: "0.1.0",
        mode: MODE, pid: process.pid, timestamp: Date.now(),
      };
      fs.writeFileSync(ourFile, JSON.stringify(info));
    } catch {}
  }
  writeOurInfo();
  setInterval(writeOurInfo, 10000);

  process.on("exit", () => {
    try { fs.unlinkSync(ourFile); } catch {}
  });

  setInterval(() => {
    try {
      const files = fs.readdirSync(DISCOVERY_DIR);
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        if (f === `${PEER_ID}.json`) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DISCOVERY_DIR, f), "utf-8"));
          if (!data.peerId) continue;
          if (Date.now() - data.timestamp > 30000) continue;
          if (!localPeers.has(data.peerId)) {
            localPeers.set(data.peerId, { ...data, lastSeen: data.timestamp, address: "127.0.0.1" });
            if (!peers.has(data.peerId)) {
              registerWithDiscoveredPeer(data, "127.0.0.1").catch(() => {});
            }
          } else {
            localPeers.get(data.peerId).lastSeen = Date.now();
          }
        } catch {}
      }
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        if (f === `${PEER_ID}.json`) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DISCOVERY_DIR, f), "utf-8"));
          if (Date.now() - data.timestamp > 60000) {
            fs.unlinkSync(path.join(DISCOVERY_DIR, f));
          }
        } catch {
          try { fs.unlinkSync(path.join(DISCOVERY_DIR, f)); } catch {}
        }
      }
    } catch {}
  }, 5000);

  console.log(`  [discovery] File-based discovery in ${DISCOVERY_DIR}`);
}

// ── Registration with Discovered Peer ──────────────────────────────────────────

async function registerWithDiscoveredPeer(data, address) {
  try {
    const res = await httpReq("POST", address, data.port || config.PORT, "/register", {
      id: PEER_ID, hostname: os.hostname(), platform: process.platform,
      version: "0.1.0", address: LOCAL_IPS[0] || "127.0.0.1",
      port: config.PORT, relayPort: config.RELAY_PORT, mode: MODE,
      services: hostedServices.map(s => s.name),
    });
    if (res?.status === "ok") {
      console.log(`  [discovery] Registered with local peer ${data.peerId.slice(0, 16)}… at ${address}:${data.port || config.PORT}`);
    }
  } catch {}
}

// ── Banner ─────────────────────────────────────────────────────────────────────

function printBanner() {
  const isRelay = MODE === "relay" || MODE === "auto";

  console.log();
  console.log(`  ╔══════════════════════════════════════════════════╗`);
  console.log(`  ║         dweb — P2P Dev + Hosting Platform       ║`);
  console.log(`  ║         ───────────────────────────────          ║`);
  console.log(`  ║  Instance : ${String(config.INSTANCE_NAME).padEnd(37)}║`);
  console.log(`  ║  Peer ID  : ${PEER_ID.padEnd(37)}║`);
  console.log(`  ║  Mode     : ${MODE.padEnd(37)}║`);
  console.log(`  ╚══════════════════════════════════════════════════╝`);
  console.log(`  ╔══════════════════════════════════════════════════╗`);
  if (isRelay) {
    console.log(`  ║  P2P Relay    : http://0.0.0.0:${String(config.RELAY_PORT).padEnd(5)}              ║`);
  }
  console.log(`  ║  Web IDE      : http://0.0.0.0:${String(config.PORT).padEnd(5)}              ║`);
  console.log(`  ║  TCP Proxy    : tcp://0.0.0.0:${String(config.TCP_RELAY_PORT).padEnd(5)}              ║`);
  console.log(`  ║                                                    ║`);
  console.log(`  ║  Network access:                                    ║`);
  for (const ip of LOCAL_IPS) {
    console.log(`  ║    http://${ip}:${config.PORT}/`.padEnd(52) + `║`);
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
  console.log(`  ║    /api/p2p/receive   — P2P file receive          ║`);
  console.log(`  ║    /api/p2p/received  — Received P2P files        ║`);
  console.log(`  ║    /api/p2p/discover-local  — Local peer discover ║`);
  console.log(`  ║    /api/tor/status       — Tor network status      ║`);
  console.log(`  ║    /api/instance/spawn   — Spawn new dweb instance║`);
  console.log(`  ║    /              — dweb Web IDE frontend          ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝`);
  console.log(`  Upstream relay: ${require("./config.cjs").UPSTREAM_RELAY || "(none — this is a relay node)"}`);
  console.log(`  Press Ctrl+C to stop.\n`);
}

function getDiscoverySocket() { return discoverySocket; }
function isFileDiscoveryStarted() { return fileDiscoveryStarted; }

module.exports = {
  startLocalDiscovery, startFileDiscovery, registerWithDiscoveredPeer,
  printBanner, getDiscoverySocket, isFileDiscoveryStarted,
};
