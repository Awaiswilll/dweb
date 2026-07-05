// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Ollama API (/api/ollama/*)
//  Manages local LLM via Ollama with multi-source detection:
//    - Native: 127.0.0.1:11434
//    - WSL-to-Windows: host.docker.internal:11434
//    - Docker container: docker-host:11434
//  Auto-prioritizes local Ollama over cloud models when detected.
// ═══════════════════════════════════════════════════════════════════════════════

const http = require("http");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const { json } = require("./helpers.cjs");

const OLLAMA_PORT = 11434;

// ─── WSL Detection ─────────────────────────────────────────────────────────────

let _isWSL = null;
function isWSL() {
  if (_isWSL !== null) return _isWSL;
  try {
    const release = fs.readFileSync("/proc/sys/kernel/osrelease", "utf-8").toLowerCase();
    _isWSL = release.includes("microsoft") || release.includes("wsl");
  } catch {
    _isWSL = false;
  }
  return _isWSL;
}

// ─── Multi-source Ollama probe ────────────────────────────────────────────────

/** Possible Ollama endpoints to probe, ordered by preference */
function getProbeTargets() {
  const targets = [
    { host: "127.0.0.1", port: OLLAMA_PORT, label: "native" },
  ];

  // WSL: Windows host runs Ollama — accessible via host.docker.internal
  if (isWSL()) {
    targets.push({ host: "host.docker.internal", port: OLLAMA_PORT, label: "wsl-host" });
  }

  // Docker: container networking
  targets.push({ host: "host.docker.internal", port: OLLAMA_PORT, label: "docker" });
  targets.push({ host: "172.17.0.1", port: OLLAMA_PORT, label: "docker-bridge" });

  return targets;
}

function probeEndpoint(host, port) {
  return new Promise((resolve) => {
    const req = http.request(
      `${host}:${port}/api/tags`,
      { method: "GET", timeout: 2000, hostname: host, port, path: "/api/tags" },
      (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.models ? true : false);
          } catch { resolve(false); }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function findOllama() {
  const targets = getProbeTargets();
  for (const t of targets) {
    try {
      const found = await probeEndpoint(t.host, t.port);
      if (found) return { host: t.host, port: t.port, label: t.label };
    } catch {}
  }
  return null;
}

// ─── Ollama HTTP helpers ───────────────────────────────────────────────────────

function ollamaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${OLLAMA_PORT}${endpoint}`,
      { method: "GET", timeout: 5000 },
      (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function getOllamaModels(host, port) {
  return new Promise((resolve) => {
    const req = http.request(
      `http://${host}:${port}/api/tags`,
      { method: "GET", timeout: 5000, hostname: host, port, path: "/api/tags" },
      (res) => {
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
      }
    );
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function getPlatform() {
  const p = os.platform();
  if (p === "linux") return isWSL() ? "wsl" : "linux";
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return p;
}

function isOllamaInstalledLocal() {
  try {
    execSync("which ollama 2>/dev/null", { timeout: 3000 });
    return true;
  } catch { return false; }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

function registerRoutes(router) {
  // Ollama status — enhanced detection
  router.get("/api/ollama/status", async (req, res) => {
    const platform = getPlatform();
    const detected = await findOllama();
    const running = detected !== null;
    const installed = isOllamaInstalledLocal();

    let models = [];
    if (running && detected) {
      models = await getOllamaModels(detected.host, detected.port);
    }

    json(res, 200, {
      status: "ok",
      installed,
      running,
      platform,
      isWSL: isWSL(),
      detectedVia: detected ? detected.label : null, // "native", "wsl-host", "docker", "docker-bridge"
      detectedHost: detected ? detected.host : null,
      detectedPort: detected ? detected.port : null,
      models,
      modelCount: models.length,
      port: OLLAMA_PORT,
      apiEndpoint: running && detected ? `http://${detected.host}:${detected.port}` : `http://127.0.0.1:${OLLAMA_PORT}`,
      suggestedModel: "qwen2.5-coder:7b",
      // Recommend using Ollama when any instance is found running
      recommended: running,
    });
  });

  // Install Ollama
  router.post("/api/ollama/install", async (req, res) => {
    if (isOllamaInstalledLocal()) {
      return json(res, 200, { status: "ok", message: "Ollama is already installed" });
    }

    const platform = getPlatform();

    try {
      if (platform === "wsl" || platform === "linux") {
        const result = execSync("curl -fsSL https://ollama.com/install.sh | sh 2>&1", {
          timeout: 120000, encoding: "utf-8", maxBuffer: 1024 * 1024,
        });
        json(res, 200, { status: "ok", message: "Ollama installed successfully", output: result });
      } else if (platform === "macos") {
        const result = execSync("curl -fsSL https://ollama.com/install.sh | sh 2>&1", {
          timeout: 120000, encoding: "utf-8", maxBuffer: 1024 * 1024,
        });
        json(res, 200, { status: "ok", message: "Ollama installed successfully", output: result });
      } else if (platform === "windows") {
        const installerPath = "/tmp/OllamaSetup.exe";
        execSync(`curl -fsSLo "${installerPath}" https://ollama.com/download/OllamaSetup.exe 2>&1`, {
          timeout: 120000, encoding: "utf-8", maxBuffer: 1024 * 1024,
        });
        json(res, 200, {
          status: "ok", message: "Ollama installer downloaded to /tmp/OllamaSetup.exe",
          note: "Run the installer manually on Windows", installerPath,
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
    if (!isOllamaInstalledLocal()) {
      return json(res, 400, { error: "Ollama is not installed. Install it first." });
    }

    const detected = await findOllama();
    if (detected) {
      return json(res, 200, {
        status: "ok", message: `Ollama is already running (detected via ${detected.label})`,
      });
    }

    try {
      const platform = getPlatform();
      if (platform === "wsl" || platform === "linux" || platform === "macos") {
        execSync("nohup ollama serve > /tmp/ollama.log 2>&1 &", { timeout: 5000 });
        await new Promise(r => setTimeout(r, 2000));
        const running = await findOllama();
        if (running) {
          json(res, 200, { status: "ok", message: "Ollama server started" });
        } else {
          json(res, 200, { status: "started", message: "Ollama start initiated, may take a moment" });
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

    const detected = await findOllama();
    if (!detected) {
      return json(res, 400, { error: "Ollama is not running" });
    }

    try {
      exec(`ollama pull ${modelName} 2>&1`, (error, stdout, stderr) => {
        if (error) {
          console.log(`  [ollama] Pull failed for ${modelName}: ${error.message}`);
        } else {
          console.log(`  [ollama] Pulled model ${modelName}`);
        }
      });
      json(res, 200, {
        status: "ok",
        message: `Pulling model ${modelName} in background (may take several minutes)`,
        model: modelName,
      });
    } catch (e) {
      json(res, 500, { error: `Failed to pull model: ${e.message}` });
    }
  });

  // List available Ollama models
  router.get("/api/ollama/models", async (req, res) => {
    const detected = await findOllama();
    if (!detected) {
      return json(res, 200, { status: "ok", models: [], count: 0 });
    }
    const models = await getOllamaModels(detected.host, detected.port);
    json(res, 200, { status: "ok", count: models.length, models });
  });
}

module.exports = { registerRoutes };
