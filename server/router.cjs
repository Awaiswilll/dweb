// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Simple HTTP Router + Main Request Handler
// ═══════════════════════════════════════════════════════════════════════════════

const path = require("path");
const { DIST_DIR } = require("./config.cjs");
const { json, serveFile } = require("./helpers.cjs");
const { registerRoutes: registerRelayRoutes } = require("./api-relay.cjs");
const { registerRoutes: registerCollabRoutes } = require("./api-collab.cjs");
const { registerRoutes: registerFileshareRoutes } = require("./api-fileshare.cjs");
const { registerRoutes: registerOpencodeRoutes } = require("./api-opencode.cjs");
const { registerRoutes: registerSystemRoutes } = require("./api-system.cjs");

// ─── Lightweight Router ────────────────────────────────────────────────────────

class Router {
  constructor() {
    this.routes = []; // { method, pattern, handler }
  }

  get(pattern, handler) { this.routes.push({ method: "GET", pattern, handler }); }
  post(pattern, handler) { this.routes.push({ method: "POST", pattern, handler }); }
  delete(pattern, handler) { this.routes.push({ method: "DELETE", pattern, handler }); }

  async dispatch(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const method = req.method;
    req.url = url; // Attach parsed URL for route handlers

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    for (const route of this.routes) {
      let match = null;
      if (typeof route.pattern === "string") {
        if (url.pathname !== route.pattern) continue;
      } else if (route.pattern instanceof RegExp) {
        match = url.pathname.match(route.pattern);
        if (!match) continue;
      }
      if (route.method !== method) continue;
      return await route.handler(req, res, match);
    }

    // No route matched — serve static files
    let filePath = path.join(DIST_DIR, url.pathname === "/" ? "index.html" : url.pathname);
    if (!filePath.startsWith(DIST_DIR)) return json(res, 403, { error: "Forbidden" });
    serveFile(res, filePath);
  }
}

// ─── Build Router ──────────────────────────────────────────────────────────────

function createRouter() {
  const router = new Router();
  registerRelayRoutes(router);
  registerCollabRoutes(router);
  registerFileshareRoutes(router);
  registerOpencodeRoutes(router);
  registerSystemRoutes(router);
  return router;
}

module.exports = { createRouter, Router };
