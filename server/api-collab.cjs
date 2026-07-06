// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Collaboration API (/dweb-status, /collab/*, /welcome, /welcome/source)
// ═══════════════════════════════════════════════════════════════════════════════

const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { json, parseBody, serveFile, getLocalIPs } = require("./helpers.cjs");
const config = require("./config.cjs");
const { MODE, START_TIME, SERVER_ID, UPSTREAM_RELAY, PEER_ID } = config;
const { hostedServices, sharedSessions, peerServices, peers,
        relayConnected, relayError, addHostedService, shareSession } = require("./state.cjs");

function registerRoutes(router) {
  // DWEB STATUS
  router.get("/dweb-status", (req, res) => {
    json(res, 200, {
      status: "ok", peerId: PEER_ID, hostname: os.hostname(),
      platform: process.platform, localIPs: getLocalIPs(),
      port: config.PORT, relayPort: config.RELAY_PORT, mode: MODE,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      relayConnected, upstreamRelay: UPSTREAM_RELAY,
      relayError, peersOnline: peers.size,
      hostedServices: hostedServices.length,
      sharedSessions: sharedSessions.length,
      services: ["frontend", "p2p-relay", "hosting", "collab"],
    });
  });

  // HOSTED SERVICES
  router.get("/collab/services", (req, res) => {
    json(res, 200, { status: "ok", count: hostedServices.length, services: hostedServices });
  });

  router.post("/collab/services", async (req, res) => {
    const body = await parseBody(req);
    const svc = addHostedService(body.name, body.type, body.port, body.url);
    json(res, 201, { status: "ok", service: svc });
  });

  // SHARED SESSIONS
  router.get("/collab/sessions", (req, res) => {
    json(res, 200, { status: "ok", count: sharedSessions.length, sessions: sharedSessions });
  });

  router.post("/collab/sessions", async (req, res) => {
    const body = await parseBody(req);
    const session = shareSession(body.id || crypto.randomUUID(), body.type, body.title, body.data);
    json(res, 201, { status: "ok", session });
  });

  // PEER SERVICES
  router.get("/collab/peer-services", (req, res) => {
    const all = [];
    for (const [peerId, svcs] of peerServices) {
      for (const svc of svcs) all.push({ ...svc, peerId });
    }
    json(res, 200, { status: "ok", count: all.length, services: all });
  });

  // WELCOME PAGE
  router.get("/welcome", (req, res) => {
    const welcomePath = path.join(__dirname, "..", "welcome", "welcome.html");
    serveFile(res, welcomePath);
  });

  router.get("/welcome/source", (req, res) => {
    const welcomePath = path.join(__dirname, "..", "welcome", "welcome.html");
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(fs.readFileSync(welcomePath));
  });
}

module.exports = { registerRoutes };
