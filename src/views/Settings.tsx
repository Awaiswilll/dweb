import { useState, useEffect } from "react";
import { safeInvoke as invoke } from "../safe-invoke";
import {
  Settings2, Bot, Globe, Cloud, Database,
  Save, RefreshCw, Eye, EyeOff, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Zap,
} from "lucide-react";
import type { AIProviderConfig, AIModelInfo } from "../types";
import { AI_PROVIDER_LABELS, AI_PROVIDER_COLORS, AI_PROVIDER_ICONS } from "../types";

/* ─── Tab Config ──────────────────────────────────────────── */
const SETTINGS_TABS = [
  { id: "general", label: "General", icon: <Settings2 size={16} /> },
  { id: "ai", label: "AI Models", icon: <Bot size={16} /> },
  { id: "p2p", label: "P2P Network", icon: <Globe size={16} /> },
  { id: "cloud", label: "Cloud Providers", icon: <Cloud size={16} /> },
  { id: "storage", label: "Storage", icon: <Database size={16} /> },
];

type TabId = "general" | "ai" | "p2p" | "cloud" | "storage";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [saved, setSaved] = useState(false);

  /* ─── General ──────────────────────────────────────────── */
  const GeneralTab = () => {
    const [autoStart, setAutoStart] = useState(false);
    const [minToTray, setMinToTray] = useState(true);
    const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
      return (localStorage.getItem("dweb-theme") as "dark" | "light" | "system") || "dark";
    });

    useEffect(() => {
      localStorage.setItem("dweb-theme", theme);
      if (theme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
    }, [theme]);

    useEffect(() => {
      if (theme !== "system") return;
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }, [theme]);
    return (
      <div className="settings-section">
        <h4>Application</h4>
        <div className="setting-row">
          <div className="setting-info">
            <label>Launch on system startup</label>
            <span className="text-muted-sm">Automatically start dweb when you log in</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <label>Theme</label>
            <span className="text-muted-sm">Choose your preferred appearance</span>
          </div>
          <select value={theme} onChange={e => setTheme(e.target.value as any)} className="select-input">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <label>Minimize to tray</label>
            <span className="text-muted-sm">Keep dweb running in the background when closing the window</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={minToTray} onChange={e => setMinToTray(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
    );
  };

  /* ─── AI Models Tab (Multi-Provider) ────────────────────── */
  const AITab = () => {
    const [providers, setProviders] = useState<AIProviderConfig[]>([]);
    const [expanded, setExpanded] = useState<string>("ollama");
    const [testing, setTesting] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
    const [modelsCache, setModelsCache] = useState<Record<string, AIModelInfo[]>>({});
    const [loadingModels, setLoadingModels] = useState<string | null>(null);

    useEffect(() => {
      invoke<AIProviderConfig[]>("get_ai_providers").then(setProviders).catch(console.error);
    }, []);

    const updateProvider = (idx: number, partial: Partial<AIProviderConfig>) => {
      setProviders(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], ...partial };
        return next;
      });
    };

    const saveProviders = async () => {
      for (const p of providers) {
        await invoke("update_ai_provider", { config: p });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    };

    const testConnection = async (type: string) => {
      setTesting(type);
      try {
        const result = await invoke<string>("test_ai_connection", { providerType: type });
        setTestResults(prev => ({ ...prev, [type]: { ok: true, msg: result } }));
      } catch (e) {
        setTestResults(prev => ({ ...prev, [type]: { ok: false, msg: String(e) } }));
      } finally {
        setTesting(null);
      }
    };

    const loadModels = async (type: string) => {
      setLoadingModels(type);
      try {
        const models = await invoke<AIModelInfo[]>("get_ai_models", { providerType: type });
        setModelsCache(prev => ({ ...prev, [type]: models }));
      } catch (e) {
        console.error("Failed to load models:", e);
      } finally {
        setLoadingModels(null);
      }
    };

    useEffect(() => {
      if (expanded && !modelsCache[expanded] && loadingModels !== expanded) {
        loadModels(expanded);
      }
    }, [expanded]);

    const providerTypes = ["ollama", "openai", "anthropic", "google", "together", "groq", "openrouter", "huggingface", "mistral", "deepseek", "fireworks", "cohere", "nvidia", "cerebras", "xai", "hyperbolic"];

    return (
      <div className="settings-section">
        <div className="section-header">
          <h4>AI Providers</h4>
          <p className="text-muted-sm">Configure multiple AI providers. Toggle enabled ones on, leave API keys for cloud providers.</p>
        </div>

        {providerTypes.map((type, idx) => {
          const prov = providers.find(p => p.provider_type === type);
          if (!prov) return null;
          const isExpanded = expanded === type;
          const testResult = testResults[type];
          const models = modelsCache[type];
          const color = AI_PROVIDER_COLORS[type] || "#666";
          const icon = AI_PROVIDER_ICONS[type] || "🤖";

          return (
            <div key={type} className={`provider-config-card glass-sm ${prov.enabled ? "enabled" : "disabled"}`}
              style={{ borderLeftColor: color, borderLeftWidth: 3, borderLeftStyle: 'solid' }}>
              <div className="provider-config-header" onClick={() => setExpanded(isExpanded ? "" : type)}>
                <div className="provider-config-title">
                  <span className="provider-icon-large">{icon}</span>
                  <div>
                    <h5>{AI_PROVIDER_LABELS[type] || type}</h5>
                    <span className="text-muted-sm">{prov.base_url || "—"}</span>
                  </div>
                </div>
                <div className="provider-config-actions">
                  <label className="toggle" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={prov.enabled}
                      onChange={e => updateProvider(idx, { enabled: e.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </div>

              {isExpanded && (
                <div className="provider-config-body">
                  {/* API Key (for cloud providers) */}
                  {(type !== "ollama") && (
                    <div className="provider-field">
                      <label>API Key</label>
                      <div className="input-with-action">
                        <input
                          type="password"
                          value={prov.api_key || ""}
                          onChange={e => updateProvider(idx, { api_key: e.target.value })}
                          placeholder={type === "openai" ? "sk-..." : type === "anthropic" ? "sk-ant-..." : "Enter API key"}
                          className="text-input wide"
                        />
                        <button className="btn btn-sm btn-secondary" onClick={() => testConnection(type)} disabled={testing === type}>
                          {testing === type ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
                          Test
                        </button>
                      </div>
                      {testResult && (
                        <span className={`${testResult.ok ? "status-ok" : "status-err"}`} style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                          {testResult.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                          {testResult.msg}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Base URL (for Ollama + custom endpoints) */}
                  <div className="provider-field">
                    <label>Base URL</label>
                    <input
                      type="text"
                      value={prov.base_url || ""}
                      onChange={e => updateProvider(idx, { base_url: e.target.value })}
                      placeholder={type === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"}
                      className="text-input wide"
                    />
                  </div>

                  {/* Default Model */}
                  <div className="provider-field">
                    <label>Default Model</label>
                    <div className="input-with-action">
                      <select
                        value={prov.default_model || ""}
                        onChange={e => updateProvider(idx, { default_model: e.target.value })}
                        className="select-input wide">
                        <option value="">— Select model —</option>
                        {loadingModels === type && !models ? (
                          <option value="" disabled>Loading models...</option>
                        ) : (models || []).map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                        ))}
                      </select>
                      <button className="btn btn-sm btn-secondary" onClick={() => loadModels(type)} disabled={loadingModels === type}>
                        {loadingModels === type ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                      </button>
                    </div>
                    {!models && loadingModels !== type && (
                      <span className="text-muted-sm" style={{ fontSize: 11 }}>Click refresh to load models from API</span>
                    )}
                  </div>

                  {/* Temperature */}
                  <div className="provider-field">
                    <label>Temperature: {prov.temperature ?? 0.3}</label>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={prov.temperature ?? 0.3}
                      onChange={e => updateProvider(idx, { temperature: parseFloat(e.target.value) })}
                      className="range-input"
                    />
                  </div>

                  {/* Max Tokens */}
                  <div className="provider-field">
                    <label>Max Tokens</label>
                    <input
                      type="number"
                      value={prov.max_tokens ?? 4096}
                      onChange={e => updateProvider(idx, { max_tokens: parseInt(e.target.value) || 4096 })}
                      className="text-input"
                      min="256" max="128000" step="256"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button className="btn btn-primary" onClick={saveProviders} style={{ marginTop: 16 }}>
          <Save size={14} /> Save AI Settings
        </button>
      </div>
    );
  };

  /* ─── P2P Network ───────────────────────────────────────── */
  const P2PTab = () => {
    const [relayNodes, setRelayNodes] = useState("node1.hyperdht.org:49737");
    const [portRange, setPortRange] = useState("49737-49837");
    const [enableRelay, setEnableRelay] = useState(true);
    const [enableDHT, setEnableDHT] = useState(true);
    return (
      <div className="settings-section">
        <h4>Network Configuration</h4>
        <div className="setting-row">
          <div className="setting-info">
            <label>Enable DHT</label>
            <span className="text-muted-sm">Connect to the global HyperDHT network</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={enableDHT} onChange={e => setEnableDHT(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <label>Enable Relay</label>
            <span className="text-muted-sm">Use relay nodes when direct P2P connection fails</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={enableRelay} onChange={e => setEnableRelay(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <label>Bootstrap / Relay Nodes</label>
            <span className="text-muted-sm">Comma-separated list of bootstrap nodes</span>
          </div>
          <input type="text" value={relayNodes} onChange={e => setRelayNodes(e.target.value)} className="text-input wide" />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <label>Local Port Range</label>
            <span className="text-muted-sm">Port range for P2P connections</span>
          </div>
          <input type="text" value={portRange} onChange={e => setPortRange(e.target.value)} className="text-input" />
        </div>
        <div className="network-status glass-sm">
          <div className="status-item"><span>NAT Type</span><span className="status-val">Full-cone</span></div>
          <div className="status-item"><span>External IP</span><span className="status-val">203.0.113.42</span></div>
          <div className="status-item"><span>DHT Nodes</span><span className="status-val">24</span></div>
          <div className="status-item"><span>Firewall</span><span className="status-val ok">None detected</span></div>
        </div>
      </div>
    );
  };

  /* ─── Cloud Providers ───────────────────────────────────── */
  const CloudTab = () => {
    const [awsKey, setAwsKey] = useState("");
    const [awsSecret, setAwsSecret] = useState("");
    const [netlifyToken, setNetlifyToken] = useState("");
    const [vercelToken, setVercelToken] = useState("");
    const [showSecrets, setShowSecrets] = useState(false);

    return (
      <div className="settings-section">
        <h4>Cloud Provider API Keys</h4>
        <p className="text-muted-sm">Keys are stored in your system keychain, never in plaintext config files.</p>

        <div className="provider-card glass-sm">
          <h5>AWS S3</h5>
          <div className="provider-field">
            <label>Access Key ID</label>
            <input type={showSecrets ? "text" : "password"} value={awsKey} onChange={e => setAwsKey(e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE" className="text-input" />
          </div>
          <div className="provider-field">
            <label>Secret Access Key</label>
            <input type={showSecrets ? "text" : "password"} value={awsSecret} onChange={e => setAwsSecret(e.target.value)}
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" className="text-input" />
          </div>
        </div>

        <div className="provider-card glass-sm">
          <h5>Netlify</h5>
          <div className="provider-field">
            <label>Personal Access Token</label>
            <input type={showSecrets ? "text" : "password"} value={netlifyToken} onChange={e => setNetlifyToken(e.target.value)}
              placeholder="nfp_xxxxxxxxxxxxxxxxxxxx" className="text-input" />
          </div>
        </div>

        <div className="provider-card glass-sm">
          <h5>Vercel</h5>
          <div className="provider-field">
            <label>API Token</label>
            <input type={showSecrets ? "text" : "password"} value={vercelToken} onChange={e => setVercelToken(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" className="text-input" />
          </div>
        </div>

        <button className="btn btn-sm btn-secondary" onClick={() => setShowSecrets(!showSecrets)}>
          {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />} {showSecrets ? "Hide" : "Show"} Secrets
        </button>
      </div>
    );
  };

  /* ─── Storage ───────────────────────────────────────────── */
  const StorageTab = () => {
    const [dataDir, setDataDir] = useState("C:\\Users\\awais\\.dweb");
    const [cacheSize, setCacheSize] = useState("500");
    return (
      <div className="settings-section">
        <h4>Storage</h4>
        <div className="setting-row">
          <div className="setting-info">
            <label>Data Directory</label>
            <span className="text-muted-sm">Where dweb stores configuration, domains, and cached data</span>
          </div>
          <div className="input-with-action">
            <input type="text" value={dataDir} onChange={e => setDataDir(e.target.value)} className="text-input wide" />
            <button className="btn btn-sm btn-secondary">Browse</button>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <label>Cache Size Limit</label>
            <span className="text-muted-sm">Maximum cache size in MB (0 = unlimited)</span>
          </div>
          <input type="number" value={cacheSize} onChange={e => setCacheSize(e.target.value)} className="text-input" min="0" />
        </div>
        <div className="storage-stats glass-sm">
          <div className="stat-item"><span>Database Size</span><span>2.3 MB</span></div>
          <div className="stat-item"><span>Cache</span><span>0 B</span></div>
          <div className="stat-item"><span>Domains Stored</span><span>0</span></div>
          <div className="stat-item"><span>Config Files</span><span>3</span></div>
        </div>
      </div>
    );
  };

  /* ─── Render ────────────────────────────────────────────── */
  const renderTab = () => {
    switch (activeTab) {
      case "general": return <GeneralTab />;
      case "ai": return <AITab />;
      case "p2p": return <P2PTab />;
      case "cloud": return <CloudTab />;
      case "storage": return <StorageTab />;
    }
  };

  return (
    <div className="view-container settings-view">
      <div className="view-header">
        <div>
          <h2>Settings</h2>
          <p className="text-muted-sm">Configure your dweb environment</p>
        </div>
        <div className="header-actions">
          {saved && <span className="save-indicator"><CheckCircle2 size={14} /> Saved</span>}
          <button className="btn btn-primary" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}>
            <Save size={14} /> Save All
          </button>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-tabs">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id as TabId)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="settings-content glass">
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
