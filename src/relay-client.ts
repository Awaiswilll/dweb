/**
 * Relay Client — Frontend module for communicating with the dweb-server's relay API.
 *
 * In Tauri mode: calls the backend via safe-invoke (which proxies to the relay).
 * In browser mode: makes direct HTTP calls to the local dweb-server (port 49737).
 *
 * The dweb-server auto-registers with the relay daemon and exposes relay info
 * via /relay/status, /relay/peers, /relay/signal, /relay/signals.
 */

// Vite injects import.meta.env but tsc may not recognize it, so use a plain constant
const DWEB_SERVER_PORT = 49737;
const API_BASE = `http://localhost:${DWEB_SERVER_PORT}`;

// ─── Types ─────────────────────────────────────────────────────

export interface RelayPeer {
  id: string;
  publicKey?: string;
  address: string;
  port: number;
  hostname: string;
  platform: string;
  version: string;
  mode: 'p2p-visible' | 'p2p-anonymous' | 'relay';
  services: string[];
  natType?: string;
  firstSeen: string;
  lastSeen: string;
  age: number;
}

export interface RelayStatus {
  connected: boolean;
  relayAddress: string;
  error: string | null;
  peerId: string;
  peersOnline: number;
  pendingSignals: number;
  localIPs: string[];
}

export interface RelaySignal {
  fromPeerId: string;
  type: string;
  sdp: string | null;
  candidate: string | null;
  timestamp: string;
}

export interface DwebStatus {
  status: string;
  peerId: string;
  hostname: string;
  platform: string;
  localIPs: string[];
  port: number;
  uptime: number;
  relayConnected: boolean;
  relayAddress: string;
  relayError: string | null;
  peersOnline: number;
  services: string[];
}

// ─── HTTP helpers ──────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── API functions ─────────────────────────────────────────────

/** Get relay connection status from the local dweb-server */
export async function getRelayStatus(): Promise<RelayStatus | null> {
  return apiGet<RelayStatus>('/relay/status');
}

/** Get full dweb-server status (includes relay info) */
export async function getDwebStatus(): Promise<DwebStatus | null> {
  return apiGet<DwebStatus>('/dweb-status');
}

/** List peers visible through the relay */
export async function getRelayPeers(): Promise<RelayPeer[]> {
  const data = await apiGet<{ status: string; count: number; peers: RelayPeer[] }>('/relay/peers');
  return data?.peers || [];
}

/** Send a signal (WebRTC offer/answer/ICE) to a peer via relay */
export async function sendRelaySignal(
  targetPeerId: string,
  type: string,
  sdp?: string,
  candidate?: string,
): Promise<boolean> {
  const result = await apiPost<{ status: string }>('/relay/signal', {
    targetPeerId,
    type,
    sdp: sdp || null,
    candidate: candidate || null,
  });
  return result?.status === 'ok';
}

/** Poll for incoming signals from other peers */
export async function pollSignals(): Promise<RelaySignal[]> {
  const data = await apiGet<{ status: string; count: number; signals: RelaySignal[] }>('/relay/signals');
  return data?.signals || [];
}

/** Check if the dweb-server (and thus relay) is reachable */
export async function pingServer(): Promise<boolean> {
  const data = await apiGet<{ status: string }>('/ping');
  return data?.status === 'ok';
}
