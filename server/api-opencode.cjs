// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Opencode API (/api/repo/status, /api/opencode/*)
//
//  Endpoints:
//    GET  /api/repo/status            — Git repo context
//    GET  /api/opencode/status        — Opencode CLI availability
//    GET  /api/opencode/models        — List available models
//    POST /api/opencode/run           — [Legacy] Run opencode synchronously
//    POST /api/opencode/stream        — Start streaming opencode session (returns sessionId)
//    GET  /api/opencode/session/:id   — Get session state snapshot
//    GET  /api/opencode/session-stream/:id — SSE stream for session
//    POST /api/opencode/session/:id/cancel — Cancel running session
// ═══════════════════════════════════════════════════════════════════════════════

const path = require("path");
const { execSync } = require("child_process");
const { json, parseBody } = require("./helpers.cjs");
const config = require("./config.cjs");
const { INSTANCE_NAME } = config;
const {
  createSession,
  getSession,
  cancelSession,
  stripAnsi,
} = require("./opencode-worker.cjs");

function registerRoutes(router) {
  // ── Repo context ────────────────────────────────────────
  router.get("/api/repo/status", (req, res) => {
    let branch = "unknown", commit = "", files = 0, repoRoot = "";
    try {
      repoRoot = execSync("git rev-parse --show-toplevel 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
      branch = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
      commit = execSync("git rev-parse --short HEAD 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
      files = parseInt(execSync("git ls-files 2>/dev/null | wc -l", { timeout: 3000, encoding: "utf-8" }).trim(), 10) || 0;
    } catch {}
    json(res, 200, { status: "ok", repo: path.basename(repoRoot) || "dweb", branch, commit, files, path: repoRoot });
  });

  // ── Opencode status ─────────────────────────────────────
  router.get("/api/opencode/status", (req, res) => {
    let version = null;
    let available = false;
    try {
      const v = execSync("opencode --version 2>/dev/null", { timeout: 3000, encoding: "utf-8" }).trim();
      version = v;
      available = true;
    } catch {}
    json(res, 200, { status: "ok", available, version, instance: INSTANCE_NAME });
  });

  // ── List models ─────────────────────────────────────────
  router.get("/api/opencode/models", (req, res) => {
    try {
      const raw = execSync("opencode models 2>/dev/null", { timeout: 10000, encoding: "utf-8" });
      const lines = raw.split("\n").filter(l => l.startsWith("opencode/")).map(l => l.trim()).filter(Boolean);
      const models = lines.map(id => {
        const free = id.includes("free") || id.includes("nano") || id.includes("mini") || id.includes("flash");
        const provider = id.split("/")[1]?.split("-")[0] || "unknown";
        const label = id.replace("opencode/", "");
        return { id, label, provider, free };
      });
      models.sort((a, b) => {
        if (a.free !== b.free) return a.free ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      json(res, 200, { status: "ok", count: models.length, models, default: "opencode/deepseek-v4-flash-free" });
    } catch (e) {
      json(res, 200, { status: "ok", count: 0, models: [], default: "opencode/deepseek-v4-flash-free" });
    }
  });

  // ── [Legacy] Run opencode synchronously ─────────────────
  // Kept for backward compatibility. Prefer POST /api/opencode/stream.
  router.post("/api/opencode/run", async (req, res) => {
    const body = await parseBody(req);
    const { command, model, context, useOllama } = body;
    if (!command) return json(res, 400, { error: "Missing command" });
    let cmd = command.trim();
    const shorthands = {
      "build": "run npm run build in the dweb repo",
      "test": "run npm test in the dweb repo and fix any failures",
      "dev": "explain the current development setup and how to start developing",
      "status": "show the current state of the dweb repo, its architecture, and what can be built next",
      "help": "list available commands and how to use this opencode agent",
    };
    const expanded = shorthands[cmd.toLowerCase()] || cmd;
    const useModel = model || "opencode/deepseek-v4-flash-free";

    if (context === true) {
      return json(res, 200, { status: "ok", context: true, message: "Context received" });
    }

    const serverContext = `You are inside dweb (http://localhost:${config.PORT}/). Tech: React+Vite+TS frontend, Node.js backend. Repo: ${__dirname}/../. Build: npm run build. Test: npm test.`;
    const fullCommand = `${serverContext}\n\nUser: ${expanded}`;

    try {
      const env = { ...process.env };
      const ollamaModel = model || "ollama/qwen2.5-coder:7b";
      if (useOllama) {
        env.OPENAI_BASE_URL = "http://127.0.0.1:11434/v1";
        env.OPENAI_API_KEY = "ollama";
      }

      const output = execSync(
        `opencode run -m ${JSON.stringify(useOllama ? ollamaModel : useModel)} --dangerously-skip-permissions ${JSON.stringify(fullCommand)} 2>&1`,
        {
          timeout: 300000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
          env,
        }
      );
      // Strip ANSI codes for browser display
      const cleanOutput = stripAnsi(output);
      json(res, 200, { status: "ok", output: cleanOutput, command: expanded, model: useOllama ? ollamaModel : useModel, provider: useOllama ? "ollama" : "cloud" });
    } catch (e) {
      const errText = (e.stderr || e.message || "").toString();
      const cleanError = stripAnsi(errText);
      json(res, 200, { status: "error", output: cleanError, command: expanded, model: useOllama ? ollamaModel : useModel, provider: useOllama ? "ollama" : "cloud" });
    }
  });

  // ── Start streaming opencode session ────────────────────
  // Returns sessionId immediately. Client then connects to the SSE endpoint.
  router.post("/api/opencode/stream", async (req, res) => {
    const body = await parseBody(req);
    const { command, model, useOllama } = body;
    if (!command) return json(res, 400, { error: "Missing command" });

    let cmd = command.trim();
    const shorthands = {
      "build": "run npm run build in the dweb repo",
      "test": "run npm test in the dweb repo and fix any failures",
      "dev": "explain the current development setup and how to start developing",
      "status": "show the current state of the dweb repo, its architecture, and what can be built next",
      "help": "list available commands and how to use this opencode agent",
    };
    const expanded = shorthands[cmd.toLowerCase()] || cmd;
    const useModel = model || "opencode/deepseek-v4-flash-free";
    const provider = useOllama ? "ollama" : "cloud";

    const session = createSession(expanded, useOllama ? `ollama/${useModel}` : useModel, provider);
    json(res, 200, {
      status: "ok",
      sessionId: session.id,
      command: expanded,
      model: useModel,
      provider,
    });
  });

  // ── Get session state snapshot ──────────────────────────
  // Useful for reconnecting after tab switch.
  router.get("/api/opencode/session/:id", (req, res, match) => {
    const sessionId = match?.[1] || req.url.pathname.split("/").pop();
    const session = getSession(sessionId);
    if (!session) return json(res, 404, { status: "error", error: "Session not found" });
    json(res, 200, { status: "ok", session: session.toJSON() });
  });

  // ── SSE stream for session ──────────────────────────────
  router.get("/api/opencode/session-stream/:id", (req, res, match) => {
    const sessionId = match?.[1] || req.url.pathname.split("/").pop();
    const session = getSession(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "error", error: "Session not found" }));
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId, running: session.running })}\n\n`);

    // Register this client
    session.addSSEClient(res);

    // Keepalive to prevent connection timeout
    const keepalive = setInterval(() => {
      try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
    }, 15000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(keepalive);
      session.removeSSEClient(res);
    });
  });

  // ── Cancel a running session ────────────────────────────
  router.post("/api/opencode/session/:id/cancel", (req, res, match) => {
    const sessionId = match?.[1] || req.url.pathname.split("/").pop();
    const success = cancelSession(sessionId);
    if (!success) return json(res, 404, { status: "error", error: "Session not found" });
    json(res, 200, { status: "ok", message: "Session cancelled" });
  });

  // ── List active sessions ────────────────────────────────
  router.get("/api/opencode/sessions", (req, res) => {
    const { sessions } = require("./opencode-worker.cjs");
    const list = [];
    for (const [id, session] of sessions) {
      list.push(session.toJSON());
    }
    list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    json(res, 200, { status: "ok", count: list.length, sessions: list });
  });
}

module.exports = { registerRoutes };
