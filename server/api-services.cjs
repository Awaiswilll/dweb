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
const { addHostedService, removeHostedService, getDomainRecord, setDomainRecord, deleteDomainRecord, listDomainRecords } = require("./state.cjs");

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
      fs.writeFileSync(path.join(demoDir, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — dweb File Share</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #07080c; color: #e8edf5; min-height: 100vh; padding: 24px;
  }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .header h1 { font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .header h1 span { background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .header .sub { color: #64748b; font-size: 12px; margin-top: 2px; -webkit-text-fill-color: #64748b; }
  .header a { color: #818cf8; text-decoration: none; font-size: 13px; }
  .header a:hover { text-decoration: underline; }
  .upload-area {
    border: 2px dashed rgba(255,255,255,0.08); border-radius: 10px; padding: 36px 20px; text-align: center;
    margin-bottom: 20px; cursor: pointer; transition: all 0.2s; background: rgba(255,255,255,0.01);
  }
  .upload-area:hover, .upload-area.dragover { border-color: #6366f1; background: rgba(99,102,241,0.04); }
  .upload-area .icon { font-size: 32px; margin-bottom: 8px; }
  .upload-area .text { color: #94a3b8; font-size: 14px; }
  .upload-area .hint { color: #475569; font-size: 12px; margin-top: 4px; }
  .upload-area input[type="file"] { display: none; }
  .info-bar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .info-chip { padding: 4px 12px; border-radius: 6px; font-size: 11px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); color: #94a3b8; }
  .info-chip strong { color: #e8edf5; }
  .file-list { display: flex; flex-direction: column; gap: 3px; }
  .file-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03);
    transition: background 0.15s;
  }
  .file-item:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.06); }
  .file-item .icon { font-size: 18px; }
  .file-item .name { flex: 1; font-size: 13px; font-weight: 500; color: #e2e8f0; word-break: break-all; }
  .file-item .size { color: #64748b; font-size: 11px; white-space: nowrap; }
  .file-item .date { color: #475569; font-size: 11px; white-space: nowrap; }
  .file-item .actions { display: flex; gap: 4px; }
  .file-item .actions a, .file-item .actions button {
    padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 500;
    text-decoration: none; cursor: pointer; border: none; transition: all 0.12s;
  }
  .file-item .dl-btn { color: #818cf8; background: rgba(99,102,241,0.1); }
  .file-item .dl-btn:hover { background: rgba(99,102,241,0.2); }
  .file-item .del-btn { color: #ef4444; background: rgba(239,68,68,0.08); }
  .file-item .del-btn:hover { background: rgba(239,68,68,0.15); }
  .empty-state { text-align: center; padding: 50px 20px; color: #475569; }
  .empty-state .icon { font-size: 40px; margin-bottom: 10px; opacity: 0.4; }
  .empty-state .text { font-size: 14px; color: #64748b; }
  .empty-state .hint { font-size: 12px; margin-top: 4px; color: #475569; }
  .toast {
    position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 8px;
    font-size: 13px; font-weight: 500; z-index: 100; display: none;
    background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); color: #4ade80;
  }
  .toast.error { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.25); color: #ef4444; }
  @media (max-width: 600px) { body { padding: 12px; } .file-item { flex-wrap: wrap; } .file-item .date { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1><span>📁 ${name}</span></h1>
    <div class="sub">Drag & drop to upload · Files stored locally on this dweb node</div>
  </div>
  <a href="/">← Dashboard</a>
</div>
<div class="info-bar">
  <span class="info-chip">📂 <strong id="fileCount">0</strong> files</span>
  <span class="info-chip">📏 <strong id="totalSize">0 B</strong> total</span>
  <span class="info-chip" id="sharePathChip">🔗 <strong id="sharePath">/</strong></span>
</div>
<div class="upload-area" id="dropZone">
  <div class="icon">📤</div>
  <div class="text">Drop files here or click to upload</div>
  <div class="hint">Max 50MB per file · All file types supported</div>
  <input type="file" id="fileInput" multiple>
</div>
<div id="fileListContainer">
  <div class="empty-state" id="emptyState">
    <div class="icon">📂</div>
    <div class="text">No files shared yet</div>
    <div class="hint">Drag and drop files above to start sharing</div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileListContainer = document.getElementById('fileListContainer');
const toast = document.getElementById('toast');
let toastTimer = null;
function showToast(msg, isError) {
  toast.textContent = msg; toast.className = 'toast' + (isError ? ' error' : ''); toast.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.style.display = 'none', 3000);
}
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024; const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function formatDate(ts) { return new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = { pdf:'📄', zip:'📦', gz:'📦', tar:'📦', rar:'📦', js:'📜', ts:'📜', py:'🐍', java:'☕', go:'🔵', rs:'🦀', html:'🌐', css:'🎨', json:'📋', xml:'📋', md:'📝', txt:'📄', png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', svg:'🖼️', webp:'🖼️', mp3:'🎵', wav:'🎵', mp4:'🎬', mov:'🎬', webm:'🎬' };
  return icons[ext] || '📄';
}
async function loadFiles() {
  try {
    const resp = await fetch('/api/list');
    const data = await resp.json();
    if (data.status !== 'ok') throw new Error(data.error || 'Failed');
    document.getElementById('fileCount').textContent = data.count;
    const total = (data.files||[]).reduce((s, f) => s + (f.size || 0), 0);
    document.getElementById('totalSize').textContent = formatSize(total);
    document.getElementById('sharePath').textContent = window.location.href;
    if (data.count === 0) {
      fileListContainer.innerHTML = '<div class="empty-state"><div class="icon">📂</div><div class="text">No files shared yet</div><div class="hint">Drag and drop files above to start sharing</div></div>';
      return;
    }
    const list = document.createElement('div'); list.className = 'file-list';
    (data.files||[]).sort((a,b) => (b.added||0) - (a.added||0)).forEach(f => {
      const item = document.createElement('div'); item.className = 'file-item';
      item.innerHTML = '<span class="icon">'+getFileIcon(f.name)+'</span><span class="name">'+f.name.replace(/</g,'&lt;')+'</span><span class="size">'+formatSize(f.size||0)+'</span><span class="date">'+(f.added?formatDate(f.added):'')+'</span><span class="actions"><a class="dl-btn" href="/api/download/'+encodeURIComponent(f.name)+'" download>Download</a><button class="del-btn" data-name="'+f.name.replace(/"/g,'&quot;')+'">Delete</button></span>';
      list.appendChild(item);
    });
    fileListContainer.innerHTML = '';
    fileListContainer.appendChild(list);
    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        try {
          const r = await fetch('/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name}) });
          const d = await r.json();
          if (d.status === 'ok') { showToast('Deleted: ' + name); loadFiles(); }
          else showToast('Delete failed', true);
        } catch(e) { showToast('Error: '+e.message, true); }
      });
    });
  } catch(e) { showToast('Error loading files: '+e.message, true); }
}
async function uploadFiles(files) {
  for (const file of files) {
    if (file.size > 50*1024*1024) { showToast('File too large: '+file.name+' (max 50MB)', true); continue; }
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/upload', { method:'POST', body: fd });
      const d = await r.json();
      if (d.status === 'ok') showToast('✓ Uploaded: '+file.name);
      else showToast('Upload failed: '+(d.error||file.name), true);
    } catch(e) { showToast('Upload error: '+e.message, true); }
  }
  loadFiles();
}
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); uploadFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', () => { if (fileInput.files.length) { uploadFiles(fileInput.files); fileInput.value = ''; } });
loadFiles();
setInterval(loadFiles, 15000);
</script>
</body>
</html>`);
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

    // ── File Browser mode with upload/list/download/delete API ──
    const isFileBrowser = type === "File Browser";

    // Helper: collect file list
    function listFiles() {
      try {
        const files = fs.readdirSync(serveDir).map(fname => {
          const fpath = path.join(serveDir, fname);
          const stat = fs.statSync(fpath);
          return { name: fname, size: stat.size, added: stat.mtimeMs, isDir: stat.isDirectory() };
        });
        return { status: "ok", count: files.length, files };
      } catch (e) {
        return { status: "error", error: e.message };
      }
    }

    // Create a simple HTTP server that serves files from the directory
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    const server = http.createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      const pathname = url.pathname;

      // ── File Browser API endpoints ──
      if (isFileBrowser && pathname === "/api/list") {
        return json(res, 200, listFiles());
      }

      if (isFileBrowser && pathname === "/api/upload" && req.method === "POST") {
        const ct = req.headers["content-type"] || "";
        if (!ct.includes("multipart/form-data")) {
          return json(res, 400, { status: "error", error: "Expected multipart/form-data" });
        }
        let rawBody = [];
        let totalBytes = 0;
        const boundary = "--" + ct.split("boundary=")[1];
        req.on("data", c => { rawBody.push(c); totalBytes += c.length; if (totalBytes > 100e6) req.destroy(); });
        req.on("end", () => {
          try {
            const full = Buffer.concat(rawBody);
            const parts = full.toString("latin1").split(boundary);
            let saved = 0;
            for (const part of parts) {
              if (part.includes('filename="')) {
                const fnMatch = part.match(/filename="(.+?)"/);
                if (!fnMatch) continue;
                const fileName = fnMatch[1];
                const headerEnd = part.indexOf("\r\n\r\n") + 4;
                const content = part.slice(headerEnd, part.lastIndexOf("\r\n--"));
                const buf = Buffer.from(content, "latin1");
                fs.writeFileSync(path.join(serveDir, fileName), buf);
                saved++;
              }
            }
            json(res, 200, { status: "ok", saved });
          } catch (e) {
            json(res, 500, { status: "error", error: e.message });
          }
        });
        return;
      }

      if (isFileBrowser && pathname.startsWith("/api/download/") && req.method === "GET") {
        const fileName = decodeURIComponent(pathname.replace("/api/download/", ""));
        const filePath = path.join(serveDir, fileName);
        if (!filePath.startsWith(serveDir)) {
          return json(res, 403, { status: "error", error: "Forbidden" });
        }
        if (!fs.existsSync(filePath)) {
          return json(res, 404, { status: "error", error: "File not found" });
        }
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": stat.size,
          ...cors,
        });
        return fs.createReadStream(filePath).pipe(res);
      }

      if (isFileBrowser && pathname === "/api/delete" && req.method === "POST") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          try {
            const { name: delName } = JSON.parse(body);
            const delPath = path.join(serveDir, delName);
            if (!delPath.startsWith(serveDir)) {
              return json(res, 403, { status: "error", error: "Forbidden" });
            }
            if (fs.existsSync(delPath)) fs.unlinkSync(delPath);
            json(res, 200, { status: "ok" });
          } catch (e) {
            json(res, 500, { status: "error", error: e.message });
          }
        });
        return;
      }

      // ── Static file serving ──
      let filePath = path.join(serveDir, pathname === "/" ? "index.html" : pathname);

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
        // File not found - serve fallback
        try {
          const fallback = path.join(serveDir, "index.html");
          if (fs.existsSync(fallback)) {
            const content = fs.readFileSync(fallback);
            res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
            return res.end(content);
          }
        } catch {}
        res.writeHead(404, { ...cors, "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>404 - ${name}</h1><p>File not found</p>`);
      }
    });

    server.listen(port, "0.0.0.0", () => {
      console.log(`  [service] Started "${name}" on port ${port} (0.0.0.0 — all interfaces)${dir ? ` dir="${dir}"` : ""}`);
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

  // GET /api/service/domains — list domains bound to services (for capsule status)
  router.get("/api/service/domains", (req, res) => {
    const records = listDomainRecords();
    const serviceDomains = [];
    for (const rec of records) {
      if (rec.service_name) {
        serviceDomains.push({
          service_name: rec.service_name,
          domain: `${rec.name}.dweb`,
          tier: rec.tier,
          port: rec.port,
          custom_domain: rec.custom_domain,
          active: rec.active,
          expires_at: rec.expires_at,
        });
      }
    }
    json(res, 200, { status: "ok", domains: serviceDomains });
  });

  // POST /api/service/publish — register .dweb domain + bind to service in one step
  router.post("/api/service/publish", async (req, res) => {
    const body = await parseBody(req);
    const { name, domain, tier } = body;

    if (!name) return json(res, 400, { status: "error", error: "Missing service name" });

    // Make sure service exists
    if (!runningServices.has(name)) {
      return json(res, 404, { status: "error", error: `Service "${name}" is not running. Start it first.` });
    }

    const svc = runningServices.get(name);
    const domainName = (domain || name).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "my-service";
    const domainTier = tier || "free";

    // 1. Register domain
    const reqPath = `/api/domain/register`;
    let regResp;
    try {
      regResp = await new Promise((resolve, reject) => {
        const opts = {
          hostname: "127.0.0.1",
          port: config.PORT,
          path: reqPath,
          method: "POST",
          headers: { "Content-Type": "application/json" },
        };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", c => body += c);
          res.on("end", () => {
            try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
            catch (e) { reject(e); }
          });
        });
        req.on("error", reject);
        req.write(JSON.stringify({ name: domainName, tier: domainTier }));
        req.end();
      });
    } catch (e) {
      return json(res, 502, { status: "error", error: `Domain registration failed: ${e.message}` });
    }

    // 409 (already exists) is OK — we proceed to bind
    if (regResp.status !== 201 && regResp.status !== 409) {
      return json(res, regResp.status, { status: "error", error: regResp.data?.error || "Registration failed" });
    }

    // 2. Bind domain to service
    let bindResp;
    try {
      bindResp = await new Promise((resolve, reject) => {
        const opts = {
          hostname: "127.0.0.1",
          port: config.PORT,
          path: "/api/domain/bind",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", c => body += c);
          res.on("end", () => {
            try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
            catch (e) { reject(e); }
          });
        });
        req.on("error", reject);
        req.write(JSON.stringify({ name: domainName, service_name: name, port: svc.port }));
        req.end();
      });
    } catch (e) {
      return json(res, 502, { status: "error", error: `Domain bind failed: ${e.message}` });
    }

    if (!bindResp || bindResp.status !== 200) {
      return json(res, bindResp?.status || 502, { status: "error", error: bindResp?.data?.error || "Bind failed" });
    }

    console.log(`  [service] Published "${name}" → ${domainName}.dweb (${domainTier})`);
    json(res, 200, {
      status: "ok",
      message: `✨ Published at https://${domainName}.dweb`,
      domain: `${domainName}.dweb`,
      record: bindResp.data,
    });
  });

  // POST /api/service/unpublish — unbind domain from service
  router.post("/api/service/unpublish", async (req, res) => {
    const body = await parseBody(req);
    const { name } = body;

    if (!name) return json(res, 400, { status: "error", error: "Missing service name" });

    // Find the domain bound to this service
    const records = listDomainRecords();
    let domainToRemove = null;
    for (const rec of records) {
      if (rec.service_name === name) {
        domainToRemove = rec.name;
        break;
      }
    }

    if (!domainToRemove) {
      return json(res, 404, { status: "error", error: `No domain found for service "${name}"` });
    }

    // Unbind
    try {
      await new Promise((resolve, reject) => {
        const opts = {
          hostname: "127.0.0.1",
          port: config.PORT,
          path: "/api/domain/unbind",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", c => body += c);
          res.on("end", () => resolve({ status: res.statusCode }));
        });
        req.on("error", reject);
        req.write(JSON.stringify({ name: domainToRemove }));
        req.end();
      });
    } catch (e) {
      return json(res, 502, { status: "error", error: `Unbind failed: ${e.message}` });
    }

    console.log(`  [service] Unpublished "${name}" — removed ${domainToRemove}.dweb`);
    json(res, 200, { status: "ok", message: `Unpublished ${domainToRemove}.dweb`, domain: `${domainToRemove}.dweb` });
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
