// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — TCP Relay Server (for proxying traffic between peers)
// ═══════════════════════════════════════════════════════════════════════════════

const net = require("net");
const config = require("./config.cjs");
const { tcpRelays, storeSignal } = require("./state.cjs");

function startTCPRelay() {
  const TCP_RELAY_PORT = config.TCP_RELAY_PORT;
  const server = net.createServer(socket => {
    let peerId = null, buffer = "";
    socket.on("data", data => {
      buffer += data.toString();
      if (!peerId) {
        const nl = buffer.indexOf("\n");
        if (nl === -1) return;
        try {
          const msg = JSON.parse(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          if (msg.type === "register" && msg.peerId) {
            peerId = msg.peerId;
            tcpRelays.set(peerId, socket);
            socket.write(JSON.stringify({ type: "registered", peerId }) + "\n");
            if (buffer.length > 0) { forwardRelayData(peerId, buffer); buffer = ""; }
          }
        } catch {}
        return;
      }
      try {
        const msg = JSON.parse(buffer);
        if (msg.type === "relay" && msg.targetPeerId) {
          const target = tcpRelays.get(msg.targetPeerId);
          if (target) target.write(JSON.stringify({ type: "relay", fromPeerId: peerId, data: msg.data }) + "\n");
          storeSignal(msg.targetPeerId, { fromPeerId: peerId, type: "relay-data", data: msg.data });
        }
      } catch {}
      buffer = "";
    });
    socket.on("close", () => { if (peerId) tcpRelays.delete(peerId); });
    socket.on("error", () => {});
  });
  server.on("error", err => {
    if (err.code === "EADDRINUSE") console.log(`  [tcp] Port ${TCP_RELAY_PORT} in use`);
    else console.log(`  [tcp] Error: ${err.message}`);
  });
  server.listen(TCP_RELAY_PORT, "0.0.0.0", () => {
    console.log(`  TCP Relay : tcp://0.0.0.0:${TCP_RELAY_PORT}`);
  });
  return server;
}

function forwardRelayData(fromPeerId, data) {
  try {
    const msg = JSON.parse(data);
    if (msg.targetPeerId) {
      const target = tcpRelays.get(msg.targetPeerId);
      if (target) target.write(JSON.stringify({ type: "relay", fromPeerId, data: msg.data }) + "\n");
    }
  } catch {}
}

module.exports = { startTCPRelay, forwardRelayData };
