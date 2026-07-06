// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Opencode Session Worker
//  Manages long-running opencode processes via spawn with:
//    - Persistent sessions (survive client tab switches)
//    - Real-time output streaming via SSE
//    - ANSI code stripping
//    - `--dangerously-skip-permissions` for headless mode
// ═══════════════════════════════════════════════════════════════════════════════

const { spawn } = require("child_process");
const config = require("./config.cjs");
const { INSTANCE_NAME } = config;

/* ─── ANSI stripping ────────────────────────────────────── */
// Strips ANSI escape codes (colors, cursor, erase, OSC sequences)
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")      // CSI sequences: \x1b[0m, \x1b[1;32m
    .replace(/\x1B\][^\x1B]*(\x1B\\)?/g, "")     // OSC sequences: \x1b]0;title\x1b\
    .replace(/\x1B[PX^_].*?\x1B\\/gs, "")        // Other escape sequences
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Control chars (keep \t \n \r)
    .trim();
}

/* ─── Session store ─────────────────────────────────────── */
const sessions = new Map(); // sessionId -> Session

let sessionCounter = 0;

function genSessionId() {
  return `oc-${Date.now().toString(36)}-${(++sessionCounter).toString(36)}`;
}

/* ─── Session class ─────────────────────────────────────── */
class OpenCodeSession {
  constructor(id, command, model, provider) {
    this.id = id;
    this.command = command;
    this.model = model;
    this.provider = provider;
    this.output = "";
    this.running = true;
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.exitCode = null;
    this.error = null;
    this.process = null;
    this.sseClients = new Set(); // res objects for SSE streaming
    this._outputListeners = [];
  }

  // Add output chunk + notify all SSE clients
  _emitOutput(text) {
    const clean = stripAnsi(text);
    if (!clean) return;
    this.output += clean + "\n";
    const payload = JSON.stringify({ type: "output", text: clean, timestamp: Date.now() });
    for (const client of this.sseClients) {
      try { client.write(`event: output\ndata: ${payload}\n\n`); } catch {}
    }
  }

  _emitDone() {
    const status = this.exitCode === 0 ? "ok" : "error";
    const payload = JSON.stringify({
      type: "done",
      status,
      exitCode: this.exitCode,
      duration: Date.now() - this.startedAt,
      output: this.output,
      finishedAt: this.finishedAt,
      error: this.error,
    });
    for (const client of this.sseClients) {
      try { client.write(`event: done\ndata: ${payload}\n\n`); } catch {}
    }
    this.sseClients.clear();
  }

  _emitError(error) {
    this.error = error;
    const payload = JSON.stringify({ type: "error", error, timestamp: Date.now() });
    for (const client of this.sseClients) {
      try { client.write(`event: error\ndata: ${payload}\n\n`); } catch {}
    }
  }

  // Start the opencode process
  start() {
    const serverContext = `You are inside dweb (http://localhost:${config.PORT}/). Tech: React+Vite+TS frontend, Node.js backend. Repo: ${__dirname}/../. Build: npm run build. Test: npm test.`;
    const fullCommand = `${serverContext}\n\nUser: ${this.command}`;

    const args = [
      "run",
      "-m", this.model,
      "--dangerously-skip-permissions",
      fullCommand,
    ];

    const env = { ...process.env };
    if (this.provider === "ollama") {
      env.OPENAI_BASE_URL = "http://127.0.0.1:11434/v1";
      env.OPENAI_API_KEY = "ollama";
    }

    const child = spawn("opencode", args, {
      env,
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      // Allow large output
      maxBuffer: 10 * 1024 * 1024,
    });

    this.process = child;

    child.stdout.on("data", (data) => {
      this._emitOutput(data.toString());
    });

    child.stderr.on("data", (data) => {
      // opencode outputs progress to stderr too
      this._emitOutput(data.toString());
    });

    child.on("error", (err) => {
      this._emitError(err.message);
      this.running = false;
      this.finishedAt = Date.now();
      this.exitCode = -1;
      this._emitDone();
    });

    child.on("close", (code) => {
      this.running = false;
      this.finishedAt = Date.now();
      this.exitCode = code;
      if (code !== 0 && !this.error) {
        this.error = `Process exited with code ${code}`;
      }
      this._emitDone();
    });
  }

  // Cancel the running process
  cancel() {
    if (this.process && this.running) {
      try { this.process.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        if (this.process && this.running) {
          try { this.process.kill("SIGKILL"); } catch {}
        }
      }, 3000);
      this.running = false;
      this.finishedAt = Date.now();
      this.exitCode = -1;
      this.error = "Cancelled by user";
      this._emitError("Cancelled by user");
      this._emitDone();
    }
  }

  // Register an SSE client
  addSSEClient(res) {
    this.sseClients.add(res);
    // Send current state immediately
    if (!this.running) {
      // Session already finished — send output + done
      if (this.output) {
        const payload = JSON.stringify({ type: "output", text: this.output, timestamp: Date.now() });
        try { res.write(`event: output\ndata: ${payload}\n\n`); } catch {}
      }
      const status = this.exitCode === 0 ? "ok" : "error";
      const payload = JSON.stringify({
        type: "done",
        status,
        exitCode: this.exitCode,
        duration: Date.now() - this.startedAt,
        output: this.output,
        finishedAt: this.finishedAt,
        error: this.error,
      });
      try { res.write(`event: done\ndata: ${payload}\n\n`); } catch {}
      // Clean up
      this.sseClients.delete(res);
    }
    // If running — client will receive future events
  }

  // Remove an SSE client
  removeSSEClient(res) {
    this.sseClients.delete(res);
  }

  // Get serializable snapshot
  toJSON() {
    return {
      id: this.id,
      command: this.command,
      model: this.model,
      provider: this.provider,
      running: this.running,
      output: this.output,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      exitCode: this.exitCode,
      error: this.error,
      duration: this.finishedAt ? this.finishedAt - this.startedAt : null,
    };
  }
}

/* ─── Public API ────────────────────────────────────────── */

// Start a new opencode session
function createSession(command, model, provider) {
  const id = genSessionId();
  const session = new OpenCodeSession(id, command, model, provider || "cloud");
  sessions.set(id, session);
  // Defer start so the caller can set up SSE first
  setImmediate(() => session.start());
  return session;
}

// Get session by ID
function getSession(id) {
  return sessions.get(id) || null;
}

// Cancel a session
function cancelSession(id) {
  const session = sessions.get(id);
  if (!session) return false;
  session.cancel();
  return true;
}

// Clean up stale sessions (older than 1 hour)
function cleanupStaleSessions() {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  for (const [id, session] of sessions) {
    if (session.finishedAt && (now - session.finishedAt) > maxAge) {
      sessions.delete(id);
    }
  }
}

// Periodic cleanup
setInterval(cleanupStaleSessions, 15 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  cancelSession,
  sessions,
  stripAnsi,
};
