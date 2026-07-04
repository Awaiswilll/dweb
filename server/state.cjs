// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — PeerRecord, State Maps, & Signal Store
// ═══════════════════════════════════════════════════════════════════════════════

const { PEER_TTL_MS } = require("./config.cjs");

// ─── State Maps ────────────────────────────────────────────────────────────────

const peers       = new Map();
const signals     = new Map();
const hostedServices = [];
const sharedSessions = [];
const peerServices = new Map();
const tcpRelays   = new Map();
const localPeers  = new Map();

// Relay connection state
let relayConnected = false;
let relayError = null;

// ─── PeerRecord ───────────────────────────────────────────────────────────────

class PeerRecord {
  constructor(id, info = {}) {
    this.id = id;
    this.publicKey = info.publicKey || id;
    this.address = info.address || "0.0.0.0";
    this.port = info.port || 0;
    this.hostname = info.hostname || "";
    this.platform = info.platform || process.platform;
    this.version = info.version || "0.1.0";
    this.mode = info.mode || "p2p-visible";
    this.services = info.services || [];
    this.relayPort = info.relayPort || 0;
    this.firstSeen = Date.now();
    this.lastSeen = Date.now();
  }
  get isStale() { return (Date.now() - this.lastSeen) > PEER_TTL_MS; }
  touch() { this.lastSeen = Date.now(); }
}

// ─── Signal Store ──────────────────────────────────────────────────────────────

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

// ─── Collaboration Helpers ─────────────────────────────────────────────────────

function addHostedService(name, type, port, url) {
  const existing = hostedServices.findIndex(s => s.name === name);
  const svc = { name, type, port, url: url || `http://127.0.0.1:${port}`, added: Date.now() };
  if (existing >= 0) hostedServices[existing] = svc;
  else hostedServices.push(svc);
  return svc;
}

function removeHostedService(name) {
  const idx = hostedServices.findIndex(s => s.name === name);
  if (idx >= 0) {
    const removed = hostedServices.splice(idx, 1)[0];
    console.log(`  [state] Removed hosted service: "${name}"`);
    return removed;
  }
  return null;
}

function shareSession(sessionId, type, title, data) {
  const existing = sharedSessions.findIndex(s => s.id === sessionId);
  const session = { id: sessionId, type, title, data, peerId: "", shared: Date.now() };
  if (existing >= 0) sharedSessions[existing] = session;
  else sharedSessions.push(session);
  if (sharedSessions.length > 50) sharedSessions.splice(0, sharedSessions.length - 50);
  return session;
}

// ─── Cleanup ───────────────────────────────────────────────────────────────────

function cleanupStalePeers() {
  let removed = 0;
  for (const [id, peer] of peers) {
    if (peer.isStale) { peers.delete(id); signals.delete(id); removed++; }
  }
  if (removed > 0) console.log(`  [cleanup] Removed ${removed} stale peers`);
}

module.exports = {
  peers, signals, hostedServices, sharedSessions, peerServices, tcpRelays, localPeers,
  relayConnected, relayError,
  PeerRecord, storeSignal, popSignals, addHostedService, removeHostedService, shareSession, cleanupStalePeers,
  setRelayConnected(v) { relayConnected = v; },
  setRelayError(v) { relayError = v; },
};
