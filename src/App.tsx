import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import { NotificationProvider, useNotifications } from "./components/Notifications";
import Dashboard from "./views/Dashboard";
import BrowserView from "./views/BrowserView";
import AIAgent from "./views/AIAgent";
import Domains from "./views/Domains";
import Repositories from "./views/Repositories";
import Settings from "./views/Settings";
import Integrations from "./views/Integrations";
import Docs from "./views/Docs";
import P2PDashboard from "./views/P2PDashboard";
import type { View } from "./types";

import P2PTransfer from "./views/P2PTransfer";
import {
  Plus, Radio, RefreshCw, Wifi,
} from "lucide-react";

function AppContent() {
  const { addNotification } = useNotifications();
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [browserUrl, setBrowserUrl] = useState<string>("");
  const [browserNavId, setBrowserNavId] = useState(0);
  const [serverStatus, setServerStatus] = useState<string>("checking");

  /** Switch to the browser view and navigate to the given URL */
  const handleOpenInBrowser = useCallback((url: string) => {
    setBrowserUrl(url);
    setBrowserNavId(id => id + 1);
    setCurrentView("browser");
  }, []);

  /** Navigation handler for sidebar - clears pending external URL when switching to Browser */
  const handleNavigate = useCallback((view: View) => {
    if (view === "browser") {
      setBrowserUrl("");
      setBrowserNavId(0);
    }
    setCurrentView(view);
  }, []);

  /** Quick Actions */
  const quickActions = [
    {
      label: "New Project",
      icon: <Plus size={14} />,
      onClick: () => addNotification({ type: "info", title: "Coming Soon", message: "Project scaffolding will be available in v0.2.0" }),
    },
    {
      label: "P2P Connect",
      icon: <Wifi size={14} />,
      onClick: () => { setCurrentView("p2p-dashboard"); },
    },
    {
      label: "Network Status",
      icon: <Radio size={14} />,
      onClick: () => addNotification({ type: "info", title: "Network", message: "Relay running on port 49746", duration: 3000 }),
    },
    {
      label: "Refresh",
      icon: <RefreshCw size={14} />,
      onClick: () => window.location.reload(),
    },
  ];

  /** Check server health on mount */
  useState(() => {
    fetch("/ping", { signal: AbortSignal.timeout(3000) })
      .then(r => r.json().then(d => { setServerStatus(d.status === "ok" ? "online" : "error"); }))
      .catch(() => setServerStatus("offline"));
  });

  const renderView = () => {
    switch (currentView) {
      case "dashboard": return <Dashboard onOpenInBrowser={handleOpenInBrowser} />;
      case "browser": return <BrowserView initialUrl={browserUrl} navId={browserNavId} />;
      case "ai-agent": return <AIAgent />;
      case "domains": return <Domains onOpenInBrowser={handleOpenInBrowser} />;
      case "integrations": return <Integrations />;
      case "repositories": return <Repositories />;
      case "docs": return <Docs />;
      case "settings": return <Settings />;
      case "p2p-dashboard": return <P2PDashboard />;
      case "p2p-transfer": return <P2PTransfer />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />
      <div className="main-area">
        {/* Quick Actions Toolbar */}
        <div className="quick-actions-toolbar">
          {quickActions.map((action, i) => (
            <button key={i} className="quick-action-btn" onClick={action.onClick}>
              {action.icon} {action.label}
            </button>
          ))}
          <div className="quick-action-separator" />
          <div className="quick-action-status">
            <span className={`status-dot ${serverStatus}`} />
            {serverStatus === "online" ? "Server Online" : serverStatus === "offline" ? "Offline" : "Checking..."}
          </div>
        </div>
        <main className="main-content">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}
