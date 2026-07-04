// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Public Relay API (/ping, /status, /register, /heartbeat, /discover,
//          /peer/:id, /signal)
// ═══════════════════════════════════════════════════════════════════════════════

const os = require("os");
const crypto = require("crypto");
const { json, parseBody, peerToJSON } = require("./helpers.cjs");
const { SERVER_ID, PEER_TTL_MS, MODE, START_TIME, UPSTREAM_RELAY } = require("./config.cjs");
const { peers, signals, PeerRecord, storeSignal, popSignals } = require("./state.cjs");

function registerRoutes(router) {
  // PING
  router.get("/ping", (req, res) => {
    json(res, 200, {
      status: "ok", server: "dweb",
      id: SERVER_ID, hostname: os.hostname(), platform: process.platform,
      version: "0.1.0", uptime: Math.floor((Date.now() - START_TIME) / 1000),
      mode: MODE, peers: peers.size, services: 0,
    });
  });

  // STATUS
  router.get("/status", (req, res) => {
    const modeCounts = {};
    for (const p of peers.values()) modeCounts[p.mode] = (modeCounts[p.mode] || 0) + 1;
    json(res, 200, {
      status: "ok", serverId: SERVER_ID,
      hostname: os.hostname(), version: "0.1.0",
      mode: MODE, uptime: Math.floor((Date.now() - START_TIME) / 1000),
      peersOnline: peers.size,
      upstreamRelay: UPSTREAM_RELAY,
      localIPs: [], port: 0, relayPort: 0, tcpPort: 0,
      modes: modeCounts, platform: process.platform,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      },
    });
  });

  // REGISTER
  router.post("/register", async (req, res) => {
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
    json(res, 201, { status: "ok", action: "registered", peerId: id, peersOnline: peers.size });
  });

  // HEARTBEAT
  router.post("/heartbeat", async (req, res) => {
    const body = await parseBody(req);
    const peer = peers.get(body.peerId);
    if (!peer) return json(res, 404, { error: "Unknown peer" });
    peer.touch();
    json(res, 200, { status: "ok", peersOnline: peers.size });
  });

  // DISCOVER
  router.get("/discover", (req, res) => {
    const modeFilter = req.url.searchParams.get("mode");
    const list = [];
    for (const p of peers.values()) {
      if (modeFilter && p.mode !== modeFilter) continue;
      list.push(peerToJSON(p));
    }
    json(res, 200, { status: "ok", count: list.length, peers: list });
  });

  // PEER INFO / DELETE
  router.get(/^\/peer\/(.+)$/, (req, res, match) => {
    const peer = peers.get(match[1]);
    if (!peer) return json(res, 404, { error: "Peer not found" });
    json(res, 200, { status: "ok", peer: peerToJSON(peer) });
  });

  router.delete(/^\/peer\/(.+)$/, (req, res, match) => {
    peers.delete(match[1]);
    signals.delete(match[1]);
    json(res, 200, { status: "ok", message: "Peer removed" });
  });

  // SIGNAL
  router.post("/signal", async (req, res) => {
    const body = await parseBody(req);
    if (!body.targetPeerId) return json(res, 400, { error: "Missing targetPeerId" });
    storeSignal(body.targetPeerId, {
      fromPeerId: body.fromPeerId || "anonymous", type: body.type || "unknown",
      sdp: body.sdp || null, candidate: body.candidate || null,
    });
    if (!peers.has(body.targetPeerId)) {
      console.log(`  [signal] ${(body.fromPeerId||"?").slice(0,12)} → ${body.targetPeerId.slice(0,12)} (queued, peer offline)`);
    }
    json(res, 200, { status: "ok", queued: true });
  });

  router.get("/signal", (req, res) => {
    const peerId = req.url.searchParams.get("peerId");
    if (!peerId) return json(res, 400, { error: "Missing peerId" });
    json(res, 200, { status: "ok", count: signals.get(peerId)?.length || 0, signals: popSignals(peerId) });
  });
}

module.exports = { registerRoutes };
