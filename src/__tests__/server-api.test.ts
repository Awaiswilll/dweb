// @vitest-environment node
// Server API integration tests — test the HTTP endpoints directly

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { fork, ChildProcess } from "child_process";
import path from "path";

let serverProcess: ChildProcess | null = null;
let baseUrl = "";

beforeAll(async () => {
  // Start the dweb server on a random high port for testing
  const testPort = 41234 + Math.floor(Math.random() * 1000);

  serverProcess = fork(path.resolve(__dirname, "..", "..", "server", "index.cjs"), [], {
    env: {
      ...process.env,
      PORT: String(testPort),
      RELAY_PORT: String(testPort + 10),
      TCP_PORT: String(testPort + 20),
      MODE: "isolated",
      NAME: "dweb-test",
    },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  // Wait for the server to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);

    serverProcess!.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      // Server prints port info early in startup
      if (output.includes("Ports:")) {
        clearTimeout(timeout);
        // Give it a moment to fully start
        setTimeout(resolve, 1500);
      }
    });

    serverProcess!.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    serverProcess!.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Server exited with code ${code}`));
    });
  });

  baseUrl = `http://127.0.0.1:${testPort}`;
});

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    serverProcess = null;
  }
});

function fetchUrl(pathname: string, method = "GET", body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${pathname}`;
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {},
    }, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Request timeout")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("Server API", () => {
  it("should respond to /ping with health check", async () => {
    const { status, data } = await fetchUrl("/ping");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.server).toBe("dweb");
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("mode");
  });

  it("should respond to /status with full instance status", async () => {
    const { status, data } = await fetchUrl("/status");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data).toHaveProperty("serverId");
    expect(data).toHaveProperty("peersOnline");
    expect(data).toHaveProperty("modes");
    expect(data).toHaveProperty("memory");
    expect(data.memory).toHaveProperty("rss");
    expect(data.memory).toHaveProperty("heapUsed");
  });

  it("should respond to /dweb-status with peer info", async () => {
    const { status, data } = await fetchUrl("/dweb-status");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data).toHaveProperty("peerId");
    expect(data).toHaveProperty("localIPs");
    expect(data).toHaveProperty("mode");
    expect(data).toHaveProperty("services");
    expect(data.services).toContain("frontend");
  });

  it("should register and discover peers", async () => {
    // Register a test peer
    const { status: regStatus, data: regData } = await fetchUrl("/register", "POST", {
      id: "test-peer-001",
      hostname: "test-host",
      platform: process.platform,
      version: "0.1.0",
      address: "10.0.0.1",
      port: 9999,
      mode: "p2p-visible",
    });
    expect(regStatus).toBe(201);
    expect(regData.status).toBe("ok");
    expect(regData.action).toBe("registered");
    expect(regData.peerId).toBe("test-peer-001");

    // Discover peers
    const { status: discStatus, data: discData } = await fetchUrl("/discover");
    expect(discStatus).toBe(200);
    expect(discData.status).toBe("ok");
    expect(discData.peers.length).toBeGreaterThanOrEqual(1);
    const found = discData.peers.find((p: any) => p.id === "test-peer-001");
    expect(found).toBeDefined();
    expect(found.hostname).toBe("test-host");
  });

  it("should handle signaling between peers", async () => {
    // Register second peer
    await fetchUrl("/register", "POST", {
      id: "test-peer-002", hostname: "peer2", mode: "p2p-visible",
    });

    // Send signal
    const { status: sigStatus, data: sigData } = await fetchUrl("/signal", "POST", {
      fromPeerId: "test-peer-001",
      targetPeerId: "test-peer-002",
      type: "offer",
      sdp: "test-sdp-data",
    });
    expect(sigStatus).toBe(200);
    expect(sigData.queued).toBe(true);

    // Receive signals
    const { status: recvStatus, data: recvData } = await fetchUrl("/signal?peerId=test-peer-002");
    expect(recvStatus).toBe(200);
    expect(recvData.signals.length).toBeGreaterThanOrEqual(1);
    expect(recvData.signals[0].fromPeerId).toBe("test-peer-001");
    expect(recvData.signals[0].type).toBe("offer");
  });

  it("should handle collaboration services", async () => {
    // List services (should have default services)
    const { status: listStatus, data: listData } = await fetchUrl("/collab/services");
    expect(listStatus).toBe(200);
    expect(listData.services.length).toBeGreaterThanOrEqual(2);
    const names = listData.services.map((s: any) => s.name);
    expect(names).toContain("My Static Website");
    expect(names).toContain("File Share");

    // Add a new service
    const { status: addStatus, data: addData } = await fetchUrl("/collab/services", "POST", {
      name: "Test Service",
      type: "Web App",
      port: 3000,
    });
    expect(addStatus).toBe(201);
    expect(addData.service.name).toBe("Test Service");
  });

  it("should handle file share API", async () => {
    // List files (empty initially)
    const { status, data } = await fetchUrl("/fileshare/api/list");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
    expect(Array.isArray(data.files)).toBe(true);
  });

  it("should handle CORS preflight", async () => {
    const { status } = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(`${baseUrl}/ping`, {
        method: "OPTIONS",
        headers: {
          "Origin": "http://example.com",
          "Access-Control-Request-Method": "GET",
        },
      }, (res) => {
        resolve({ status: res.statusCode || 500 });
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(204);
  });

  it("should serve index.html fallback for unknown routes (SPA)", async () => {
    const { status } = await fetchUrl("/nonexistent-route-12345");
    // SPA fallback: serves dist/index.html for unknown routes
    expect(status).toBe(200);
  });
});
