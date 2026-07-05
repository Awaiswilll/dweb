// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — System API (/api/tor/*, /api/instance/*, /api/p2p/*, /api/publish,
//          /api/projects, /project/*)
// ═══════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const { execSync, exec } = require("child_process");
const { json, parseBody, serveFile } = require("./helpers.cjs");
const config = require("./config.cjs");
const { SHARE_DIR } = config;
const { hostedServices, localPeers, peers, addHostedService, getDomainRecord, setDomainRecord, listDomainRecords,
  setTorEnabled, isTorEnabled, getTorProxy } = require("./state.cjs");

function registerRoutes(router) {
  // ── Tor ──────────────────────────────────────────────────────────────────────

  router.get("/api/tor/status", (req, res) => {
    let installed = false, running = false;
    try { execSync("which tor 2>/dev/null", { timeout: 3000 }); installed = true; } catch {}
    try { execSync("pgrep -x tor 2>/dev/null", { timeout: 3000 }); running = true; } catch {}
    let kalitorifyAvailable = false;
    try { execSync("which kalitorify 2>/dev/null", { timeout: 3000 }); kalitorifyAvailable = true; } catch {}
    json(res, 200, {
      status: "ok", installed, running, kalitorifyAvailable,
      torEnabled: isTorEnabled(),
      torProxy: getTorProxy(),
    });
  });

  router.post("/api/tor/toggle", async (req, res) => {
    const body = await parseBody(req);
    const { action } = body;
    try {
      if (action === "start") {
        // 1) Try kalitorify (full OS-level Tor routing)
        // 2) Fall back to nohup tor (just the daemon + SOCKS5 proxy)
        try {
          await new Promise((resolve, reject) => {
            exec("sudo kalitorify --tor", { timeout: 10000 }, (err) => err ? reject(err) : resolve());
          });
        } catch {
          await new Promise((resolve, reject) => {
            exec("nohup tor > /dev/null 2>&1 &", { timeout: 5000 }, (err) => err ? reject(err) : resolve());
          });
        }
        setTorEnabled(true);
        json(res, 200, { status: "ok", message: "Tor routing enabled", torEnabled: true, torProxy: getTorProxy() });
      } else if (action === "stop") {
        try {
          await new Promise((resolve, reject) => {
            exec("sudo kalitorify --clearnet", { timeout: 10000 }, (err) => err ? reject(err) : resolve());
          });
        } catch {}
        try {
          await new Promise((resolve, reject) => {
            exec("pkill -x tor", { timeout: 3000 }, (err) => err ? reject(err) : resolve());
          });
        } catch {}
        setTorEnabled(false);
        json(res, 200, { status: "ok", message: "Tor routing disabled", torEnabled: false });
      } else {
        json(res, 400, { error: "Invalid action. Use 'start' or 'stop'." });
      }
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });

  // ── Tor Proxy Test ──────────────────────────────────────────────────────────
  router.get("/api/tor/test", async (req, res) => {
    const enabled = isTorEnabled();
    const proxy = getTorProxy();
    // Try to connect to Tor's SOCKS5 control port to verify the proxy is alive
    let proxyReachable = false;
    try {
      await new Promise((resolve, reject) => {
        const s = net.createConnection({ host: "127.0.0.1", port: 9050, timeout: 3000 }, () => {
          proxyReachable = true;
          s.end();
          resolve();
        });
        s.on("error", reject);
        s.on("timeout", () => { s.destroy(); reject(new Error("timeout")); });
      });
    } catch {}
    json(res, 200, {
      status: "ok",
      torEnabled: enabled,
      torProxy: proxy,
      proxyReachable,
      daemonRunning: proxyReachable, // SOCKS5 listener running = tor daemon is up
    });
  });

  // ── Instance Management ──────────────────────────────────────────────────────

  router.post("/api/instance/spawn", async (req, res) => {
    const body = await parseBody(req);
    const mode = body.mode || "peer";
    const getRandomPort = () => Math.floor(Math.random() * 10000) + 50000;
    function isPortFree(port) {
      return new Promise((resolve) => {
        const s = net.createServer();
        s.once("error", () => resolve(false));
        s.once("listening", () => { s.close(); resolve(true); });
        s.listen(port, "127.0.0.1");
      });
    }
    let newPort = getRandomPort();
    let attempts = 0;
    while (!(await isPortFree(newPort)) && attempts < 20) {
      newPort = getRandomPort();
      attempts++;
    }
    const instanceDir = path.resolve(__dirname, "..");
    const logFile = path.join(instanceDir, `instance-${newPort}.log`);
    const cmd = `MODE=${mode} PORT=${newPort} RELAY_PORT=${newPort + 1} nohup node ${path.join(instanceDir, "dweb.cjs")} > ${logFile} 2>&1 &`;
    try {
      execSync(cmd, { timeout: 5000 });
      await new Promise(r => setTimeout(r, 2000));
      json(res, 200, {
        status: "ok",
        port: newPort,
        url: `http://127.0.0.1:${newPort}/`,
        logFile,
        message: `New dweb instance spawned on port ${newPort}`
      });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });

  router.get("/api/instance/list", (req, res) => {
    try {
      const raw = execSync("pgrep -af 'dweb\\.cjs' 2>/dev/null || pgrep -f 'dweb.cjs' 2>/dev/null", { timeout: 3000, encoding: "utf-8" });
      const lines = raw.trim().split("\n").filter(Boolean);
      const instances = [];
      for (const line of lines) {
        try {
          // Try to get the PID (first token) and find PORT from env
          const pid = parseInt(line.trim().split(/\s+/)[0], 10);
          if (!pid) continue;
          const portLine = execSync(`cat /proc/${pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep '^PORT=' || true`, { timeout: 2000, encoding: "utf-8" }).trim();
          const port = portLine ? parseInt(portLine.replace("PORT=", ""), 10) : 0;
          instances.push({ pid, port, url: port ? `http://127.0.0.1:${port}/` : null });
        } catch {}
      }
      json(res, 200, { status: "ok", count: instances.length, instances });
    } catch (e) {
      json(res, 200, { status: "ok", count: 0, instances: [] });
    }
  });

  // ── P2P File Receive ─────────────────────────────────────────────────────────

  router.post("/api/p2p/receive", async (req, res) => {
    const body = await parseBody(req);
    const { fileName, fileData, fromPeerId, fromHostname } = body;
    if (!fileName || !fileData) {
      return json(res, 400, { error: "Missing fileName or fileData" });
    }
    const safeName = path.basename(fileName);
    const prefix = fromHostname
      ? `p2p-from-${fromHostname.replace(/[^a-zA-Z0-9-_]/g, "_")}-`
      : "p2p-from-";
    const destName = prefix + safeName;
    const destPath = path.join(SHARE_DIR, destName);
    if (!destPath.startsWith(SHARE_DIR)) return json(res, 403, { error: "Forbidden" });
    const buf = Buffer.from(fileData, "base64");
    fs.writeFileSync(destPath, buf);
    console.log(`  [p2p] Received file "${safeName}" from ${fromPeerId ? fromPeerId.slice(0, 16) : "unknown"} (${buf.length} bytes)`);
    json(res, 200, { status: "ok", fileName: destName, size: buf.length });
  });

  router.get("/api/p2p/received", (req, res) => {
    try {
      const all = fs.readdirSync(SHARE_DIR);
      const p2pFiles = all.filter(name => name.startsWith("p2p-from-")).map(name => {
        const stat = fs.statSync(path.join(SHARE_DIR, name));
        return { name, size: stat.size, added: stat.mtimeMs };
      });
      json(res, 200, { status: "ok", count: p2pFiles.length, files: p2pFiles });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });

  router.get("/api/p2p/discover-local", (req, res) => {
    const list = [];
    for (const [peerId, info] of localPeers) {
      list.push({ peerId, hostname: info.hostname, port: info.port, address: info.address, lastSeen: info.lastSeen, version: info.version, platform: info.platform });
    }
    json(res, 200, { status: "ok", count: list.length, peers: list });
  });

  // ── Publish / Projects ───────────────────────────────────────────────────────

  router.get("/api/projects", (req, res) => {
    const projectsDir = path.resolve(__dirname, "..", "projects");
    if (!fs.existsSync(projectsDir)) return json(res, 200, { status: "ok", projects: [] });
    const projects = fs.readdirSync(projectsDir).map(name => {
      const stats = fs.statSync(path.join(projectsDir, name));
      return { name, added: stats.mtimeMs, route: `/project/${name}`, url: `http://localhost:${config.PORT}/project/${name}` };
    });
    json(res, 200, { status: "ok", count: projects.length, projects });
  });

  /* ── Auto-assign .dweb domain helper ─────────────────── */
  function autoAssignDomain(projectName, port) {
    // Sanitize project name into a valid domain name
    const domainName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-")
      .slice(0, 63);

    // Must be at least 3 chars
    const finalName = domainName.length < 3 ? domainName + "-dweb" : domainName;

    // The service path on the dweb server (e.g. /project/hello-dweb)
    const routeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const servicePath = `/project/${routeName}`;

    // Check if already registered
    const existing = getDomainRecord(finalName);
    if (existing) {
      // Already registered — just update the binding
      if (port) {
        const updated = { ...existing, port, path: servicePath, address: config.LOCAL_IPS[0] || "127.0.0.1", service_name: projectName };
        setDomainRecord(finalName, updated);
        addHostedService(projectName, "Domain", port, `http://127.0.0.1:${port}`);
      }
      return { name: finalName, auto: false, path: servicePath };
    }

    // Auto-register as free tier and bind
    const crypto = require("crypto");
    const OWNER_KEY = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date();
    const expires = new Date(now.getTime() + 90 * 86400000).toISOString();
    const record = {
      owner_key: OWNER_KEY,
      address: config.LOCAL_IPS[0] || "127.0.0.1",
      path: servicePath,
      tier: "free",
      tierInfo: { label: "Free", price: 0, ttlDays: 90, permanent: false, customDomain: false, ssl: false, description: "Basic .dweb domain, 90-day expiry" },
      service_name: projectName,
      port: port || null,
      custom_domain: null,
      registered_at: now.toISOString(),
      expires_at: expires,
      auto_renew: false,
      active: true,
      paid_until: null,
      local_ip: config.LOCAL_IPS[0] || "127.0.0.1",
    };
    setDomainRecord(finalName, record);
    addHostedService(projectName, "Domain", port, `http://127.0.0.1:${port}`);
    console.log(`  [domains] Auto-registered "${finalName}.dweb" for project "${projectName}"`);
    return { name: finalName, auto: true, path: servicePath };
  }

  router.post("/api/publish", async (req, res) => {
    const body = await parseBody(req);
    const { name, type, files } = body;
    if (!name || !files || !Array.isArray(files)) {
      return json(res, 400, { error: "Missing name or files array" });
    }
    const projectDir = path.resolve(__dirname, "..", "projects", name.replace(/[^a-zA-Z0-9-_]/g, "_"));
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(projectDir, { recursive: true });
    for (const f of files) {
      const filePath = path.join(projectDir, f.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, f.content, "utf-8");
    }
    addHostedService(name, type || "Web App", config.PORT, `http://localhost:${config.PORT}/project/${name.replace(/[^a-zA-Z0-9-_]/g, "_")}`);
    const routeName = name.replace(/[^a-zA-Z0-9-_]/g, "_");
    const projectUrl = `http://localhost:${config.PORT}/project/${routeName}`;

    // Auto-assign a .dweb domain if requested (default: true)
    const autoDomain = body.auto_domain !== false;
    let domainResult = null;
    if (autoDomain) {
      domainResult = autoAssignDomain(name, config.PORT);
    }

    console.log(`  [deploy] Published "${name}" → /project/${routeName}`);
    json(res, 201, {
      status: "ok",
      project: { name, route: `/project/${routeName}`, path: projectDir },
      url: projectUrl,
      domain: domainResult ? {
        name: domainResult.name + ".dweb",
        url: `dweb://${domainResult.name}.dweb`,
        auto_registered: domainResult.auto,
      } : null,
    });
  });

  router.get(/^\/project\/([a-zA-Z0-9_-]+)(\/.*)?$/, (req, res, match) => {
    const projectName = match[1];
    let subPath = match[2] || "/index.html";
    const projectDir = path.resolve(__dirname, "..", "projects", projectName);
    if (!fs.existsSync(projectDir)) {
      return json(res, 404, { error: "Project not found" });
    }
    let filePath = path.join(projectDir, subPath);
    if (!filePath.startsWith(projectDir)) return json(res, 403, { error: "Forbidden" });
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      subPath = path.join(subPath.replace(/\/$/, ""), "index.html");
      filePath = path.join(projectDir, subPath);
    }
    if (!fs.existsSync(filePath)) {
      const indexPath = path.join(projectDir, "index.html");
      if (fs.existsSync(indexPath)) return serveFile(res, indexPath);
      return json(res, 404, { error: "File not found" });
    }
    serveFile(res, filePath);
  });
}

module.exports = { registerRoutes };
