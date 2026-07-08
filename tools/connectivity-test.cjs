/**
 * dweb Connectivity Test Tool
 * ============================
 * Tests network connectivity between two dweb instances.
 *
 * Usage:
 *   Server mode (run on Machine A):
 *     node connectivity-test.js --server [--port 49737]
 *
 *   Client mode (run on Machine B):
 *     node connectivity-test.js --client 192.168.1.100:49737
 *
 *   Interactive mode (both machines):
 *     node connectivity-test.js
 */

const http = require("http");
const os = require("os");
const MOVIES = require("../server/movies.cjs");

/* ─── Config ────────────────────────────────────────────── */
const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || process.argv[process.argv.indexOf("--port") + 1], 10) || 49737;
const IS_SERVER = process.argv.includes("--server");
const CLIENT_TARGET = process.argv.includes("--client")
  ? process.argv[process.argv.indexOf("--client") + 1]
  : null;

/* ─── Utilities ─────────────────────────────────────────── */
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push({ name, address: iface.address, mac: iface.mac });
      }
    }
  }
  return ips;
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

function log(prefix, msg, color = "") {
  const ts = timestamp();
  if (color) {
    console.log(`${ts} ${color}${prefix}\x1b[0m ${msg}`);
  } else {
    console.log(`${ts} ${prefix} ${msg}`);
  }
}

/* ─── Server ────────────────────────────────────────────── */
function startServer(port) {
  const server = http.createServer((req, res) => {
    // CORS headers so browser clients can connect too
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const clientIP = req.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
    const clientPort = req.socket.remotePort || 0;

    if (req.url === "/ping" || req.url === "/") {
      const data = JSON.stringify({
        status: "ok",
        app: "dweb-connectivity-test",
        version: "1.0.0",
        timestamp: Date.now(),
        server: {
          hostname: os.hostname(),
          platform: os.platform(),
          uptime: Math.floor(process.uptime()),
        },
        client: {
          ip: clientIP,
          port: clientPort,
        },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
      log("← PING", `from ${clientIP}:${clientPort}`, "\x1b[36m");
      return;
    }

    if (req.url === "/dweb-status") {
      const data = JSON.stringify({
        status: "ok",
        app: "dweb",
        peer_id: `dweb-${MOVIES[Math.floor(Math.random() * MOVIES.length)]}-${MOVIES[Math.floor(Math.random() * MOVIES.length)]}`,
        hostname: os.hostname(),
        addresses: getLocalIPs().map(i => i.address),
        port: port,
        services: [],
        uptime: Math.floor(process.uptime()),
        mode: "p2p-visible",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
      log("← STATUS", `from ${clientIP}:${clientPort}`, "\x1b[35m");
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, "0.0.0.0", () => {
    const localIPs = getLocalIPs();
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║     dweb Connectivity Test — SERVER MODE       ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    console.log(`  Hostname : ${os.hostname()}`);
    console.log(`  Platform : ${os.platform()} ${os.release()}`);
    console.log(`  PID      : ${process.pid}`);
    console.log("");
    console.log("  Listening on:");
    console.log(`    ${localIPs.map(i => `http://${i.address}:${port}`).join("\n    ")}`);
    console.log(`    http://127.0.0.1:${port}`);
    console.log("");
    console.log("  Endpoints:");
    console.log(`    GET /ping        — health check`);
    console.log(`    GET /dweb-status — dweb instance info`);
    console.log("");
    console.log("  ⏳ Waiting for connections...");
    console.log("");

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n  Shutting down...");
      server.close();
      process.exit(0);
    });
  });

  // Periodic status log
  setInterval(() => {
    server.getConnections((err, count) => {
      if (!err && count > 0) {
        log("ℹ ACTIVE", `${count} connection(s)`, "\x1b[33m");
      }
    });
  }, 30000);
}

/* ─── Client ────────────────────────────────────────────── */
async function runClient(target) {
  const [host, portStr] = target.split(":");
  const port = parseInt(portStr, 10) || 49737;

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     dweb Connectivity Test — CLIENT MODE       ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Target    : ${host}:${port}`);
  console.log(`  Local IPs : ${getLocalIPs().map(i => i.address).join(", ")}`);
  console.log(`  Hostname  : ${os.hostname()}`);
  console.log("");

  // Test types to run
  const tests = [
    { name: "HTTP Ping", url: `http://${host}:${port}/ping` },
    { name: "dweb Status", url: `http://${host}:${port}/dweb-status` },
  ];

  let allPassed = true;

  for (const test of tests) {
    process.stdout.write(`  Testing ${test.name}... `);
    try {
      const start = Date.now();
      const resp = await fetch(test.url, { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      const data = await resp.json();

      if (resp.ok && data.status === "ok") {
        const latencyStr = `${latency}ms`.padStart(6);
        console.log(`\x1b[32m✓ PASSED\x1b[0m  (${latencyStr})`);
        console.log(`     Server: ${data.server?.hostname || data.hostname || "unknown"}`);
        if (data.addresses) {
          console.log(`     IPs:    ${data.addresses.join(", ")}`);
        }
        if (data.client) {
          console.log(`     Your IP: ${data.client.ip}`);
        }
        if (data.peer_id) {
          console.log(`     Peer ID: ${data.peer_id}`);
        }
      } else {
        console.log(`\x1b[31m✗ FAILED\x1b[0m  (unexpected response)`);
        console.log(`     ${JSON.stringify(data)}`);
        allPassed = false;
      }
    } catch (err) {
      console.log(`\x1b[31m✗ FAILED\x1b[0m  (${err.message || err.code || err})`);
      if (err.code === "ECONNREFUSED") {
        console.log(`     → Connection refused. Is the server running on ${host}:${port}?`);
      } else if (err.code === "ETIMEDOUT" || err.name === "TimeoutError") {
        console.log(`     → Connection timed out after 5s. Check firewall / network.`);
      } else if (err.code === "ENOTFOUND") {
        console.log(`     → Host not found: ${host}. Check the address.`);
      }
      allPassed = false;
    }
  }

  // Continuous ping test
  console.log("");
  if (allPassed) {
    console.log("  ✅ Both tests passed! Running continuous ping...");
    console.log("     (press Ctrl+C to stop)");
    console.log("");
    let count = 0;
    const ping = async () => {
      while (true) {
        try {
          const start = Date.now();
          const resp = await fetch(`http://${host}:${port}/ping`, { signal: AbortSignal.timeout(3000) });
          const latency = Date.now() - start;
          const data = await resp.json();
          const clientIP = data.client?.ip || "?";
          count++;
          process.stdout.write(`\r  [${String(count).padStart(4)}] Ping: ${String(latency).padStart(4)}ms  |  Server: ${data.server?.hostname || "?"}  |  Your IP: ${clientIP}  `);
          await new Promise(r => setTimeout(r, 2000));
        } catch {
          process.stdout.write(`\r  [${String(count).padStart(4)}] \x1b[31mConnection lost\x1b[0m  `);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    };
    ping();
  } else {
    console.log("  ❌ Some tests failed. Check the troubleshooting below.");
    console.log("");
    printTroubleshooting(host, port);
  }
}

/* ─── Interactive Mode ─────────────────────────────────── */
function interactiveMode() {
  const localIPs = getLocalIPs();
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     dweb Connectivity Test — INTERACTIVE       ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log("  This machine:");
  console.log(`    Hostname : ${os.hostname()}`);
  console.log(`    Platform : ${os.platform()} ${os.release()}`);
  console.log(`    Local IPs:`);
  localIPs.forEach(ip => console.log(`      ${ip.address}  (${ip.name})`));
  console.log("");

  const rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("  Choose a mode:");
  console.log("    1) Start as SERVER (wait for connections)");
  console.log("    2) Connect as CLIENT to another machine");
  console.log("    3) Show this machine's info only");
  console.log("");

  rl.question("  Enter choice (1-3): ", (answer) => {
    rl.close();
    switch (answer.trim()) {
      case "1":
        startServer(PORT);
        break;
      case "2":
        const rl2 = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        console.log("");
        rl2.question("  Enter target address (IP:port): ", (addr) => {
          rl2.close();
          if (addr) {
            runClient(addr.trim());
          } else {
            console.log("  No address entered. Exiting.");
            process.exit(0);
          }
        });
        break;
      case "3":
        console.log("  Info only. Exiting.");
        process.exit(0);
      default:
        console.log("  Invalid choice. Exiting.");
        process.exit(1);
    }
  });
}

/* ─── Troubleshooting ──────────────────────────────────── */
function printTroubleshooting(host, port) {
  console.log("  ┌── Troubleshooting ──────────────────────────────┐");
  console.log("  │                                                  │");
  console.log("  │  1) Is the server running?                      │");
  console.log(`  │     Run on Machine A:                            │`);
  console.log(`  │     node connectivity-test.js --server           │`);
  console.log("  │                                                  │");
  console.log("  │  2) Can both machines ping each other?          │");
  console.log(`  │     On Machine B, run:                          │`);
  console.log(`  │     ping ${host}                                  │`);
  console.log("  │                                                  │");
  console.log("  │  3) Firewall blocking?                          │");
  console.log(`  │     Open port ${port} on Machine A's firewall:     │`);
  console.log("  │     Windows:                                     │");
  console.log(`  │       netsh advfirewall firewall add rule        │`);
  console.log(`  │         name=\"dweb-test\" dir=in action=allow     │`);
  console.log(`  │         protocol=tcp localport=${port}            │`);
  console.log("  │                                                  │");
  console.log("  │  4) Are both machines on the same network?       │");
  console.log("  │     If across the internet, you need port        │");
  console.log("  │     forwarding on the server's router.           │");
  console.log("  │                                                  │");
  console.log("  └──────────────────────────────────────────────────┘");
}

/* ─── Main ──────────────────────────────────────────────── */
if (IS_SERVER) {
  startServer(PORT);
} else if (CLIENT_TARGET) {
  runClient(CLIENT_TARGET);
} else {
  interactiveMode();
}
