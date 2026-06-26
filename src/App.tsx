import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./views/Dashboard";
import BrowserView from "./views/BrowserView";
import AIAgent from "./views/AIAgent";
import Domains from "./views/Domains";
import Repositories from "./views/Repositories";
import Settings from "./views/Settings";
import Integrations from "./views/Integrations";
import Docs from "./views/Docs";
import type { View } from "./types";

function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [browserUrl, setBrowserUrl] = useState<string>("");
  const [browserNavId, setBrowserNavId] = useState(0);

  /** Switch to the browser view and navigate to the given URL */
  const handleOpenInBrowser = useCallback((url: string) => {
    setBrowserUrl(url);
    setBrowserNavId(id => id + 1);
    setCurrentView("browser");
  }, []);

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
    }
  };

  return (
    <div className="app-layout">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main className="main-content">
        {renderView()}
      </main>
    </div>
  );
}

export default App;
