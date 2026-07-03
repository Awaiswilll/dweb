import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import type { Notification } from "../types";

/* ─── Context ──────────────────────────────────────────────── */
interface NotificationContextType {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "timestamp">) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  addNotification: () => "",
  removeNotification: () => {},
  clearAll: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

/* ─── Provider ──────────────────────────────────────────────── */
const ICONS = {
  info: <Info size={16} className="toast-icon" color="#3b82f6" />,
  success: <CheckCircle2 size={16} className="toast-icon" color="#22c55e" />,
  warning: <AlertTriangle size={16} className="toast-icon" color="#f59e0b" />,
  error: <AlertCircle size={16} className="toast-icon" color="#ef4444" />,
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, duration: -1 } : n))
    );
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  }, []);

  const addNotification = useCallback((n: Omit<Notification, "id" | "timestamp">) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const notification: Notification = { ...n, id, timestamp: Date.now() };
    setNotifications(prev => [...prev, notification]);

    const duration = n.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => removeNotification(id), duration);
    }
    return id;
  }, [removeNotification]);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
      {children}
      <div className="toast-container">
        {notifications.map(n => (
          <div key={n.id} className={`toast toast-${n.type} ${n.duration === -1 ? "toast-exit" : ""}`}>
            {ICONS[n.type]}
            <div className="toast-content">
              <div className="toast-title">{n.title}</div>
              <div className="toast-message">{n.message}</div>
              {n.action && (
                <div className="toast-action">
                  <button onClick={n.action.onClick}>{n.action.label}</button>
                </div>
              )}
            </div>
            <button className="toast-close" onClick={() => removeNotification(n.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
