import { useState, useEffect, useCallback } from "react";
import { Wifi, WifiOff, Signal, Users, ChevronDown, ChevronUp } from "lucide-react";
import type { P2PPeer } from "../types";
import { getRelayPeers, getRelayStatus, type RelayStatus } from "../relay-client";

type ConnectionQuality = "excellent" | "good" | "poor" | "disconnected";

function getConnectionQuality(peersOnline: number, relayConnected: boolean): ConnectionQuality {
  if (!relayConnected) return "disconnected";
  if (peersOnline >= 5) return "excellent";
  if (peersOnline >= 2) return "good";
  return "poor";
}

function qualityColor(quality: ConnectionQuality): string {
  switch (quality) {
    case "excellent": return "#22c55e";
    case "good": return "#eab308";
    case "poor": return "#f97316";
    case "disconnected": return "#ef4444";
  }
}

function qualityLabel(quality: ConnectionQuality): string {
  switch (quality) {
    case "excellent": return "Excellent";
    case "good": return "Good";
    case "poor": return "Poor";
    case "disconnected": return "Disconnected";
  }
}

export default function P2PStatusIndicator() {
  const [relayStatus, setRelayStatus] = useState<RelayStatus | null>(null);
  const [peers, setPeers] = useState<P2PPeer[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [status, peerList] = await Promise.all([
        getRelayStatus(),
        getRelayPeers(),
      ]);
      if (status) setRelayStatus(status);
      setPeers(peerList as unknown as P2PPeer[]);
    } catch {
      // Silently handle — status will show disconnected
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  const peersOnline = relayStatus?.peersOnline ?? 0;
  const relayConnected = relayStatus?.connected ?? false;
  const quality = getConnectionQuality(peersOnline, relayConnected);

  return (
    <div style={{ position: "relative" }}>
      {/* Navbar indicator button */}
      <button
        onClick={() => setExpanded(!expanded)}
        title="P2P Connection Status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid var(--border-color, #333)",
          background: "var(--bg-secondary, #1a1a2e)",
          color: "var(--text-primary, #eee)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        {relayConnected ? (
          <Wifi size={14} style={{ color: qualityColor(quality) }} />
        ) : (
          <WifiOff size={14} style={{ color: qualityColor(quality) }} />
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Users size={12} />
          {peersOnline}
        </span>
        <Signal size={12} style={{ color: qualityColor(quality) }} />
        <span style={{ fontSize: 11, color: qualityColor(quality) }}>
          {qualityLabel(quality)}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Expanded peer details */}
      {expanded && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 320,
            background: "var(--bg-primary, #0f0f1a)",
            border: "1px solid var(--border-color, #333)",
            borderRadius: 8,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-color, #333)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>P2P Network</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: `${qualityColor(quality)}22`,
                color: qualityColor(quality),
                fontWeight: 600,
              }}
            >
              {qualityLabel(quality)}
            </span>
          </div>

          {/* Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "var(--border-color, #333)",
              borderBottom: "1px solid var(--border-color, #333)",
            }}
          >
            <div style={{ padding: "8px 12px", background: "var(--bg-primary, #0f0f1a)", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-blue, #6c63ff)" }}>{peersOnline}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted, #888)" }}>Peers</div>
            </div>
            <div style={{ padding: "8px 12px", background: "var(--bg-primary, #0f0f1a)", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: relayConnected ? "#22c55e" : "#ef4444" }}>
                {relayConnected ? "Yes" : "No"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted, #888)" }}>Relay</div>
            </div>
            <div style={{ padding: "8px 12px", background: "var(--bg-primary, #0f0f1a)", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-secondary, #aaa)" }}>
                {relayStatus?.pendingSignals ?? 0}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted, #888)" }}>Pending</div>
            </div>
          </div>

          {/* Peer list */}
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {peers.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted, #666)", fontSize: 12 }}>
                {loading ? "Loading peers..." : "No peers connected"}
              </div>
            ) : (
              peers.map((peer, i) => (
                <div
                  key={peer.id || i}
                  style={{
                    padding: "8px 14px",
                    borderBottom: "1px solid var(--border-color, #222)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                  }}
                >
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--text-primary, #eee)" }}>
                      {peer.hostname || peer.id.slice(0, 16) + "..."}
                    </span>
                    <span style={{ marginLeft: 6, color: "var(--text-muted, #666)", fontSize: 10 }}>
                      {peer.mode === "p2p-visible" ? "Visible" : peer.mode === "p2p-anonymous" ? "Anon" : "Relay"}
                    </span>
                  </div>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: peer.connected ? "#22c55e" : "#ef4444",
                      flexShrink: 0,
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
