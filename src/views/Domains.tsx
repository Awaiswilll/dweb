import { useState, useEffect } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  Globe, Plus, RefreshCw, Clock,
  ExternalLink, Copy, AlertTriangle, Search, Shield,
} from "lucide-react";
import type { DomainRecord } from "../types";

/* ─── Mock public domains ─────────────────────────────────── */
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
  const [loading, setLoading] = useState(true);
  const [registerName, setRegisterName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"mine" | "discover">("mine");

  const loadDomains = async () => {
    setLoading(true);
    try {
      // Will use real invoke when backend supports listing
      // const result = await invoke<DomainRecord[]>("list_domains");
      // setDomains(result);
      setDomains([]);
    } catch (e) {
      console.error("Failed to load domains:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDomains(); }, []);

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
      const result = await invoke<DomainRecord>("register_domain", { name });
      setDomains(prev => [...prev, result]);
      setRegisterName("");
    } catch (e) {
      setError(String(e));
    } finally {
      setRegistering(false);
    }
  };

  const filteredPublic = PUBLIC_DOMAINS.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const daysUntilExpiry = (iso: string): number => {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  };

  return (
    <div className="view-container domains-view">
      <div className="view-header">
        <div>
          <h2>dweb Domains</h2>
          <p className="text-muted-sm">Register and manage your <strong>.dweb</strong> domains on the DHT</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={loadDomains}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Register Form */}
      <div className="register-domain-card glass">
        <div className="register-icon"><Globe size={24} /></div>
        <div className="register-body">
          <h4>Register a new .dweb domain</h4>
          <p>Free, permanent, no registrar needed. Yours as long as you renew every 90 days.</p>
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
            <button className="btn btn-primary" onClick={handleRegister} disabled={registering || !registerName.trim()}>
              {registering ? "Registering..." : <><Plus size={14} /> Register</>}
            </button>
          </div>
          {error && <p className="form-error"><AlertTriangle size={12} /> {error}</p>}
          <div className="register-info">
            <Shield size={12} /> <span>Owned by your keypair · 90-day TTL · Auto-renewed while active</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button className={`panel-tab ${activeTab === "mine" ? "active" : ""}`} onClick={() => setActiveTab("mine")}>
          <Globe size={16} /> My Domains
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
                return (
                  <div key={d.name} className="domain-row">
                    <div className="domain-info">
                      <div className="domain-name-row">
                        <span className="domain-name">{d.name}.dweb</span>
                        <span className={`domain-status ${d.active ? "active" : "inactive"}`}>
                          {d.active ? "Active" : "Expired"}
                        </span>
                      </div>
                      <div className="domain-meta">
                        <span><Clock size={12} /> Expires in {daysLeft}d</span>
                        <span><Shield size={12} /> {d.owner_key.slice(0, 12)}...</span>
                      </div>
                    </div>
                    <div className="domain-actions">
                      <button className="btn btn-sm btn-outline" title="Copy dweb URL"
                        onClick={() => navigator.clipboard.writeText(`dweb://${d.name}.dweb`)}>
                        <Copy size={14} />
                      </button>
                      <button className="btn btn-sm btn-outline" title="Open in Browser"
                        onClick={() => onOpenInBrowser?.(`dweb://${d.name}.dweb`)}>
                        <ExternalLink size={14} />
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
              {filteredPublic.map(d => (
                <div key={d.name} className="discover-card glass-sm">
                  <div className="discover-card-header">
                    <Globe size={20} />
                    <h4>{d.name}{d.tld}</h4>
                  </div>
                  <div className="discover-card-body">
                    <span className="discover-owner">Owner: {d.owner}</span>
                    <span className="discover-date">Since {d.registered}</span>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => onOpenInBrowser?.(`dweb://${d.name}${d.tld}`)}>
                    <ExternalLink size={14} /> Visit
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
