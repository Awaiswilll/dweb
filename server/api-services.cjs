// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Service Management API (/api/services, /api/service/*)
//  Start, stop, and list managed services with persistence
// ═══════════════════════════════════════════════════════════════════════════════

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { json, parseBody } = require("./helpers.cjs");
const config = require("./config.cjs");
const { addHostedService, removeHostedService } = require("./state.cjs");

// ─── Running Services Map ────────────────────────────────────────────────────
// name -> { server, port, type, dir, started }
const runningServices = new Map();
const SERVICES_FILE = path.join(os.tmpdir(), "dweb-services.json");

// ─── Static MIME types for file-serving services ──────────────────────────────
const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveServices() {
  try {
    const data = [];
    for (const [name, svc] of runningServices) {
      data.push({ name, port: svc.port, type: svc.type, dir: svc.dir || null, started: svc.started });
    }
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(`  [services] Failed to save services: ${e.message}`);
  }
}

function restoreServices() {
  try {
    if (!fs.existsSync(SERVICES_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(SERVICES_FILE, "utf8"));
    if (!Array.isArray(data)) return 0;
    let restored = 0;

    for (const entry of data) {
      if (runningServices.has(entry.name)) continue;
      const port = entry.port || (Math.floor(Math.random() * 10000) + 30000);
      const dir = entry.dir;
      const type = entry.type || "Custom";

      // Try to restart the service
      const svc = createServiceServer(entry.name, type, port, dir);
      if (svc) {
        runningServices.set(entry.name, svc);
        // Re-register on P2P relay
        addHostedService(entry.name, type, svc.port, `http://localhost:${svc.port}`);
        restored++;
      }
    }
    if (restored > 0) console.log(`  [services] Restored ${restored} services from disk`);
    return restored;
  } catch (e) {
    console.log(`  [services] Failed to restore services: ${e.message}`);
    return 0;
  }
}

// ─── Demo Content Generator ──────────────────────────────────────────────────

function getDemoDir(type, name, port) {
  const DEMO_ROOT = path.join(os.tmpdir(), "dweb-demo");
  const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, "_");
  const demoDir = path.join(DEMO_ROOT, `${safeName}-${port}`);
  if (fs.existsSync(demoDir)) return demoDir;

  try {
    fs.mkdirSync(demoDir, { recursive: true });

    if (type === "Static Site" || type === "Single Page App" || type === "Documentation Site" || type === "Dashboard") {
      // Copy the real welcome.html as index.html for a proper welcome page
      const welcomeSrc = path.join(__dirname, "..", "welcome", "welcome.html");
      if (fs.existsSync(welcomeSrc)) {
        // Read welcome.html, replace the "/welcome/source" link with actual port info
        let welcomeContent = fs.readFileSync(welcomeSrc, "utf8");
        welcomeContent = welcomeContent
          .replace(/dweb\.local/g, name)
          .replace(/dweb v0\.1\.0/i, `${name} — ${type}`);
        fs.writeFileSync(path.join(demoDir, "index.html"), welcomeContent);
      } else {
        // Fallback generic welcome
        fs.writeFileSync(path.join(demoDir, "index.html"),
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${name}</title>` +
          `<style>body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:12px}</style></head>` +
          `<body><h1>${name}</h1><p>Welcome! This static site is hosted by dweb.</p>` +
          `<p style="color:var(--text-muted);font-size:13px">Port: ${port}</p></body></html>`);
      }
    }

    if (type === "File Browser") {
      fs.writeFileSync(path.join(demoDir, "README.md"),
        `# ${name}\n\nWelcome to your file browser.\n\n## Quick Start\n- Upload files using the toolbar\n- Create folders to organize content\n- Drag & drop to upload\n`);
      fs.writeFileSync(path.join(demoDir, "index.html"),
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${name}</title><style>body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body><h1>${name}</h1><p>Your file browser is ready. Upload files to get started.</p></body></html>`);
    }

    if (type === "Image Gallery") {
      const colors = [
        { name: "Sunset", bg1: "#f97316", bg2: "#ef4444" },
        { name: "Mountains", bg1: "#3b82f6", bg2: "#1d4ed8" },
        { name: "Forest", bg1: "#22c55e", bg2: "#15803d" },
      ];
      for (const c of colors) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c.bg1}"/><stop offset="100%" stop-color="${c.bg2}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="400" y="300" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="36" font-family="system-ui,sans-serif" font-weight="bold">${c.name}</text></svg>`;
        fs.writeFileSync(path.join(demoDir, `${c.name.toLowerCase()}.svg`), svg);
      }
    }

    if (type === "Media Stream" || type === "Podcast Host") {
      // Create a minimal WAV file
      const sampleRate = 44100;
      const duration = 2;
      const numSamples = sampleRate * duration;
      const wavBuf = Buffer.alloc(44 + numSamples * 2);
      wavBuf.write("RIFF", 0);
      wavBuf.writeUInt32LE(36 + numSamples * 2, 4);
      wavBuf.write("WAVE", 8);
      wavBuf.write("fmt ", 12);
      wavBuf.writeUInt32LE(16, 16);
      wavBuf.writeUInt16LE(1, 20);
      wavBuf.writeUInt16LE(1, 22);
      wavBuf.writeUInt32LE(sampleRate, 24);
      wavBuf.writeUInt32LE(sampleRate * 2, 28);
      wavBuf.writeUInt16LE(2, 32);
      wavBuf.writeUInt16LE(16, 34);
      wavBuf.write("data", 36);
      wavBuf.writeUInt32LE(numSamples * 2, 40);
      for (let wi = 0; wi < numSamples; wi++) {
        const t = wi / sampleRate;
        const sample = Math.sin(2 * Math.PI * 440 * t) * 0.3;
        const val = Math.max(-1, Math.min(1, sample));
        wavBuf.writeInt16LE(Math.round(val * 32767), 44 + wi * 2);
      }
      const prefix = type === "Podcast Host" ? "episode" : "track";
      fs.writeFileSync(path.join(demoDir, `${prefix}_001_demo.wav`), wavBuf);
      fs.writeFileSync(path.join(demoDir, `${prefix}_002_demo.wav`), wavBuf);
    }

    if (type === "Log Viewer") {
      fs.writeFileSync(path.join(demoDir, "app.log"),
        `[${new Date().toISOString()}] [INFO] dweb service started\n[${new Date().toISOString()}] [INFO] Listening on port ${port}\n[${new Date().toISOString()}] [DEBUG] Loading configuration...\n[${new Date().toISOString()}] [INFO] Service ${name} ready\n`);
    }

    return demoDir;
  } catch (e) {
    console.log(`  [services] Demo dir creation failed: ${e.message}`);
    return demoDir;
  }
}

// ─── Create a simple static file server for a service ─────────────────────────

function createServiceServer(name, type, port, dir) {
  try {
    // Determine the directory to serve
    const dirTypes = ["Static Site", "Single Page App", "Documentation Site", "Dashboard", "File Browser", "Image Gallery", "Media Stream", "Podcast Host", "Log Viewer", "Git Web UI"];
    const serveDir = dir || getDemoDir(type, name, port);

    // Ensure directory exists
    if (!fs.existsSync(serveDir)) {
      fs.mkdirSync(serveDir, { recursive: true });
    }

    // Create a simple HTTP server that serves files from the directory
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    const server = http.createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      let filePath = path.join(serveDir, url.pathname === "/" ? "index.html" : url.pathname);

      // Security: prevent directory traversal
      if (!filePath.startsWith(path.resolve(serveDir))) {
        res.writeHead(403, { ...cors, "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Forbidden" }));
      }

      // Try to serve the file
      try {
        if (fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, "index.html");
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = STATIC_MIME[ext] || "application/octet-stream";
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { ...cors, "Content-Type": contentType });
        res.end(content);
      } catch {
        // File not found - serve a 404 or index.html for SPAs
        try {
          const fallback = path.join(serveDir, "index.html");
          if (fs.existsSync(fallback) && type !== "File Browser") {
            const content = fs.readFileSync(fallback);
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            return res.end(content);
          }
        } catch {}
        res.writeHead(404, { ...cors, "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>404 - ${name}</h1><p>File not found</p>`);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`  [service] Started "${name}" on port ${port}${dir ? ` dir="${dir}"` : ""}`);
    });

    server.on("error", (err) => {
      console.log(`  [service] Error starting "${name}": ${err.message}`);
    });

    const svc = { server, port, type, dir: serveDir, started: Date.now() };
    return svc;
  } catch (e) {
    console.log(`  [service] Failed to create server for "${name}": ${e.message}`);
    return null;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

function registerRoutes(router) {
  // GET /api/services — list all running services
  router.get("/api/services", (req, res) => {
    const list = [];
    for (const [name, svc] of runningServices) {
      list.push({
        name,
        port: svc.port,
        type: svc.type || "Custom",
        dir: svc.dir || null,
        running: true,
        cpu: 0.5,
        memory: 8_000_000,
      });
    }
    json(res, 200, { status: "ok", services: list });
  });

  // GET /api/domain/services — services for domain binding
  router.get("/api/domain/services", (req, res) => {
    const services = [];
    for (const [name, svc] of runningServices) {
      services.push({ name, port: svc.port, type: svc.type });
    }
    json(res, 200, services);
  });

  // POST /api/service/start — start a managed service
  router.post("/api/service/start", async (req, res) => {
    const body = await parseBody(req);
    const { name, type, port, dir } = body;

    if (!name) return json(res, 400, { status: "error", message: "Missing service name" });
    if (runningServices.has(name)) {
      return json(res, 409, { status: "error", message: `Service "${name}" is already running` });
    }

    const servicePort = port || (Math.floor(Math.random() * 10000) + 30000);
    const serviceType = type || "Custom";
    const svc = createServiceServer(name, serviceType, servicePort, dir || null);

    if (!svc) {
      return json(res, 500, { status: "error", message: `Failed to start service "${name}"` });
    }

    runningServices.set(name, svc);
    saveServices();

    // Register on P2P relay for global discovery
    addHostedService(name, serviceType, servicePort, `http://localhost:${servicePort}`);

    json(res, 200, {
      status: "ok",
      message: `Service "${name}" started on port ${servicePort}`,
      service: { name, port: servicePort, type: serviceType, dir: dir || null, running: true, url: `http://localhost:${servicePort}` },
    });
  });

  // POST /api/service/stop — stop a managed service
  router.post("/api/service/stop", async (req, res) => {
    const body = await parseBody(req);
    const { name } = body;

    if (!name) return json(res, 400, { status: "error", message: "Missing service name" });
    const svc = runningServices.get(name);
    if (!svc) {
      return json(res, 404, { status: "error", message: `Service "${name}" not found` });
    }

    try {
      svc.server.close();
    } catch {}
    runningServices.delete(name);
    saveServices();

    // Remove from P2P relay
    removeHostedService(name);

    console.log(`  [service] Stopped "${name}" on port ${svc.port}`);
    json(res, 200, { status: "ok", message: `Service "${name}" stopped` });
  });

  // POST /api/service/customize — save customized HTML source for a service
  router.post("/api/service/customize", async (req, res) => {
    const body = await parseBody(req);
    const { name, content } = body;

    if (!name) return json(res, 400, { status: "error", error: "Missing service name" });
    if (typeof content !== "string") return json(res, 400, { status: "error", error: "Missing content body" });

    const svc = runningServices.get(name);
    if (!svc) return json(res, 404, { status: "error", error: `Service "${name}" not found or not running` });

    const serveDir = svc.dir;
    if (!serveDir || !fs.existsSync(serveDir)) {
      return json(res, 400, { status: "error", error: `Service "${name}" has no writable directory` });
    }

    try {
      fs.writeFileSync(path.join(serveDir, "index.html"), content, "utf8");
      console.log(`  [service] Customized page for "${name}" in ${serveDir}`);
      json(res, 200, { status: "ok", message: `Page for "${name}" updated` });
    } catch (e) {
      json(res, 500, { status: "error", error: `Failed to write: ${e.message}` });
    }
  });
}

module.exports = { registerRoutes, runningServices, restoreServices };
