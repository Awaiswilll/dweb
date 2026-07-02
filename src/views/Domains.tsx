import { useState, useEffect, useCallback } from "react";
import {
  Globe, Plus, RefreshCw, Clock,
  ExternalLink, Copy, AlertTriangle, Search, Shield,
  Layers, Crown, Zap, Unlink, Trash2, ArrowUp,
  Server, Check, X, Loader2, Info,
} from "lucide-react";
import type { DomainRecord, DomainTier, TierInfo, ServiceBinding } from "../types";

/* ─── API Helpers ─────────────────────────────────────────── */
const API_BASE = "/api/domain";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

/* ─── Tier helpers ────────────────────────────────────────── */
const TIER_ICONS: Record<DomainTier, any> = {
  free: Globe,
  premium: Crown,
  business: Zap,
};

const TIER_COLORS: Record<DomainTier, string> = {
  free: "#60a5fa",
  premium: "#f59e0b",
  business: "#a855f7",
};

/* ─── Mock discover data ──────────────────────────────────── */
const PUBLIC_DOMAINS = [
  { name: "mystore", owner: "abc...def", registered: "2026-03-15", tld: ".dweb" },
  { name: "blog", owner: "123...456", registered: "2026-04-01", tld: ".dweb" },
  { name: "portfolio", owner: "789...012", registered: "2026-05-10", tld: ".dweb" },
  { name: "api-docs", owner: "345...678", registered: "2026-05-22", tld: ".dweb" },
];

interface DomainsProps {
  onOpenInBrowser?: (url: string) => void;
}

export default function Domains({ onOpenInBrowser }: DomainsProps) {
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [pricing, setPricing] = useState<Record<string, TierInfo> | null>(null);
  const [services, setServices] = useState<ServiceBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerName, setRegisterName] = useState("");
  const [registerTier, setRegisterTier] = useState<DomainTier>("free");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"mine" | "discover">("mine");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Binding modal state ──
  const [bindTarget, setBindTarget] = useState<DomainRecord | null>(null);
  const [bindServiceName, setBindServiceName] = useState("");
  const [bindPort, setBindPort] = useState("");
  const [binding, setBinding] = useState(false);

  // ── Upgrade modal state ──
  const [upgradeTarget, setUpgradeTarget] = useState<DomainRecord | null>(null);
  const [upgradeTier, setUpgradeTier] = useState<DomainTier>("premium");
  const [upgrading, setUpgrading] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p, s] = await Promise.all([
        api<DomainRecord[]>("/list"),
        api<{ tiers: Record<string, TierInfo> }>("/pricing"),
        api<ServiceBinding[]>("/services"),
      ]);
      setDomains(d);
      setPricing(p.tiers);
      setServices(s);
    } catch (e: any) {
      console.warn("Domain API error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRegister = async () => {
    if (!registerName.trim()) return;
    setRegistering(true);
    setError("");

    const name = registerName.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,63}$/.test(name)) {
      setError("Use 3-63 chars: lowercase letters, numbers, hyphens");
      setRegistering(false);
      return;
    }

    try {
      const result = await api<DomainRecord>("/register", {
        method: "POST",
        body: JSON.stringify({ name, tier: registerTier }),
      });
      setDomains(prev => [...prev, result]);
      setRegisterName("");
      showToast(`Registered ${name}.dweb (${registerTier})`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleBind = async () => {
    if (!bindTarget || !bindPort) return;
    setBinding(true);
    try {
      const result = await api<DomainRecord>("/bind", {
        method: "POST",
        body: JSON.stringify({
          name: bindTarget.name,
          service_name: bindServiceName || null,
          port: parseInt(bindPort, 10),
        }),
      });
      setDomains(prev => prev.map(d => d.name === result.name ? result : d));
      setBindTarget(null);
      showToast(`Bound ${bindTarget.name}.dweb → port ${bindPort}`);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setBinding(false);
    }
  };

  const handleUnbind = async (name: string) => {
    try {
      const result = await api<DomainRecord>("/unbind", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setDomains(prev => prev.map(d => d.name === result.name ? result : d));
      showToast(`Unbound ${name}.dweb`);
    } catch (e: any) {
      showToast(e.message, false);
    }
  };

  const handleUpgrade = async () => {
    if (!upgradeTarget) return;
    setUpgrading(true);
    try {
      const body: any = { name: upgradeTarget.name, new_tier: upgradeTier };
      // Simulated payment for paid tiers
      if ((pricing?.[upgradeTier]?.price ?? 0) > 0) {
        body.payment_method = "card";
      }
      const result = await api<DomainRecord>("/upgrade", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDomains(prev => prev.map(d => d.name === result.name ? result : d));
      setUpgradeTarget(null);
      showToast(`Upgraded ${upgradeTarget.name}.dweb to ${upgradeTier}`);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setUpgrading(false);
    }
  };

  const handleRenew = async (name: string) => {
    try {
      const result = await api<DomainRecord>("/renew", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setDomains(prev => prev.map(d => d.name === result.name ? result : d));
      showToast(`Renewed ${name}.dweb`);
    } catch (e: any) {
      showToast(e.message, false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Remove domain "${name}.dweb"? This cannot be undone.`)) return;
    try {
      await api("/remove", {
        method: "DELETE",
        body: JSON.stringify({ name }),
      });
      setDomains(prev => prev.filter(d => d.name !== name));
      showToast(`Removed ${name}.dweb`);
    } catch (e: any) {
      showToast(e.message, false);
    }
  };

  const daysUntilExpiry = (iso: string | null): number | null => {
    if (!iso) return null;
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  };

  const filteredPublic = PUBLIC_DOMAINS.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const TierIcon = (tier: DomainTier) => {
    const Icon = TIER_ICONS[tier] || Globe;
    return <Icon size={14} />;
  };

  return (
    <div className="view-container domains-view">
      <div className="view-header">
        <div>
          <h2>dweb Domains</h2>
          <p className="text-muted-sm">Register and manage your <strong>.dweb</strong> domains</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.ok ? "toast-success" : "toast-error"}`}>
          {toast.ok ? <Check size={14} /> : <X size={14} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Register Form */}
      <div className="register-domain-card glass">
        <div className="register-icon"><Globe size={24} /></div>
        <div className="register-body">
          <h4>Register a new .dweb domain</h4>
          <p>
            {pricing
              ? Object.values(pricing).map((t, i) => (
                  <span key={i} className="tier-badge" style={{ borderColor: Object.values(TIER_COLORS)[i] }}>
                    {t.label}: ${(t.price / 100).toFixed(2)}{t.permanent ? " (permanent)" : ` (${t.ttlDays}d)`}
                  </span>
                ))
              : "Register your own decentralized domain"}
          </p>
          <div className="register-form">
            <div className="register-input-group">
              <input
                type="text"
                value={registerName}
                onChange={(e) => { setRegisterName(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                placeholder="my-awesome-site"
                className="register-input"
                disabled={registering}
              />
              <span className="register-tld">.dweb</span>
            </div>

            {/* Tier selector */}
            {pricing && (
              <div className="register-tier-group">
                {(Object.entries(pricing) as [DomainTier, TierInfo][]).map(([key, info]) => (
                  <label key={key} className={`tier-option ${registerTier === key ? "selected" : ""}`}
                    style={{ borderColor: registerTier === key ? TIER_COLORS[key] : "transparent" }}>
                    <input
                      type="radio"
                      name="registerTier"
                      value={key}
                      checked={registerTier === key}
                      onChange={() => setRegisterTier(key)}
                    />
                    <span className="tier-option-icon">{TierIcon(key)}</span>
                    <span className="tier-option-label">{info.label}</span>
                    <span className="tier-option-price">
                      {info.price === 0 ? "Free" : `$${(info.price / 100).toFixed(2)}`}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleRegister}
              disabled={registering || !registerName.trim()}>
              {registering ? <><Loader2 size={14} className="spin" /> Registering...</>
                : <><Plus size={14} /> Register</>}
            </button>
          </div>
          {error && <p className="form-error"><AlertTriangle size={12} /> {error}</p>}
          <div className="register-info">
            <Shield size={12} />
            <span>Owned by your keypair · Tiers: Free (90d), Premium ($5 permanent), Business ($20 + custom domain)</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button className={`panel-tab ${activeTab === "mine" ? "active" : ""}`} onClick={() => setActiveTab("mine")}>
          <Globe size={16} /> My Domains {domains.length > 0 && `(${domains.length})`}
        </button>
        <button className={`panel-tab ${activeTab === "discover" ? "active" : ""}`} onClick={() => setActiveTab("discover")}>
          <Search size={16} /> Discover
        </button>
      </div>

      <div className="panel-content glass">
        {activeTab === "mine" && (
          <div className="domains-list">
            {loading ? (
              <div className="loading-pulse"><span /></div>
            ) : domains.length === 0 ? (
              <div className="empty-state-inline">
                <Globe size={32} />
                <h4>No domains yet</h4>
                <p>Register your first .dweb domain above to start publishing.</p>
              </div>
            ) : (
              domains.map(d => {
                const daysLeft = daysUntilExpiry(d.expires_at);
                const TierIconComp = TIER_ICONS[d.tier] || Globe;
                return (
                  <div key={d.name} className="domain-row">
                    <div className="domain-info">
                      <div className="domain-name-row">
                        <span className="domain-name">{d.name}.dweb</span>
                        <span className={`tier-badge badge-${d.tier}`}
                          style={{ borderColor: TIER_COLORS[d.tier], color: TIER_COLORS[d.tier] }}>
                          <TierIconComp size={11} /> {d.tierInfo?.label || d.tier}
                        </span>
                        <span className={`domain-status ${d.active ? "active" : "inactive"}`}>
                          {d.active ? "Active" : "Expired"}
                        </span>
                      </div>
                      <div className="domain-meta">
                        {d.service_name && (
                          <span><Server size={12} /> {d.service_name} (port {d.port})</span>
                        )}
                        {daysLeft !== null && (
                          <span><Clock size={12} /> Expires in {daysLeft}d</span>
                        )}
                        {d.tierInfo?.permanent && (
                          <span><Crown size={12} /> Permanent</span>
                        )}
                        <span><Shield size={12} /> {d.owner_key.slice(0, 12)}...</span>
                      </div>
                    </div>
                    <div className="domain-actions">
                      {/* Copy dweb URL */}
                      <button className="btn btn-sm btn-outline" title="Copy dweb URL"
                        onClick={() => {
                          navigator.clipboard.writeText(`dweb://${d.name}.dweb`);
                          showToast("Copied dweb:// URL");
                        }}>
                        <Copy size={14} />
                      </button>

                      {/* Open in Browser */}
                      <button className="btn btn-sm btn-outline" title="Open in Browser"
                        onClick={() => onOpenInBrowser?.(`dweb://${d.name}.dweb`)}>
                        <ExternalLink size={14} />
                      </button>

                      {/* Bind / Unbind */}
                      {d.port ? (
                        <button className="btn btn-sm btn-outline" title="Unbind from service"
                          onClick={() => handleUnbind(d.name)}>
                          <Unlink size={14} />
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-primary" title="Bind to service"
                          onClick={() => { setBindTarget(d); setBindServiceName(""); setBindPort(""); }}>
                          <Layers size={14} /> Bind
                        </button>
                      )}

                      {/* Upgrade (only if not business) */}
                      {d.tier !== "business" && (
                        <button className="btn btn-sm btn-outline" title="Upgrade tier"
                          onClick={() => { setUpgradeTarget(d); setUpgradeTier("premium"); }}>
                          <ArrowUp size={14} />
                        </button>
                      )}

                      {/* Renew (only if not permanent) */}
                      {!d.tierInfo?.permanent && (
                        <button className="btn btn-sm btn-outline" title="Renew"
                          onClick={() => handleRenew(d.name)}>
                          <RefreshCw size={14} />
                        </button>
                      )}

                      {/* Remove */}
                      <button className="btn btn-sm btn-danger" title="Remove domain"
                        onClick={() => handleRemove(d.name)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "discover" && (
          <div className="discover-panel">
            <div className="search-bar">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search public .dweb domains..."
                className="search-input"
              />
            </div>
            <div className="discover-grid">
              {filteredPublic.length === 0 ? (
                <div className="empty-state-inline">
                  <Search size={24} />
                  <p>No matching domains found</p>
                </div>
              ) : (
                filteredPublic.map(d => (
                  <div key={d.name} className="discover-card glass-sm">
                    <div className="discover-card-header">
                      <Globe size={20} />
                      <h4>{d.name}{d.tld}</h4>
                    </div>
                    <div className="discover-card-body">
                      <span className="discover-owner">Owner: {d.owner}</span>
                      <span className="discover-date">Since {d.registered}</span>
                    </div>
                    <button className="btn btn-sm btn-primary"
                      onClick={() => onOpenInBrowser?.(`dweb://${d.name}${d.tld}`)}>
                      <ExternalLink size={14} /> Visit
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bind Modal ── */}
      {bindTarget && (
        <div className="modal-overlay" onClick={() => setBindTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Bind {bindTarget.name}.dweb</h3>
              <button className="btn-close" onClick={() => setBindTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="text-muted-sm">Link this domain to a running service</p>

              <div className="form-group">
                <label>Service (optional)</label>
                <select value={bindServiceName} onChange={e => {
                  const svc = services.find(s => s.name === e.target.value);
                  setBindServiceName(e.target.value);
                  if (svc) setBindPort(String(svc.port));
                }}>
                  <option value="">-- Select service --</option>
                  {services.map(s => (
                    <option key={s.name} value={s.name}>{s.name} (port {s.port})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Port <span className="required">*</span></label>
                <input type="number" value={bindPort} onChange={e => setBindPort(e.target.value)}
                  placeholder="e.g. 2901" min={1} max={65535} />
              </div>

              {bindTarget.tier === "business" && (
                <div className="form-group">
                  <label>Custom domain (optional)</label>
                  <input type="text" placeholder="example.com" />
                  <p className="form-hint">Requires DNS configuration outside dweb</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBindTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleBind} disabled={binding || !bindPort}>
                {binding ? <><Loader2 size={14} className="spin" /> Binding...</> : "Bind Domain"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade Modal ── */}
      {upgradeTarget && pricing && (
        <div className="modal-overlay" onClick={() => setUpgradeTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upgrade {upgradeTarget.name}.dweb</h3>
              <button className="btn-close" onClick={() => setUpgradeTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="text-muted-sm">Current tier: <strong>{upgradeTarget.tierInfo?.label || upgradeTarget.tier}</strong></p>
              <div className="upgrade-tier-list">
                {(Object.entries(pricing) as [DomainTier, TierInfo][]).map(([key, info]) => {
                  if (key === upgradeTarget.tier) return null; // skip current tier
                  return (
                    <label key={key}
                      className={`tier-option ${upgradeTier === key ? "selected" : ""}`}
                      style={{ borderColor: upgradeTier === key ? TIER_COLORS[key] : "transparent" }}>
                      <input type="radio" name="upgradeTier" value={key}
                        checked={upgradeTier === key}
                        onChange={() => setUpgradeTier(key)} />
                      <div className="tier-option-content">
                        <span className="tier-option-icon">{TierIcon(key)}</span>
                        <div>
                          <div className="tier-option-label">{info.label}</div>
                          <div className="tier-option-desc">{info.description}</div>
                        </div>
                        <span className="tier-option-price">
                          {info.price === 0 ? "Free" : `$${(info.price / 100).toFixed(2)}/yr`}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {pricing[upgradeTier]?.price > 0 && (
                <div className="payment-notice glass-sm">
                  <Info size={14} />
                  <span>Payment of <strong>${(pricing[upgradeTier].price / 100).toFixed(2)}</strong> will be processed (simulated)</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setUpgradeTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpgrade}
                disabled={upgrading}>
                {upgrading ? <><Loader2 size={14} className="spin" /> Upgrading...</>
                  : <>Upgrade to {pricing[upgradeTier]?.label}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
