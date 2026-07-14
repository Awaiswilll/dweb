import { Globe, Gauge, Bot, Settings, Menu, Network, Zap, BookOpen, MessageCircle } from "lucide-react";
import { useState } from "react";
import type { View } from "../types";
import { useChat } from "./ChatProvider";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const navItems: { id: View; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: <Gauge size={20} /> },
  { id: "browser", label: "Browser", icon: <Globe size={20} /> },
  { id: "chat", label: "Chat", icon: <MessageCircle size={20} /> },
  { id: "ai-agent", label: "AI Agent", icon: <Bot size={20} /> },
  { id: "domains", label: "Domains", icon: <Network size={20} /> },
  { id: "docs", label: "Docs", icon: <BookOpen size={20} /> },
  { id: "settings", label: "Settings", icon: <Settings size={20} /> },
];

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { totalUnread } = useChat();

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Zap size={22} className="logo-icon" />
          {!collapsed && <h1 className="sidebar-title">dweb</h1>}
        </div>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
          <Menu size={16} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentView === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
          >
            {item.icon}
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {!collapsed && item.id === "chat" && totalUnread > 0 && (
              <span className="nav-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
            )}
            {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-version">v0.1.0</div>
        <div className="sidebar-node-id" title="Your Peer ID">dweb://abc1...xyz9</div>
      </div>
    </aside>
  );
}
