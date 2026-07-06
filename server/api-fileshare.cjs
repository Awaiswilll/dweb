// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — File Share API (/fileshare, /fileshare/api/*)
// ═══════════════════════════════════════════════════════════════════════════════

const path = require("path");
const fs = require("fs");
const { json, serveFile, parseBody } = require("./helpers.cjs");
const { SHARE_DIR } = require("./config.cjs");

function registerRoutes(router) {
  // File Share UI
  router.get("/fileshare", (req, res) => {
    const fsPath = path.join(__dirname, "..", "welcome", "fileshare.html");
    serveFile(res, fsPath);
  });

  // List files
  router.get("/fileshare/api/list", (req, res) => {
    try {
      const files = fs.readdirSync(SHARE_DIR).map(name => {
        const stat = fs.statSync(path.join(SHARE_DIR, name));
        return { name, size: stat.size, added: stat.mtimeMs, isDir: stat.isDirectory() };
      });
      json(res, 200, { status: "ok", count: files.length, files });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });

  // Upload file
  router.post("/fileshare/api/upload", (req, res) => {
    const ct = req.headers["content-type"] || "";
    if (!ct.includes("multipart/form-data")) {
      return json(res, 400, { error: "Expected multipart/form-data" });
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
          if (part.includes("filename=\"")) {
            const fnMatch = part.match(/filename="(.+?)"/);
            if (!fnMatch) continue;
            const fileName = fnMatch[1];
            const headerEnd = part.indexOf("\r\n\r\n") + 4;
            const content = part.slice(headerEnd, part.lastIndexOf("\r\n--"));
            const buf = Buffer.from(content, "latin1");
            fs.writeFileSync(path.join(SHARE_DIR, fileName), buf);
            saved++;
          }
        }
        json(res, 200, { status: "ok", saved });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
    });
  });

  // Download file
  router.get(/^\/fileshare\/api\/download\/(.+)$/, (req, res, match) => {
    const fileName = decodeURIComponent(match[1]);
    const filePath = path.join(SHARE_DIR, fileName);
    if (!filePath.startsWith(SHARE_DIR)) return json(res, 403, { error: "Forbidden" });
    if (!fs.existsSync(filePath)) return json(res, 404, { error: "File not found" });
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": stat.size,
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath).pipe(res);
  });

  // Delete file
  router.post("/fileshare/api/delete", async (req, res) => {
    try {
      const body = await parseBody(req);
      const filePath = path.join(SHARE_DIR, body.name);
      if (!filePath.startsWith(SHARE_DIR)) return json(res, 403, { error: "Forbidden" });
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      json(res, 200, { status: "ok" });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });

  // View file share source
  router.get("/fileshare/api/source", (req, res) => {
    const fsPath = path.join(__dirname, "..", "welcome", "fileshare.html");
    if (!fs.existsSync(fsPath)) return json(res, 404, { error: "Source not found" });
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(fs.readFileSync(fsPath));
  });
}

module.exports = { registerRoutes };
