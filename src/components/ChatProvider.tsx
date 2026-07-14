import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "../types";

interface ChatContextValue {
  dmThreads: Record<string, ChatMessage[]>;
  roomMessages: ChatMessage[];
  unreadByPeer: Record<string, number>;
  unreadRoom: number;
  totalUnread: number;
  activeThread: string | "room" | null;
  openThread: (thread: string | "room") => void;
  sendDM: (targetPeerId: string, body: string, dwebLink?: string | null) => Promise<{ ok: boolean; via?: string; error?: string }>;
  sendRoom: (body: string, dwebLink?: string | null) => Promise<{ ok: boolean; error?: string }>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const POLL_INTERVAL_MS = 2000;

export function ChatProvider({ children }: { children: ReactNode }) {
  const [dmThreads, setDmThreads] = useState<Record<string, ChatMessage[]>>({});
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [unreadRoom, setUnreadRoom] = useState(0);
  const [activeThread, setActiveThread] = useState<string | "room" | null>(null);
  const activeThreadRef = useRef(activeThread);
  activeThreadRef.current = activeThread;

  // Load lobby history once on mount so it isn't empty until someone posts.
  useEffect(() => {
    fetch("/api/chat/room/history")
      .then(r => r.json())
      .then(data => {
        if (data.status === "ok" && Array.isArray(data.messages)) {
          setRoomMessages(data.messages);
        }
      })
      .catch(() => {});
  }, []);

  // Single shared poller for incoming messages (drains the backend inbox —
  // must not be duplicated elsewhere, or messages get split between pollers).
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/chat/inbox");
        const data = await res.json();
        if (cancelled || !data.messages || data.messages.length === 0) return;

        const incomingDMs: ChatMessage[] = data.messages.filter((m: ChatMessage) => m.channel === "dm");
        const incomingRoom: ChatMessage[] = data.messages.filter((m: ChatMessage) => m.channel === "room");

        if (incomingDMs.length > 0) {
          setDmThreads(prev => {
            const next = { ...prev };
            for (const msg of incomingDMs) {
              const key = msg.fromPeerId;
              next[key] = [...(next[key] || []), msg];
            }
            return next;
          });
          setUnreadByPeer(prev => {
            const next = { ...prev };
            for (const msg of incomingDMs) {
              if (activeThreadRef.current !== msg.fromPeerId) {
                next[msg.fromPeerId] = (next[msg.fromPeerId] || 0) + 1;
              }
            }
            return next;
          });
        }

        if (incomingRoom.length > 0) {
          setRoomMessages(prev => [...prev, ...incomingRoom]);
          if (activeThreadRef.current !== "room") {
            setUnreadRoom(prev => prev + incomingRoom.length);
          }
        }
      } catch {
        // relay/server temporarily unreachable — just try again next tick
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const openThread = useCallback((thread: string | "room") => {
    setActiveThread(thread);
    if (thread === "room") setUnreadRoom(0);
    else setUnreadByPeer(prev => ({ ...prev, [thread]: 0 }));
  }, []);

  const sendDM = useCallback(async (targetPeerId: string, body: string, dwebLink?: string | null) => {
    const timestamp = new Date().toISOString();
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dm", targetPeerId, body, dwebLink: dwebLink || null }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setDmThreads(prev => ({
          ...prev,
          [targetPeerId]: [...(prev[targetPeerId] || []), {
            channel: "dm", fromPeerId: targetPeerId, body, dwebLink: dwebLink || null, timestamp, via: data.via, self: true,
          }],
        }));
        return { ok: true, via: data.via };
      }
      return { ok: false, error: data.message || "Send failed" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
    }
  }, []);

  const sendRoom = useCallback(async (body: string, dwebLink?: string | null) => {
    const timestamp = new Date().toISOString();
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "room", body, dwebLink: dwebLink || null }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setRoomMessages(prev => [...prev, {
          channel: "room", fromPeerId: "you", body, dwebLink: dwebLink || null, timestamp, self: true,
        }]);
        return { ok: true };
      }
      return { ok: false, error: data.message || "Send failed" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
    }
  }, []);

  const totalUnread = Object.values(unreadByPeer).reduce((a, b) => a + b, 0) + unreadRoom;

  return (
    <ChatContext.Provider value={{
      dmThreads, roomMessages, unreadByPeer, unreadRoom, totalUnread,
      activeThread, openThread, sendDM, sendRoom,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
