import { useState, useEffect } from "react";
import { Globe, Wifi, WifiOff, Shield, ChevronDown } from "lucide-react";
import { safeInvoke as invoke } from "../safe-invoke";

export type OnlineMode = "local" | "p2p-visible" | "p2p-anonymous";

interface OnlineToggleProps {
  /** Show as a compact badge (for sidebar) or full card (for dashboard) */
  variant?: "badge" | "card";
}

export default function OnlineToggle({ variant = "badge" }: OnlineToggleProps) {
  const [mode, setMode] = useState<OnlineMode>("local");
  const [open, setOpen] = useState(false);
  const [peerCount, setPeerCount] = useState(0);

  // Try to get actual peer count from backend
  useEffect(() => {
    if (mode !== "local") {
      invoke<string>("get_p2p_status")
        .then(raw => {
          try {
            const data = JSON.parse(raw);
            setPeerCount(data.connected_peers || 0);
          } catch {}
        })
        .catch(() => {});
    }
  }, [mode]);

  const modes: { value: OnlineMode; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
    {
      value: "local",
      label: "Local Only",
      icon: <WifiOff size={16} />,
      desc: "Services accessible only on this machine",
      color: "#6b7280",
    },
    {
      value: "p2p-visible",
      label: "P2P Visible",
      icon: <Globe size={16} />,
      desc: "Discoverable on the dweb P2P network",
      color: "#22c55e",
    },
    {
      value: "p2p-anonymous",
      label: "P2P Anonymous",
      icon: <Shield size={16} />,
      desc: "Connected to P2P but not listed",
      color: "#8b5cf6",
    },
  ];

  const current = modes.find(m => m.value === mode) || modes[0];

  if (variant === "badge") {
    return (
      <div className="online-toggle-badge">
        <button
          className={`online-mode-btn mode-${mode}`}
          onClick={() => setOpen(!open)}
          title={current.desc}
        >
          <span className="status-dot-sm" style={{ backgroundColor: current.color }} />
          <span className="mode-label">{current.label}</span>
          <ChevronDown size={12} className={`chevron ${open ? 'open' : ''}`} />
        </button>
        {open && (
          <div className="online-mode-dropdown glass">
            {modes.map(m => (
              <button
                key={m.value}
                className={`mode-option ${mode === m.value ? 'active' : ''}`}
                onClick={() => { setMode(m.value); setOpen(false); }}
              >
                <span style={{ color: m.color }}>{m.icon}</span>
                <div className="mode-option-info">
                  <span className="mode-option-label">{m.label}</span>
                  <span className="mode-option-desc">{m.desc}</span>
                </div>
                {mode === m.value && <span className="check-mark">✓</span>}
              </button>
            ))}
            {mode !== "local" && (
              <div className="online-mode-status">
                <Wifi size={12} />
                <span>Peers: {peerCount}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Card variant (for dashboard)
  return (
    <div className="online-toggle-card glass">
      <div className="card-header">
        <h4>Network Mode</h4>
        <span className={`mode-indicator mode-${mode}`}>
          <span className="status-dot-sm" style={{ backgroundColor: current.color }} />
          {current.label}
        </span>
      </div>
      <div className="card-body">
        {modes.map(m => (
          <label key={m.value} className={`mode-radio ${mode === m.value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="online-mode"
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
            />
            <span style={{ color: m.color }}>{m.icon}</span>
            <div>
              <span className="mode-radio-label">{m.label}</span>
              <span className="mode-radio-desc">{m.desc}</span>
            </div>
          </label>
        ))}
      </div>
      {mode !== "local" && (
        <div className="card-footer text-muted-sm">
          <Wifi size={12} /> Connected to P2P network · {peerCount} peers
        </div>
      )}
      {mode === "local" && (
        <div className="card-footer text-muted-sm">
          <WifiOff size={12} /> Offline mode — all services local only
        </div>
      )}
    </div>
  );
}
