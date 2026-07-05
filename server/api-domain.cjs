// ═══════════════════════════════════════════════════════════════════════════════
//  dweb — Domain Management API (/api/domain/*)
//  Register, bind, resolve, list, upgrade, renew, and remove .dweb domains
// ═══════════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");
const http = require("http");
const config = require("./config.cjs");
const { json, parseBody, httpReq } = require("./helpers.cjs");
const {
  getDomainRecord, setDomainRecord, deleteDomainRecord, listDomainRecords,
  addHostedService, removeHostedService, hostedServices, peers,
} = require("./state.cjs");

// ─── Peer Domain Resolve Cache ──────────────────────────
const peerResolveCache = new Map();  // name -> { record, timestamp }
const PEER_RESOLVE_TTL = 60_000;    // 1 minute before re-querying peers

async function queryPeersForDomain(name) {
  const peerEntries = [];
  for (const [id, peer] of peers) {
    if (peer.address && peer.port && peer.address !== "0.0.0.0") {
      peerEntries.push({ id, address: peer.address, port: peer.port });
    }
  }
  if (peerEntries.length === 0) return null;

  const results = await Promise.allSettled(
    peerEntries.map(p =>
      httpReq("GET", p.address, p.port, `/api/domain/query/${encodeURIComponent(name)}`)
        .then(r => ({ peerId: p.id, result: r }))
        .catch(() => null)
    )
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value && r.value.result?.status === "ok" && r.value.result?.record) {
      console.log(`  [domains] Resolved "${name}.dweb" via peer ${r.value.peerId.slice(0, 16)}…`);
      return r.value.result.record;
    }
  }
  return null;
}

/* ─── Domain Tiers ─────────────────────────────────────── */
const TIERS = {
  free:     { label: "Free",     price: 0,      ttlDays: 90,     permanent: false, customDomain: false, ssl: false, description: "Basic .dweb domain, 90-day expiry" },
  premium:  { label: "Premium",  price: 500,    ttlDays: 36500,  permanent: true,  customDomain: false, ssl: true,  description: "Permanent .dweb domain with SSL" },
  business: { label: "Business", price: 2000,   ttlDays: 36500,  permanent: true,  customDomain: true,  ssl: true,  description: "Unlimited domains + custom domain support" },
};

const VALID_TIERS = Object.keys(TIERS);
const OWNER_KEY = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/* ─── Helpers ──────────────────────────────────────────── */

function makeRecord(name, tier) {
  const info = TIERS[tier];
  const now = new Date();
  const expires = info.permanent ? null : new Date(now.getTime() + info.ttlDays * 86400000).toISOString();
  return {
    owner_key: OWNER_KEY,
    address: null,
    path: "/",
    tier,
    tierInfo: info,
    service_name: null,
    port: null,
    custom_domain: null,
    registered_at: now.toISOString(),
    expires_at: expires,
    auto_renew: tier === "free" ? false : true,
    active: true,
    paid_until: info.price > 0 ? now.toISOString() : null,
    local_ip: config.LOCAL_IPS[0] || "127.0.0.1",
  };
}

function isValidDomain(name) {
  return /^[a-z0-9-]{3,63}$/.test(name);
}

function isNameAvailable(name) {
  return !getDomainRecord(name);
}

/* ─── Routes ───────────────────────────────────────────── */

function registerRoutes(router) {

  // GET /api/domain/pricing — get domain pricing tiers
  router.get("/api/domain/pricing", (req, res) => {
    json(res, 200, { status: "ok", tiers: TIERS });
  });

  // GET /api/domain/list — list all domains owned by this instance
  router.get("/api/domain/list", (req, res) => {
    const domains = listDomainRecords();
    json(res, 200, domains);
  });

  // POST /api/domain/register — register a new .dweb domain
  router.post("/api/domain/register", async (req, res) => {
    const body = await parseBody(req);
    const name = (body.name || "").trim().toLowerCase();
    const tier = body.tier || "free";

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }
    if (!isValidDomain(name)) {
      return json(res, 400, { status: "error", error: "Use 3-63 chars: lowercase letters, numbers, hyphens" });
    }
    if (!isNameAvailable(name)) {
      return json(res, 409, { status: "error", error: `Domain "${name}.dweb" is already registered` });
    }
    if (!VALID_TIERS.includes(tier)) {
      return json(res, 400, { status: "error", error: `Invalid tier: ${tier}. Valid: ${VALID_TIERS.join(", ")}` });
    }

    const record = makeRecord(name, tier);
    setDomainRecord(name, record);
    console.log(`  [domains] Registered "${name}.dweb" (${tier})`);

    json(res, 201, { ...record, name });
  });

  // POST /api/domain/bind — bind a domain to a service or port
  router.post("/api/domain/bind", async (req, res) => {
    const body = await parseBody(req);
    const name = (body.name || "").trim().toLowerCase();
    const serviceName = body.service_name || null;
    let port = body.port ? parseInt(body.port, 10) : null;
    const customDomain = body.custom_domain || null;

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }

    const record = getDomainRecord(name);
    if (!record) {
      return json(res, 404, { status: "error", error: `Domain "${name}.dweb" not found` });
    }

    // If a service name is given, find its port
    if (serviceName) {
      const svc = hostedServices.find(s => s.name === serviceName);
      if (svc) {
        port = svc.port;
      }
    }

    if (!port) {
      return json(res, 400, { status: "error", error: "Port or service_name is required" });
    }

    // Allow business tier to set custom domain
    if (customDomain && record.tier !== "business") {
      return json(res, 403, { status: "error", error: "Custom domains require Business tier" });
    }

    // Auto-register as a hosted service for P2P discovery
    const svcName = serviceName || `${name}-domain`;
    const svcUrl = `http://127.0.0.1:${port}`;
    addHostedService(svcName, "Domain", port, svcUrl);

    // Determine the service path
    const svcPath = body.path || record.path || "/";
    const updated = {
      ...record,
      service_name: svcName,
      port,
      path: svcPath,
      address: config.LOCAL_IPS[0] || "127.0.0.1",
      custom_domain: customDomain || null,
    };
    setDomainRecord(name, updated);
    console.log(`  [domains] Bound "${name}.dweb" → port ${port}${serviceName ? ` (service: ${serviceName})` : ""} path="${svcPath}"`);

    json(res, 200, { ...updated, name });
  });

  // POST /api/domain/unbind — unbind a domain from its service
  router.post("/api/domain/unbind", async (req, res) => {
    const body = await parseBody(req);
    const name = (body.name || "").trim().toLowerCase();

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }

    const record = getDomainRecord(name);
    if (!record) {
      return json(res, 404, { status: "error", error: `Domain "${name}.dweb" not found` });
    }

    // Remove from hosted services
    if (record.service_name) {
      removeHostedService(record.service_name);
    }

    const updated = {
      ...record,
      service_name: null,
      port: null,
      address: null,
      custom_domain: null,
    };
    setDomainRecord(name, updated);
    console.log(`  [domains] Unbound "${name}.dweb"`);

    json(res, 200, { ...updated, name });
  });

  // POST /api/domain/upgrade — upgrade domain tier
  router.post("/api/domain/upgrade", async (req, res) => {
    const body = await parseBody(req);
    const name = (body.name || "").trim().toLowerCase();
    const newTier = body.new_tier;

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }
    if (!newTier || !VALID_TIERS.includes(newTier)) {
      return json(res, 400, { status: "error", error: "Valid new_tier is required" });
    }

    const record = getDomainRecord(name);
    if (!record) {
      return json(res, 404, { status: "error", error: `Domain "${name}.dweb" not found` });
    }

    // Simulate payment for paid tiers
    if (TIERS[newTier].price > 0) {
      console.log(`  [domains] Upgrading "${name}.dweb" to ${newTier} — payment simulated`);
    }

    const info = TIERS[newTier];
    const updated = {
      ...record,
      tier: newTier,
      tierInfo: info,
      expires_at: info.permanent ? null : new Date(Date.now() + info.ttlDays * 86400000).toISOString(),
      paid_until: info.price > 0 ? new Date().toISOString() : record.paid_until,
      auto_renew: info.price > 0,
    };
    setDomainRecord(name, updated);
    console.log(`  [domains] Upgraded "${name}.dweb" to ${newTier}`);

    json(res, 200, { ...updated, name });
  });

  // POST /api/domain/renew — renew domain
  router.post("/api/domain/renew", async (req, res) => {
    const body = await parseBody(req);
    const name = (body.name || "").trim().toLowerCase();

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }

    const record = getDomainRecord(name);
    if (!record) {
      return json(res, 404, { status: "error", error: `Domain "${name}.dweb" not found` });
    }
    if (record.tierInfo?.permanent) {
      return json(res, 400, { status: "error", error: "Permanent domains don't need renewal" });
    }

    const info = TIERS[record.tier];
    const updated = {
      ...record,
      expires_at: new Date(Date.now() + info.ttlDays * 86400000).toISOString(),
      active: true,
    };
    setDomainRecord(name, updated);
    console.log(`  [domains] Renewed "${name}.dweb"`);

    json(res, 200, { ...updated, name });
  });

  // DELETE /api/domain/remove — remove a domain
  router.delete("/api/domain/remove", async (req, res) => {
    const body = await parseBody(req);
    const name = (body.name || "").trim().toLowerCase();

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }

    const record = getDomainRecord(name);
    if (!record) {
      return json(res, 404, { status: "error", error: `Domain "${name}.dweb" not found` });
    }

    // Remove from hosted services
    if (record.service_name) {
      removeHostedService(record.service_name);
    }

    deleteDomainRecord(name);
    console.log(`  [domains] Removed "${name}.dweb"`);

    json(res, 200, { status: "ok", message: `Removed ${name}.dweb` });
  });

  // ─── Peer-facing query endpoint ──────────────────────────────
  // GET /api/domain/query/:name — returns raw domain record (for peer-to-peer resolution)
  router.get(/^\/api\/domain\/query\/([a-zA-Z0-9_-]+)$/, (req, res, match) => {
    const name = (match[1] || "").trim().toLowerCase();
    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }
    const record = getDomainRecord(name);
    if (!record) {
      return json(res, 404, { status: "error", error: `Domain "${name}.dweb" not found locally` });
    }
    json(res, 200, { status: "ok", record: { ...record, name } });
  });

  // ─── Resolve endpoint with P2P fallback ──────────────────────
  // GET /api/domain/resolve/:name — resolve domain to address + port (for Browser)
  // Falls back to querying connected peers when not found locally.
  router.get(/^\/api\/domain\/resolve\/([a-zA-Z0-9_-]+)$/, async (req, res, match) => {
    const name = (match[1] || "").trim().toLowerCase();

    if (!name) {
      return json(res, 400, { status: "error", error: "Domain name is required" });
    }

    // 1. Check local registry
    let record = getDomainRecord(name);

    // 2. Check peer-resolve cache (avoids re-querying peers every time)
    if (!record) {
      const cached = peerResolveCache.get(name);
      if (cached && Date.now() - cached.timestamp < PEER_RESOLVE_TTL) {
        record = cached.record;
        console.log(`  [domains] Resolved "${name}.dweb" from peer cache`);
      }
    }

    // 3. Query connected peers
    if (!record) {
      record = await queryPeersForDomain(name);
      if (record) {
        peerResolveCache.set(name, { record, timestamp: Date.now() });
      }
    }

    if (!record) {
      return json(res, 404, {
        status: "error",
        error: `Domain "${name}.dweb" not found on this instance or any connected peer`,
        name,
        peer_count: peers.size,
      });
    }

    if (!record.port || !record.address) {
      return json(res, 200, {
        status: "ok",
        name,
        resolved: false,
        record: { ...record, name },
        message: "Domain registered but not bound to any service yet",
      });
    }

    json(res, 200, {
      status: "ok",
      name,
      resolved: true,
      record: { ...record, name },
      address: record.address,
      port: record.port,
      path: record.path || "/",
      url: `http://${record.address}:${record.port}${record.path || "/"}`,
    });
  });

  // GET /api/domain/services — running services available for binding (already in api-services.cjs)
  // This is just a passthrough — already registered in api-services.cjs

  // ─── P2P Content Proxy ───────────────────────────────────────────
  // GET /api/proxy/fetch?url=... — fetches remote content (for BrowserView)
  // Allows the non-Tauri BrowserView to render content from peer instances.
  router.get("/api/proxy/fetch", async (req, res) => {
    const targetUrl = req.url.searchParams.get("url");
    if (!targetUrl) {
      return json(res, 400, { status: "error", error: "Missing ?url= parameter" });
    }

    try {
      const parsed = new URL(targetUrl);
      const proxyData = await new Promise((resolve, reject) => {
        const opts = {
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname + parsed.search,
          method: "GET",
          timeout: 10000,
          headers: { "User-Agent": "dweb-proxy/0.1" },
        };
        const proxyReq = http.request(opts, proxyRes => {
          let body = "";
          proxyRes.on("data", c => { body += c; if (body.length > 5e6) proxyReq.destroy(); });
          proxyRes.on("end", () => resolve({ status: proxyRes.statusCode, headers: proxyRes.headers, body }));
        });
        proxyReq.on("error", reject);
        proxyReq.on("timeout", () => { proxyReq.destroy(); reject(new Error("timeout")); });
        proxyReq.end();
      });

      if (proxyData.status !== 200) {
        return json(res, proxyData.status, { status: "error", error: `Remote returned ${proxyData.status}` });
      }

      // Return as HTML with CORS headers
      res.writeHead(200, {
        "Content-Type": proxyData.headers["content-type"] || "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Dweb-Proxy": "true",
        "X-Dweb-Source": targetUrl,
      });
      res.end(proxyData.body);
    } catch (e) {
      json(res, 502, { status: "error", error: `Proxy failed: ${e.message}` });
    }
  });
}

module.exports = { registerRoutes };
