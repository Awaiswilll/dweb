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
const os = require("os");

const config = require("./config.cjs");
const { MODE, PORT, RELAY_PORT, UPSTREAM_RELAY, PEER_ID, INSTANCE_NAME, SERVER_ID, LOCAL_IPS } = config;
const { findFreePort, httpReq } = require("./helpers.cjs");
const { peers, hostedServices, sharedSessions, tcpRelays, contacts,
        addHostedService, cleanupStalePeers, setRelayConnected, setRelayError,
        restoreContacts, refreshAllContacts } = require("./state.cjs");
const { createRouter } = require("./router.cjs");
const { startTCPRelay } = require("./relay-tcp.cjs");
const { startLocalDiscovery, startFileDiscovery, printBanner, getDiscoverySocket } = require("./discovery.cjs");
const { restoreServices } = require("./api-services.cjs");
const { restoreDomains, restorePeers } = require("./state.cjs");

// ── Main ───────────────────────────────────────────────────────────────────────

const isRelayMode = MODE === "relay" || MODE === "auto";
const isPeerMode = MODE === "peer" || MODE === "auto";

// Build the router
let relayConnected = false;
let relayError = null;

// Register with upstream relay
async function registerWithUpstream() {
  if (!UPSTREAM_RELAY) return;
  const [host, portStr] = UPSTREAM_RELAY.split(":");
  const port = parseInt(portStr, 10) || RELAY_PORT;
  try {
    const res = await httpReq("POST", host, port, "/register", {
      id: PEER_ID, hostname: os.hostname(), platform: process.platform,
      version: "0.1.0", address: "127.0.0.1",
      port: PORT, relayPort: RELAY_PORT,
      mode: "p2p-visible", services: hostedServices.map(s => s.name),
    });
    relayConnected = res?.status === "ok";
    relayError = relayConnected ? null : "registration failed";
    setRelayConnected(relayConnected);
    setRelayError(relayError);
    if (relayConnected) console.log(`  [upstream] Registered with ${UPSTREAM_RELAY}`);
  } catch (e) {
    relayConnected = false;
    relayError = e.message;
    setRelayConnected(false);
    setRelayError(e.message);
    console.log(`  [upstream] Cannot reach ${UPSTREAM_RELAY}`);
  }
}

async function heartbeatUpstream() {
  if (!UPSTREAM_RELAY || !relayConnected) return;
  const [host, portStr] = UPSTREAM_RELAY.split(":");
  try { await httpReq("POST", host, parseInt(portStr, 10) || RELAY_PORT, "/heartbeat", { peerId: PEER_ID }); }
  catch { relayConnected = false; setRelayConnected(false); }
}

async function main() {
  // Resolve ports dynamically
  config.PORT = await findFreePort("PORT", 49737);
  config.RELAY_PORT = await findFreePort("RELAY_PORT", 49736);
  config.TCP_RELAY_PORT = await findFreePort("TCP_PORT", 49738);

  const { PORT, RELAY_PORT, TCP_RELAY_PORT } = config;
  console.log(`  Ports: Web=${PORT}, Relay=${RELAY_PORT}, TCP=${TCP_RELAY_PORT}`);

  // Create HTTP server with the router
  const router = createRouter();
  const server = http.createServer((req, res) => router.dispatch(req, res).catch(e => {
    if (!res.headersSent) {
      const { json } = require("./helpers.cjs");
      json(res, 500, { error: e.message });
    }
  }));

  let webServer = null;

  function startServer() {
    if (isRelayMode) {
      server.listen(RELAY_PORT, "0.0.0.0", () => {
        console.log(`  P2P Relay : http://0.0.0.0:${RELAY_PORT}`);
      });
      webServer = http.createServer((req, res) => router.dispatch(req, res).catch(e => {
        if (!res.headersSent) {
          const { json } = require("./helpers.cjs");
          json(res, 500, { error: e.message });
        }
      }));
      webServer.listen(PORT, "0.0.0.0", () => {});
      return webServer;
    } else {
      server.listen(PORT, "0.0.0.0", () => {});
      webServer = server;
      return server;
    }
  }

  // Start all server components
  startTCPRelay();
  startLocalDiscovery();
  startFileDiscovery();
  startServer();

  // Auto-register default services
  addHostedService("My Static Website", "Static Site", PORT, `http://localhost:${PORT}/welcome`);
  addHostedService("File Share", "File Browser", PORT, `http://localhost:${PORT}/fileshare`);
  console.log(`  [services] Auto-registered: "My Static Website" → /welcome`);
  console.log(`  [services] Auto-registered: "File Share" → /fileshare`);

  // Auto-start managed services so they appear in /api/services
  try {
    const { registerRoutes: svcRoutes, runningServices } = require("./api-services.cjs");
    if (!runningServices.has("My Static Website")) {
      const resp = await fetch(`http://localhost:${PORT}/api/service/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Static Website", type: "Static Site", port: 30999 }),
      });
      if (resp.ok) console.log(`  [services] Auto-started: "My Static Website" on port 30999`);
    }
    if (!runningServices.has("File Share")) {
      const resp = await fetch(`http://localhost:${PORT}/api/service/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "File Share", type: "File Browser", port: 30998 }),
      });
      if (resp.ok) console.log(`  [services] Auto-started: "File Share" on port 30998`);
    }
  } catch (e) {
    console.log(`  [services] Auto-start failed: ${e.message}`);
  }

  printBanner();

  // Restore managed services from disk
  restoreServices();

  // Restore domain registry from disk
  restoreDomains();

  // Restore peer registry from disk (survives restarts)
  restorePeers();

  // Restore contacts from disk (persistent peer archive)
  const restoredContacts = restoreContacts();
  if (restoredContacts > 0) {
    console.log(`  [contacts] ${contacts.size} past contact(s) remembered`);
  }

  // Auto-register this instance as a peer so it always appears in P2P discovery
  require("./state.cjs").peers.set(PEER_ID, new (require("./state.cjs").PeerRecord)(PEER_ID, {
    address: LOCAL_IPS[0] || "127.0.0.1",
    port: PORT,
    relayPort: RELAY_PORT,
    hostname: os.hostname(),
    platform: process.platform,
    version: "0.1.0",
    mode: "p2p-visible",
    services: hostedServices.map(s => s.name),
  }));
  require("./state.cjs").savePeers();

  // Register with upstream relay
  if (UPSTREAM_RELAY && isPeerMode) {
    await registerWithUpstream();
    setInterval(heartbeatUpstream, 30000);
  }

  // Periodic peer cleanup (archives stale peers to contacts)
  setInterval(cleanupStalePeers, 15000);

  // Periodic contact refresh (ping archived contacts to see if they're back)
  setInterval(refreshAllContacts, 60000);

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
    const sock = getDiscoverySocket();
    if (sock) { try { sock.close(); } catch {} }
    server.close();
    if (webServer && webServer !== server) webServer.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => process.exit(0));
}

main().catch(err => {
  console.error(`  [fatal] Failed to start dweb: ${err.message}`);
  process.exit(1);
});

// Export key info for programmatic use
module.exports = {
  PEER_ID, SERVER_ID,
  get PORT() { return config.PORT; },
  get RELAY_PORT() { return config.RELAY_PORT; },
  get TCP_RELAY_PORT() { return config.TCP_RELAY_PORT; },
  peers: require("./state.cjs").peers,
  hostedServices: require("./state.cjs").hostedServices,
  sharedSessions: require("./state.cjs").sharedSessions,
};
