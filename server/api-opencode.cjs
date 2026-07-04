// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Opencode API (/api/repo/status, /api/opencode/*)
// ═══════════════════════════════════════════════════════════════════════════════

const path = require("path");
const { execSync } = require("child_process");
const { json, parseBody } = require("./helpers.cjs");
const config = require("./config.cjs");
const { INSTANCE_NAME } = config;

function registerRoutes(router) {
  // Repo context
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

  // Opencode status
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

  // List opencode models
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

  // Run opencode command
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
      // When using Ollama, set environment variables to route through local LLM
      const env = { ...process.env };
      const ollamaModel = model || "ollama/qwen2.5-coder:7b";
      if (useOllama) {
        env.OPENAI_BASE_URL = "http://127.0.0.1:11434/v1";
        env.OPENAI_API_KEY = "ollama";
      }

      const output = execSync(
        `opencode run -m ${JSON.stringify(useOllama ? ollamaModel : useModel)} ${JSON.stringify(fullCommand)} 2>&1`,
        {
          timeout: 300000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
          env,
        }
      );
      json(res, 200, { status: "ok", output, command: expanded, model: useOllama ? ollamaModel : useModel, provider: useOllama ? "ollama" : "cloud" });
    } catch (e) {
      json(res, 200, { status: "error", output: (e.stderr || e.message || "").toString(), command: expanded, model: useOllama ? ollamaModel : useModel, provider: useOllama ? "ollama" : "cloud" });
    }
  });
}

module.exports = { registerRoutes };
