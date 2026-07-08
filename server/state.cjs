// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — PeerRecord, State Maps, Domain Registry & Signal Store
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const os = require("os");
const { PEER_TTL_MS } = require("./config.cjs");
const { peerToJSON } = require("./helpers.cjs");

// ─── State Maps ────────────────────────────────────────────────────────────────

const peers       = new Map();
const signals     = new Map();
const hostedServices = [];
const sharedSessions = [];
const peerServices = new Map();
const tcpRelays   = new Map();
const localPeers  = new Map();
const contacts    = new Map(); // PeerId -> contact record (archived stale peers)

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

// ─── Peer Persistence (survives server restart) ────────────────────────────────

const PEERS_FILE = path.join(os.tmpdir(), "dweb-peers.json");

function savePeers() {
  try {
    const data = [];
    for (const [id, peer] of peers) {
      data.push({ id, ...peerToJSON(peer) });
    }
    fs.writeFileSync(PEERS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.log("  [state] Failed to save peers:", e.message);
  }
}

function restorePeers() {
  try {
    if (!fs.existsSync(PEERS_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(PEERS_FILE, "utf8"));
    if (!Array.isArray(data)) return 0;
    let restored = 0;
    for (const entry of data) {
      if (!entry.id || peers.has(entry.id)) continue;
      peers.set(entry.id, new PeerRecord(entry.id, entry));
      restored++;
    }
    if (restored > 0) console.log(`  [state] Restored ${restored} peers from disk`);
    return restored;
  } catch (e) {
    console.log("  [state] Failed to restore peers:", e.message);
    return 0;
  }
}

// ─── Tor State ─────────────────────────────────────────────────────────────────

let torEnabled = false;
const TOR_PROXY = "socks5://127.0.0.1:9050";

function setTorEnabled(v) { torEnabled = v; }
function isTorEnabled() { return torEnabled; }
function getTorProxy() { return TOR_PROXY; }

// ─── Contacts (Persistent Peer Archive) ────────────────────────────────────────
//
// Contacts are peers that were once online but have gone stale. Instead of
// deleting them, we archive them as contacts so we can remember past
// connections and periodically try to re-establish contact.
//
// When a peer re-appears, it is promoted back to the live `peers` map.

const CONTACTS_FILE = path.join(os.tmpdir(), "dweb-contacts.json");

/**
 * Archive a stale peer: move from `peers` to `contacts` and persist.
 * Returns the contact record, or null if the peer didn't exist.
 */
function archivePeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return null;
  // Don't archive ourselves
  if (peerId === require("./config.cjs").PEER_ID) return null;
  peers.delete(peerId);
  signals.delete(peerId);
  // Mark as archived with the last-known info
  const contact = {
    ...peerToJSON(peer),
    archivedAt: Date.now(),
    archived: true,
  };
  contacts.set(peerId, contact);
  saveContacts();
  savePeers();
  return contact;
}

/**
 * Promote a contact back to the live peers map.
 * Returns the new PeerRecord, or null if no contact found.
 */
function promoteContact(peerId) {
  const contact = contacts.get(peerId);
  if (!contact) return null;
  contacts.delete(peerId);
  const peer = new PeerRecord(peerId, contact);
  peer.touch();
  peers.set(peerId, peer);
  savePeers();
  saveContacts();
  console.log(`  [contacts] Promoted ${peerId.slice(0, 16)}… back to live peers`);
  return peer;
}

/**
 * Permanently forget a contact.
 */
function forgetContact(peerId) {
  const existed = contacts.delete(peerId);
  if (existed) saveContacts();
  return existed;
}

/**
 * List all archived contacts.
 */
function listContacts() {
  const result = [];
  for (const [id, contact] of contacts) {
    result.push({ peerId: id, ...contact });
  }
  return result;
}

/**
 * Get contact count.
 */
function contactCount() {
  return contacts.size;
}

/**
 * Save contacts to disk.
 */
function saveContacts() {
  try {
    const data = [];
    for (const [id, contact] of contacts) {
      data.push({ peerId: id, ...contact });
    }
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.log("  [contacts] Failed to save contacts:", e.message);
  }
}

/**
 * Restore contacts from disk.
 */
function restoreContacts() {
  try {
    if (!fs.existsSync(CONTACTS_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf8"));
    if (!Array.isArray(data)) return 0;
    let restored = 0;
    for (const entry of data) {
      const id = entry.peerId;
      if (!id || contacts.has(id) || peers.has(id)) continue;
      const contact = { ...entry };
      delete contact.peerId;
      contact.archived = true;
      contacts.set(id, contact);
      restored++;
    }
    if (restored > 0) console.log(`  [contacts] Restored ${restored} contacts from disk`);
    return restored;
  } catch (e) {
    console.log("  [contacts] Failed to restore contacts:", e.message);
    return 0;
  }
}

/**
 * Try to ping a contact's last-known address to see if they're back online.
 * If reachable, promote them back to live peers.
 * Returns true if the contact responded.
 */
async function refreshContact(peerId, contact) {
  const addr = contact.address || "127.0.0.1";
  const port = contact.port;
  if (!port) return false;
  try {
    const { httpReq } = require("./helpers.cjs");
    const res = await httpReq("GET", addr, port, "/ping");
    if (res && res.status === "ok") {
      console.log(`  [contacts] ${peerId.slice(0, 16)}… responded to refresh ping — promoting`);
      promoteContact(peerId);
      return true;
    }
  } catch {
    // Not reachable — keep in contacts
  }
  return false;
}

/**
 * Refresh all contacts: ping each one and promote those that respond.
 */
async function refreshAllContacts() {
  let refreshed = 0;
  let failed = 0;
  for (const [id, contact] of contacts) {
    if (await refreshContact(id, contact)) {
      refreshed++;
    } else {
      failed++;
    }
  }
  if (refreshed > 0 || failed > 0) {
    console.log(`  [contacts] Refresh complete: ${refreshed} reconnected, ${failed} still offline`);
  }
}

// ─── Cleanup (archives stale peers instead of deleting) ────────────────────────

function cleanupStalePeers() {
  let archived = 0;
  for (const [id, peer] of peers) {
    if (peer.isStale) {
      const result = archivePeer(id);
      if (result) archived++;
    }
  }
  if (archived > 0) {
    console.log(`  [contacts] Archived ${archived} stale peer(s)`);
  }
}

// ─── Domain Registry ──────────────────────────────────────────────────────────

const domainRegistry = new Map(); // name -> DomainRecord
const DOMAINS_FILE = path.join(os.tmpdir(), "dweb-domains.json");

function saveDomains() {
  try {
    const data = [];
    for (const [name, rec] of domainRegistry) {
      data.push({ ...rec, name });
    }
    fs.writeFileSync(DOMAINS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.log("  [domains] Failed to save domains:", e.message);
  }
}

function restoreDomains() {
  try {
    if (!fs.existsSync(DOMAINS_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(DOMAINS_FILE, "utf8"));
    if (!Array.isArray(data)) return 0;
    let restored = 0;
    for (const entry of data) {
      const name = entry.name;
      if (!name || domainRegistry.has(name)) continue;
      const rec = { ...entry };
      delete rec.name;
      domainRegistry.set(name, rec);
      restored++;
    }
    if (restored > 0) console.log("  [domains] Restored " + restored + " domains from disk");
    return restored;
  } catch (e) {
    console.log("  [domains] Failed to restore domains:", e.message);
    return 0;
  }
}

function getDomainRecord(name) {
  return domainRegistry.get(name) || null;
}

function setDomainRecord(name, record) {
  domainRegistry.set(name, record);
  saveDomains();
  return record;
}

function deleteDomainRecord(name) {
  const existed = domainRegistry.delete(name);
  if (existed) saveDomains();
  return existed;
}

function listDomainRecords() {
  const result = [];
  for (const [name, rec] of domainRegistry) {
    result.push({ ...rec, name });
  }
  return result;
}

module.exports = {
  peers, signals, hostedServices, sharedSessions, peerServices, tcpRelays, localPeers,
  contacts,
  relayConnected, relayError,
  PeerRecord, storeSignal, popSignals, addHostedService, removeHostedService, shareSession, cleanupStalePeers,
  setRelayConnected(v) { relayConnected = v; },
  setRelayError(v) { relayError = v; },
  // Peer persistence
  savePeers, restorePeers,
  // Contacts (persistent peer archive)
  archivePeer, promoteContact, forgetContact, listContacts, contactCount,
  saveContacts, restoreContacts, refreshContact, refreshAllContacts,
  // Domain registry
  domainRegistry, getDomainRecord, setDomainRecord, deleteDomainRecord, listDomainRecords,
  restoreDomains, saveDomains,
  // Tor state
  setTorEnabled, isTorEnabled, getTorProxy,
};
