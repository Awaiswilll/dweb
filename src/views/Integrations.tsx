import { useState, useEffect } from "react";
import {
  CheckCircle2, AlertTriangle, Save, Zap, ChevronDown, ChevronRight,
  RefreshCw,
} from "lucide-react";
import type { IntegrationConfig, IntegrationPlatform } from "../types";
import { INTEGRATION_PLATFORMS } from "../types";

const STORAGE_KEY = "dweb-integrations";

const DEFAULTS: IntegrationConfig[] = [
  { platform: "discord",   label: "Discord",    enabled: false, webhook_url: "",                              verified: false, lastTested: null, label_icon: "💬", color: "#5865F2" },
  { platform: "whatsapp",  label: "WhatsApp",   enabled: false, api_key: "", phone_number_id: "",             verified: false, lastTested: null, label_icon: "📱", color: "#25D366" },
  { platform: "linkedin",  label: "LinkedIn",   enabled: false, access_token: "", company_id: "",             verified: false, lastTested: null, label_icon: "💼", color: "#0A66C2" },
  { platform: "telegram",  label: "Telegram X", enabled: false, bot_token: "",                               verified: false, lastTested: null, label_icon: "✈️", color: "#26A5E4" },
  { platform: "github",    label: "GitHub",     enabled: false, access_token: "", webhook_url: "",            verified: false, lastTested: null, label_icon: "🐙", color: "#2b3137" },
  { platform: "gitlab",    label: "GitLab",     enabled: false, access_token: "", webhook_url: "",            verified: false, lastTested: null, label_icon: "🦊", color: "#FC6D26" },
];

function load(): IntegrationConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as IntegrationConfig[];
      return DEFAULTS.map(def => {
        const saved = parsed.find(p => p.platform === def.platform);
        return saved ? { ...def, ...saved } : def;
      });
    }
  } catch { /* ignore */ }
  return DEFAULTS.map(c => ({ ...c }));
}

export default function Integrations() {
  const [configs, setConfigs] = useState<IntegrationConfig[]>(load);
  const [expanded, setExpanded] = useState<IntegrationPlatform>("discord");
  const [testing, setTesting] = useState<IntegrationPlatform | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  }, [configs]);

  const update = (platform: IntegrationPlatform, partial: Partial<IntegrationConfig>) => {
    setConfigs(prev => prev.map(c => c.platform === platform ? { ...c, ...partial } : c));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = (platform: IntegrationPlatform) => {
    const config = configs.find(c => c.platform === platform);
    if (!config) return;
    setTesting(platform);
    setTimeout(() => {
      const result = { ok: false, msg: "Not yet implemented — backend service pending" };
      setTestResults(prev => ({ ...prev, [platform]: result }));
      update(platform, { verified: false, lastTested: new Date().toISOString() });
      setTesting(null);
    }, 400);
  };

  return (
    <div className="view-container integrations-view">
      <div className="view-header">
        <div>
          <h2>Integrations</h2>
          <p className="text-muted-sm">
            Connect social & messaging platforms for notifications, build alerts, and deployment updates
          </p>
        </div>
        <div className="header-actions">
          {saved && <span className="save-indicator"><CheckCircle2 size={14} /> Saved</span>}
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={14} /> Save All
          </button>
        </div>
      </div>

      <div className="integrations-grid">
        {configs.map(config => {
          const meta = INTEGRATION_PLATFORMS[config.platform];
          const isExpanded = expanded === config.platform;
          const testResult = testResults[config.platform];

          return (
            <div
              key={config.platform}
              className={`provider-config-card glass-sm ${config.enabled ? "enabled" : "disabled"}`}
              style={{ borderLeftColor: meta.color, borderLeftWidth: 3, borderLeftStyle: 'solid' }}
            >
              <div
                className="provider-config-header"
                onClick={() => setExpanded(isExpanded ? "" as any : config.platform)}
              >
                <div className="provider-config-title">
                  <span className="provider-icon-large">{meta.icon}</span>
                  <div>
                    <h5>
                      {config.label}
                      <span className="badge badge-stub" style={{ fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', verticalAlign: 'middle' }}>🔶 Stub</span>
                    </h5>
                    <span className="text-muted-sm">{meta.description}</span>
                  </div>
                </div>
                <div className="provider-config-actions">
                  {config.verified ? (
                    <CheckCircle2 size={16} color={meta.color} />
                  ) : (
                    <AlertTriangle size={16} color="var(--text-muted)" />
                  )}
                  <label className="toggle" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={e => update(config.platform, { enabled: e.target.checked })}
                    />
                    <span className="toggle-slider" />
                  </label>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </div>

              {isExpanded && (
                <div className="provider-config-body">
                  {meta.fields.map(field => {
                    const val = String((config as any)[field.key] || "");
                    return (
                      <div className="provider-field" key={field.key}>
                        <label>{field.label}</label>
                        <input
                          type={field.type === "password" ? "password" : "text"}
                          value={val}
                          onChange={e => update(config.platform, { [field.key]: e.target.value } as any)}
                          placeholder={field.placeholder}
                          className="text-input wide"
                        />
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleTest(config.platform)}
                      disabled={true}
                      title="Backend not yet implemented"
                    >
                      {testing === config.platform ? (
                        <RefreshCw size={14} className="spin" />
                      ) : (
                        <Zap size={14} />
                      )}
                      Test Connection
                    </button>

                    {testResult && (
                      <span className={testResult.ok ? "status-ok" : "status-err"} style={{ fontSize: 12 }}>
                        {testResult.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        {testResult.msg}
                      </span>
                    )}

                    {config.lastTested && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Tested: {new Date(config.lastTested).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
