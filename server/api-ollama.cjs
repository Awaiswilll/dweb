// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Ollama API (/api/ollama/*)
//  Manages local LLM via Ollama: status, install, start, model management
// ═══════════════════════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const { json } = require("./helpers.cjs");

const OLLAMA_PORT = 11434;
const OLLAMA_HOST = "http://127.0.0.1:11434";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isOllamaInstalled() {
  try {
    execSync("which ollama 2>/dev/null", { timeout: 3000 });
    return true;
  } catch { return false; }
}

function isOllamaRunning() {
  return new Promise((resolve) => {
    const req = http.request(`${OLLAMA_HOST}/api/tags`, { method: "GET", timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.models ? true : false);
        } catch { resolve(false); }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function getOllamaModels() {
  return new Promise((resolve) => {
    const req = http.request(`${OLLAMA_HOST}/api/tags`, { method: "GET", timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.models && Array.isArray(parsed.models)) {
            resolve(parsed.models.map((m) => ({
              name: m.name,
              size: m.size,
              modified: m.modified_at,
              details: m.details || {},
            })));
          } else {
            resolve([]);
          }
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function getPlatform() {
  const p = os.platform();
  if (p === "linux") return "linux";
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return p;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

function registerRoutes(router) {
  // Ollama status — installed, running, platform info
  router.get("/api/ollama/status", async (req, res) => {
    const installed = isOllamaInstalled();
    const running = installed ? await isOllamaRunning() : false;
    const models = running ? await getOllamaModels() : [];
    json(res, 200, {
      status: "ok",
      installed,
      running,
      platform: getPlatform(),
      models,
      modelCount: models.length,
      port: OLLAMA_PORT,
      apiEndpoint: `${OLLAMA_HOST}`,
      suggestedModel: "qwen2.5-coder:7b",
    });
  });

  // Install Ollama
  router.post("/api/ollama/install", async (req, res) => {
    if (isOllamaInstalled()) {
      return json(res, 200, { status: "ok", message: "Ollama is already installed" });
    }

    const platform = getPlatform();

    try {
      if (platform === "linux") {
        // Linux: official install script
        const result = execSync("curl -fsSL https://ollama.com/install.sh | sh 2>&1", {
          timeout: 120000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        });
        json(res, 200, { status: "ok", message: "Ollama installed successfully (Linux)", output: result });
      } else if (platform === "macos") {
        // macOS: download the app
        const result = execSync("curl -fsSL https://ollama.com/install.sh | sh 2>&1", {
          timeout: 120000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        });
        json(res, 200, { status: "ok", message: "Ollama installed successfully (macOS)", output: result });
      } else if (platform === "windows") {
        // Windows: download installer
        const installerPath = "/tmp/OllamaSetup.exe";
        execSync(`curl -fsSLo "${installerPath}" https://ollama.com/download/OllamaSetup.exe 2>&1`, {
          timeout: 120000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        });
        json(res, 200, {
          status: "ok",
          message: "Ollama installer downloaded to /tmp/OllamaSetup.exe",
          note: "Run the installer manually on Windows",
          installerPath,
        });
      } else {
        json(res, 400, { error: `Unsupported platform: ${platform}` });
      }
    } catch (e) {
      json(res, 500, { error: `Installation failed: ${e.message}` });
    }
  });

  // Start Ollama server
  router.post("/api/ollama/start", async (req, res) => {
    if (!isOllamaInstalled()) {
      return json(res, 400, { error: "Ollama is not installed. Install it first." });
    }
    if (await isOllamaRunning()) {
      return json(res, 200, { status: "ok", message: "Ollama is already running" });
    }

    try {
      const platform = getPlatform();
      if (platform === "linux" || platform === "macos") {
        execSync("nohup ollama serve > /tmp/ollama.log 2>&1 &", { timeout: 5000 });
        // Wait a moment for it to start
        await new Promise(r => setTimeout(r, 2000));
        const running = await isOllamaRunning();
        if (running) {
          json(res, 200, { status: "ok", message: "Ollama server started" });
        } else {
          json(res, 200, { status: "started", message: "Ollama start initiated, server may take a moment" });
        }
      } else {
        json(res, 400, { error: "Manual start required on this platform" });
      }
    } catch (e) {
      json(res, 500, { error: `Failed to start Ollama: ${e.message}` });
    }
  });

  // Pull a model
  router.post("/api/ollama/pull", async (req, res) => {
    const body = await require("./helpers.cjs").parseBody(req);
    const modelName = body.model || "qwen2.5-coder:7b";

    if (!await isOllamaRunning()) {
      return json(res, 400, { error: "Ollama is not running" });
    }

    try {
      // Initiate the pull in background — it can take minutes
      exec(`ollama pull ${modelName} 2>&1`, (error, stdout, stderr) => {
        if (error) {
          console.log(`  [ollama] Pull failed for ${modelName}: ${error.message}`);
        } else {
          console.log(`  [ollama] Pulled model ${modelName}`);
        }
      });

      json(res, 200, {
        status: "ok",
        message: `Pulling model ${modelName} in background (this may take several minutes)`,
        model: modelName,
      });
    } catch (e) {
      json(res, 500, { error: `Failed to pull model: ${e.message}` });
    }
  });

  // List available Ollama models (delegate to status)
  router.get("/api/ollama/models", async (req, res) => {
    if (!await isOllamaRunning()) {
      return json(res, 200, { status: "ok", models: [], count: 0 });
    }
    const models = await getOllamaModels();
    json(res, 200, { status: "ok", count: models.length, models });
  });
}

module.exports = { registerRoutes };
