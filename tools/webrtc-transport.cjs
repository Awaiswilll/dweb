// ─── WebRTC Transport (Layer 2) ──────────────────────────────────
//
// This module is the "attempt a real direct connection" half of the
// transport strategy. It uses node-datachannel (a native binding to
// libdatachannel) to run actual WebRTC — ICE gathering, STUN-based NAT
// traversal, DTLS, and a real SCTP data channel — from a plain Node
// process with no browser involved.
//
// The relay is used ONLY to exchange signaling messages (SDP offer/
// answer and ICE candidates) via the existing /signal mechanism. Once
// a data channel opens, the relay is completely out of the loop for
// that pair of peers — traffic flows directly between them.
//
// If a direct connection cannot be established within CONNECT_TIMEOUT_MS
// (e.g. both peers are behind symmetric NAT), connect() resolves to
// null. Callers are expected to fall back to relay-mediated delivery
// in that case — this module deliberately does not do that fallback
// itself, so the "direct failed" signal stays visible to the caller
// rather than being silently absorbed.
//
// Wire format: every message on the data channel is JSON of the shape
//   { __dweb: true, kind, payload, reqId?, isResponse?, ok? }
// `kind` + no `reqId`             → fire-and-forget (e.g. chat)
// `kind` + `reqId`, no isResponse → a request expecting a reply
// `kind` + `reqId` + isResponse   → the reply to that request
// This lets one shared data channel per peer carry chat, domain
// resolution, and future request/response features without each one
// inventing its own framing.

const EventEmitter = require("events");
const crypto = require("crypto");

const ICE_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];
const CONNECT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 8000;

function createWebRTCManager({ peerId, sendSignal }) {
  let nd;
  try {
    nd = require("node-datachannel");
  } catch (e) {
    // Native module not available on this platform/build — every
    // connect() attempt will resolve to null immediately, so callers
    // fall back to relay-mediated delivery without needing to know why.
    return {
      available: false,
      connect: async () => null,
      handleSignal: () => {},
      getActiveChannel: () => null,
      onRequest: () => {},
      closeAll: () => {},
      events: new EventEmitter(),
    };
  }

  const events = new EventEmitter();
  const requestHandlers = new Map(); // kind → async (payload, fromPeerId) => responsePayload
  // peerId -> { pc, dc, state, pendingCandidates, connectResolvers, remoteDescriptionSet, pendingRequests }
  const connections = new Map();

  function onRequest(kind, handler) {
    requestHandlers.set(kind, handler);
  }

  function getOrCreateConnection(remotePeerId) {
    let conn = connections.get(remotePeerId);
    if (conn) return conn;

    const pc = new nd.PeerConnection(`${peerId}->${remotePeerId}`, { iceServers: ICE_SERVERS });
    conn = {
      pc, dc: null, state: "connecting",
      pendingCandidates: [], connectResolvers: [],
      remoteDescriptionSet: false,
      pendingRequests: new Map(), // reqId → { resolve, timer }
    };
    connections.set(remotePeerId, conn);

    pc.onLocalDescription((sdp, type) => {
      sendSignal(remotePeerId, type, sdp, null);
    });

    pc.onLocalCandidate((candidate, mid) => {
      sendSignal(remotePeerId, "candidate", null, JSON.stringify({ candidate, mid }));
    });

    pc.onStateChange((state) => {
      if (state === "failed" || state === "closed" || state === "disconnected") {
        if (conn.state !== "open") {
          conn.state = "failed";
          resolveAllPending(conn, null);
        }
      }
    });

    pc.onDataChannel((dc) => {
      // Inbound data channel — the remote side initiated.
      wireDataChannel(remotePeerId, conn, dc);
    });

    return conn;
  }

  function wireDataChannel(remotePeerId, conn, dc) {
    conn.dc = dc;
    dc.onOpen(() => {
      conn.state = "open";
      const handle = makeChannelHandle(remotePeerId, conn);
      resolveAllPending(conn, handle);
      events.emit("channelOpen", { peerId: remotePeerId });
    });
    dc.onMessage((data) => handleIncomingData(remotePeerId, conn, data));
    dc.onClosed(() => {
      conn.state = "closed";
      // Any requests still waiting on this connection can never be
      // answered now — resolve them as failed rather than leaving
      // callers hanging until their own timeout fires.
      for (const [reqId, pending] of conn.pendingRequests) {
        clearTimeout(pending.timer);
        pending.resolve({ ok: false, payload: { error: "channel closed" } });
      }
      conn.pendingRequests.clear();
      connections.delete(remotePeerId);
      events.emit("channelClosed", { peerId: remotePeerId });
    });
  }

  function handleIncomingData(remotePeerId, conn, data) {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (!msg || !msg.__dweb || !msg.kind) return;

    if (msg.isResponse) {
      const pending = conn.pendingRequests.get(msg.reqId);
      if (pending) {
        clearTimeout(pending.timer);
        conn.pendingRequests.delete(msg.reqId);
        pending.resolve({ ok: !!msg.ok, payload: msg.payload });
      }
      return;
    }

    if (msg.reqId) {
      // Incoming request — find a registered handler and reply.
      const handler = requestHandlers.get(msg.kind);
      if (!handler) {
        sendRaw(conn, { __dweb: true, kind: msg.kind, reqId: msg.reqId, isResponse: true, ok: false, payload: { error: "no handler for this request kind" } });
        return;
      }
      Promise.resolve()
        .then(() => handler(msg.payload, remotePeerId))
        .then((result) => sendRaw(conn, { __dweb: true, kind: msg.kind, reqId: msg.reqId, isResponse: true, ok: true, payload: result }))
        .catch((err) => sendRaw(conn, { __dweb: true, kind: msg.kind, reqId: msg.reqId, isResponse: true, ok: false, payload: { error: err.message } }));
      return;
    }

    // Fire-and-forget message (e.g. chat) — hand off to whoever is
    // listening for generic messages.
    events.emit("message", { peerId: remotePeerId, kind: msg.kind, payload: msg.payload });
  }

  function sendRaw(conn, obj) {
    if (conn.state !== "open" || !conn.dc) return false;
    try { conn.dc.sendMessage(JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  function resolveAllPending(conn, value) {
    const resolvers = conn.connectResolvers.splice(0, conn.connectResolvers.length);
    for (const resolve of resolvers) resolve(value);
  }

  function makeChannelHandle(remotePeerId, conn) {
    return {
      peerId: remotePeerId,
      // Fire-and-forget send (chat uses this).
      send(kind, payload) {
        return sendRaw(conn, { __dweb: true, kind, payload });
      },
      // Request/response (domain resolution, proxy fetch use this).
      // Resolves to { ok, payload } — ok:false on error/timeout/closed
      // channel, never rejects, so callers can treat "direct failed"
      // uniformly without a try/catch.
      request(kind, payload, timeoutMs = REQUEST_TIMEOUT_MS) {
        return new Promise((resolve) => {
          const reqId = crypto.randomUUID();
          const timer = setTimeout(() => {
            conn.pendingRequests.delete(reqId);
            resolve({ ok: false, payload: { error: "request timed out" } });
          }, timeoutMs);
          conn.pendingRequests.set(reqId, { resolve, timer });
          const sent = sendRaw(conn, { __dweb: true, kind, reqId, payload });
          if (!sent) {
            clearTimeout(timer);
            conn.pendingRequests.delete(reqId);
            resolve({ ok: false, payload: { error: "channel not open" } });
          }
        });
      },
      close() {
        try { conn.dc && conn.dc.close(); } catch (e) {}
        try { conn.pc && conn.pc.close(); } catch (e) {}
        connections.delete(remotePeerId);
      },
    };
  }

  // Initiate an outbound direct connection to remotePeerId. Resolves to
  // a channel handle ({send, request, close, peerId}) if a direct
  // connection is established within the timeout, or null if it isn't
  // — the timeout firing is the expected, normal outcome for peers
  // behind symmetric NAT, not an error.
  function connect(remotePeerId, { timeoutMs = CONNECT_TIMEOUT_MS } = {}) {
    const existing = connections.get(remotePeerId);
    if (existing && existing.state === "open") {
      return Promise.resolve(makeChannelHandle(remotePeerId, existing));
    }

    const conn = getOrCreateConnection(remotePeerId);

    return new Promise((resolve) => {
      conn.connectResolvers.push(resolve);

      if (!conn.dc) {
        const dc = conn.pc.createDataChannel("dweb");
        wireDataChannel(remotePeerId, conn, dc);
      }

      setTimeout(() => {
        if (conn.state !== "open") {
          resolveAllPending(conn, null);
        }
      }, timeoutMs);
    });
  }

  // Called whenever a signaling message (offer/answer/candidate) arrives
  // from the relay, addressed to us, from fromPeerId.
  function handleSignal({ fromPeerId, signalType, sdp, candidate }) {
    const conn = getOrCreateConnection(fromPeerId);

    if (signalType === "offer" && sdp) {
      conn.pc.setRemoteDescription(sdp, "offer");
      conn.remoteDescriptionSet = true;
      flushPendingCandidates(conn);
    } else if (signalType === "answer" && sdp) {
      conn.pc.setRemoteDescription(sdp, "answer");
      conn.remoteDescriptionSet = true;
      flushPendingCandidates(conn);
    } else if (signalType === "candidate" && candidate) {
      let parsed;
      try { parsed = JSON.parse(candidate); } catch (e) { return; }
      if (!conn.remoteDescriptionSet) {
        conn.pendingCandidates.push(parsed);
      } else {
        try { conn.pc.addRemoteCandidate(parsed.candidate, parsed.mid); } catch (e) { /* ignore stale candidate */ }
      }
    }
  }

  function flushPendingCandidates(conn) {
    const queued = conn.pendingCandidates.splice(0, conn.pendingCandidates.length);
    for (const parsed of queued) {
      try { conn.pc.addRemoteCandidate(parsed.candidate, parsed.mid); } catch (e) { /* ignore */ }
    }
  }

  function getActiveChannel(remotePeerId) {
    const conn = connections.get(remotePeerId);
    if (conn && conn.state === "open") return makeChannelHandle(remotePeerId, conn);
    return null;
  }

  function closeAll() {
    for (const [remotePeerId, conn] of connections) {
      try { conn.dc && conn.dc.close(); } catch (e) {}
      try { conn.pc && conn.pc.close(); } catch (e) {}
    }
    connections.clear();
  }

  return { available: true, connect, handleSignal, getActiveChannel, onRequest, closeAll, events };
}

module.exports = { createWebRTCManager };
