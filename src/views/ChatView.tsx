import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Link2, X, Users } from "lucide-react";
import { useChat } from "../components/ChatProvider";
import type { ChatMessage } from "../types";

interface RelayPeer {
  id: string;
  hostname?: string;
  platform?: string;
  mode?: string;
}

interface DomainRecord {
  name: string;
  port: number | null;
  active: boolean;
}

interface ChatViewProps {
  onOpenInBrowser: (url: string) => void;
}

function initialsFor(id: string) {
  const cleaned = id.replace(/^dweb-/, "");
  return cleaned.slice(0, 2).toUpperCase();
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ChatView({ onOpenInBrowser }: ChatViewProps) {
  const { dmThreads, roomMessages, unreadByPeer, unreadRoom, activeThread, openThread, sendDM, sendRoom } = useChat();

  const [peers, setPeers] = useState<RelayPeer[]>([]);
  const [myDomains, setMyDomains] = useState<DomainRecord[]>([]);
  const [messageText, setMessageText] = useState("");
  const [attachedLink, setAttachedLink] = useState<string | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Peer list — refreshed periodically; independent of the chat inbox
  // poller (this only reads /relay/peers, which is not a drain-on-read
  // endpoint, so it's safe to poll separately).
  useEffect(() => {
    let cancelled = false;
    const fetchPeers = () => {
      fetch("/relay/peers")
        .then(r => r.json())
        .then(data => { if (!cancelled && data.status === "ok") setPeers(data.peers || []); })
        .catch(() => {});
    };
    fetchPeers();
    const interval = setInterval(fetchPeers, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // My registered domains, for the "share my link" picker.
  useEffect(() => {
    fetch("/api/domain/list")
      .then(r => r.json())
      .then((list: DomainRecord[]) => {
        if (Array.isArray(list)) setMyDomains(list.filter(d => d.active && d.port));
      })
      .catch(() => {});
  }, []);

  // Default to the lobby on first load.
  useEffect(() => {
    if (activeThread === null) openThread("room");
  }, [activeThread, openThread]);

  const activeMessages: ChatMessage[] = useMemo(() => {
    if (activeThread === "room") return roomMessages;
    if (activeThread) return dmThreads[activeThread] || [];
    return [];
  }, [activeThread, roomMessages, dmThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length]);

  const handleSend = async () => {
    const body = messageText.trim();
    if (!body || sending) return;
    setSending(true);
    const link = attachedLink;
    setMessageText("");
    setAttachedLink(null);
    try {
      if (activeThread === "room") {
        await sendRoom(body, link);
      } else if (activeThread) {
        await sendDM(activeThread, body, link);
      }
    } finally {
      setSending(false);
    }
  };

  const activeLabel = activeThread === "room" ? "Lobby" : activeThread || "";

  return (
    <div className="view-container chat">
      <div className="view-header" />
      <div className="chat-layout glossy-card" style={{ padding: 0, flex: 1, minHeight: 0 }}>
        <div className="chat-sidebar">
          <div
            className={`chat-contact ${activeThread === "room" ? "active" : ""}`}
            onClick={() => openThread("room")}
          >
            <div className="chat-contact-avatar room"><Users size={16} /></div>
            <div className="chat-contact-info">
              <div className="chat-contact-name">Lobby</div>
              <div className="chat-contact-preview">
                {roomMessages.length > 0 ? roomMessages[roomMessages.length - 1].body : "Public channel — everyone online"}
              </div>
            </div>
            {unreadRoom > 0 && <div className="chat-contact-unread">{unreadRoom}</div>}
          </div>

          {peers.map(peer => {
            const thread = dmThreads[peer.id] || [];
            const last = thread[thread.length - 1];
            const unread = unreadByPeer[peer.id] || 0;
            return (
              <div
                key={peer.id}
                className={`chat-contact ${activeThread === peer.id ? "active" : ""}`}
                onClick={() => openThread(peer.id)}
              >
                <div className="chat-contact-avatar">{initialsFor(peer.id)}</div>
                <div className="chat-contact-info">
                  <div className="chat-contact-name">{peer.hostname || peer.id}</div>
                  <div className="chat-contact-preview">{last ? last.body : "No messages yet"}</div>
                </div>
                {unread > 0 && <div className="chat-contact-unread">{unread}</div>}
              </div>
            );
          })}

          {peers.length === 0 && (
            <div className="chat-link-picker-empty" style={{ marginTop: 12 }}>
              No peers online yet. Once someone connects, they'll show up here.
            </div>
          )}
        </div>

        <div className="chat-main">
          <div className="chat-main-header">
            <MessageCircle size={16} />
            {activeLabel}
          </div>

          <div className="chat-messages">
            {activeMessages.length === 0 && (
              <div className="chat-empty-state">
                {activeThread === "room" ? "No messages yet — say hello." : "Start the conversation."}
              </div>
            )}
            {activeMessages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.self ? "self" : ""}`}>
                {!msg.self && activeThread === "room" && (
                  <div className="chat-message-sender">{msg.fromPeerId}</div>
                )}
                <div className="chat-message-body">{msg.body}</div>
                {msg.dwebLink && (
                  <div className="chat-message-link" onClick={() => onOpenInBrowser(msg.dwebLink!)}>
                    <Link2 size={12} /> {msg.dwebLink}
                  </div>
                )}
                <div className="chat-message-meta">
                  {formatTime(msg.timestamp)}
                  {msg.via && <span>&middot; {msg.via === "direct" ? "direct P2P" : "via relay"}</span>}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            {attachedLink && (
              <div className="chat-link-preview">
                <Link2 size={12} /> {attachedLink}
                <button onClick={() => setAttachedLink(null)}><X size={12} /></button>
              </div>
            )}

            {showLinkPicker && (
              <div className="chat-link-picker-menu">
                {myDomains.length === 0 ? (
                  <div className="chat-link-picker-empty">
                    No active domains. Register one in the Domains tab first.
                  </div>
                ) : (
                  myDomains.map(d => (
                    <div
                      key={d.name}
                      className="chat-link-picker-item"
                      onClick={() => { setAttachedLink(`dweb://${d.name}`); setShowLinkPicker(false); }}
                    >
                      dweb://{d.name}
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="chat-input-row">
              <button
                className="chat-link-picker-btn"
                title="Share one of my .dweb links"
                onClick={() => setShowLinkPicker(v => !v)}
              >
                <Link2 size={16} />
              </button>
              <input
                type="text"
                placeholder={activeThread === "room" ? "Message the lobby…" : `Message ${activeLabel}…`}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              />
              <button className="chat-send-btn" onClick={handleSend} disabled={sending || !messageText.trim()}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
