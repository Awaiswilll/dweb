/**
 * Relay Client — Frontend module for WebSocket + HTTP relay communication.
 *
 * Provides:
 *  - DwebRelayClient: WebSocket client with exponential backoff reconnection
 *  - DwebPeerConnection: WebRTC wrapper with Google STUN pre-configured
 *  - FederatedRelayClient: connects to multiple relays for redundancy
 *  - HTTP fallback functions that work without WebSocket
 *
 * The dweb-server (port 49737) provides both HTTP and WebSocket endpoints.
 * WebSocket is used for push-based signaling; HTTP is the fallback.
 */

// ─── Constants ────────────────────────────────────────────────

const DWEB_SERVER_PORT = 49737;
const API_BASE = `http://localhost:${DWEB_SERVER_PORT}`;
const WS_URL = `ws://localhost:${DWEB_SERVER_PORT}/ws`;

// Google's public STUN servers (free, no registration)
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

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

// ─── WebSocket Relay Client ───────────────────────────────────

export enum WSConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
}

export interface WSMessageHandler {
  onSignal?: (signal: RelaySignal) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
}

/**
 * WebSocket-based relay client with exponential backoff reconnection.
 * Falls back gracefully when WebSocket is unavailable.
 */
export class DwebRelayClient {
  private ws: WebSocket | null = null;
  private peerId: string = '';
  private state: WSConnectionState = WSConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000; // 30s cap
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: WSMessageHandler = {};
  private signalQueue: RelaySignal[] = [];
  private signalResolvers: Array<(signals: RelaySignal[]) => void> = [];
  private intentionalClose = false;

  constructor(private url: string = WS_URL) {}

  /** Current connection state */
  get connectionState(): WSConnectionState { return this.state; }

  /** Register event handlers */
  setHandlers(handlers: WSMessageHandler): void {
    this.handlers = handlers;
  }

  /** Connect to the relay WebSocket */
  connect(peerId: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // already connected/connecting
    }
    this.peerId = peerId;
    this.intentionalClose = false;
    this.state = WSConnectionState.CONNECTING;
    this.connectInternal();
  }

  /** Disconnect intentionally (no reconnection) */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.state = WSConnectionState.DISCONNECTED;
  }

  /** Send a WebRTC signal to a peer */
  sendSignal(targetPeerId: string, type: string, sdp?: string, candidate?: string): boolean {
    if (this.state !== WSConnectionState.CONNECTED || !this.ws) return false;
    try {
      this.ws.send(JSON.stringify({
        type: 'signal',
        targetPeerId,
        fromPeerId: this.peerId,
        signalType: type,
        sdp: sdp || null,
        candidate: candidate || null,
      }));
      return true;
    } catch {
      return false;
    }
  }

  /** Register this peer with the relay via WebSocket */
  register(info: { hostname?: string; platform?: string; address?: string; port?: number; mode?: string }): void {
    if (this.state !== WSConnectionState.CONNECTED || !this.ws) return;
    try {
      this.ws.send(JSON.stringify({
        type: 'register',
        peerId: this.peerId,
        ...info,
      }));
    } catch { /* ignore */ }
  }

  /** Async generator: yields signals as they arrive */
  async *getSignals(): AsyncGenerator<RelaySignal> {
    while (true) {
      if (this.signalQueue.length > 0) {
        yield this.signalQueue.shift()!;
        continue;
      }
      // Wait for next signal
      const signals = await new Promise<RelaySignal[]>((resolve) => {
        this.signalResolvers.push(resolve);
      });
      for (const s of signals) {
        yield s;
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────

  private connectInternal(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.handleError(`WebSocket creation failed: ${err}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = WSConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      // Register with relay immediately
      this.register({});
      this.handlers.onConnected?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'signal') {
          const signal: RelaySignal = {
            fromPeerId: msg.fromPeerId || '',
            type: msg.signalType || msg.type || 'unknown',
            sdp: msg.sdp || null,
            candidate: msg.candidate || null,
            timestamp: msg.timestamp || new Date().toISOString(),
          };
          // Push to both the handler and the async generator queue
          this.handlers.onSignal?.(signal);
          this.signalQueue.push(signal);
          // Resolve any pending async generators
          while (this.signalResolvers.length > 0) {
            const resolve = this.signalResolvers.shift()!;
            resolve(this.signalQueue.splice(0, this.signalQueue.length));
          }
        } else if (msg.type === 'peers') {
          // Peer list update — could be used for discovery
        } else if (msg.type === 'error') {
          this.handlers.onError?.(msg.message || 'Unknown relay error');
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.state = WSConnectionState.DISCONNECTED;
      this.ws = null;
      this.handlers.onDisconnected?.();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose fires after onerror, so reconnection is handled there
    };
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.state = WSConnectionState.CONNECTING;
      this.connectInternal();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleError(msg: string): void {
    this.handlers.onError?.(msg);
  }
}

// ─── WebRTC Peer Connection Wrapper ───────────────────────────

export type IceCandidateHandler = (candidate: RTCIceCandidateInit) => void;

/**
 * Wraps RTCPeerConnection with Google STUN servers and
 * provides a Promise-based API for offers/answers.
 */
export class DwebPeerConnection {
  private pc: RTCPeerConnection;
  private _onIceCandidate: IceCandidateHandler | null = null;
  private _remoteDescriptionSet = false;

  constructor(config?: RTCConfiguration) {
    this.pc = new RTCPeerConnection({
      iceServers: STUN_SERVERS,
      iceCandidatePoolSize: 10,
      ...config,
    });

    // Trickle ICE: forward candidates as they're gathered
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this._onIceCandidate) {
        this._onIceCandidate(event.candidate.toJSON());
      }
    };
  }

  /** Register a handler for trickled ICE candidates */
  set onIceCandidate(handler: IceCandidateHandler | null) {
    this._onIceCandidate = handler;
  }

  /** Whether the peer connection is established */
  get connected(): boolean {
    return this.pc.connectionState === 'connected';
  }

  /** Current connection state */
  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  /** Watch connection state changes */
  onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;

  private setupStateHandler(): void {
    this.pc.onconnectionstatechange = () => {
      this.onConnectionStateChange?.(this.pc.connectionState);
    };
  }

  /** Create a WebRTC offer */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** Create a WebRTC answer for a received offer */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this._remoteDescriptionSet) {
      throw new Error('Remote description must be set before creating answer');
    }
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /** Set the remote peer's SDP description (offer or answer) */
  async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this._remoteDescriptionSet = true;
  }

  /** Add an ICE candidate received from the remote peer */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Close the connection and release resources */
  close(): void {
    this.pc.close();
  }

  /** Access the underlying RTCPeerConnection for advanced usage */
  get native(): RTCPeerConnection {
    return this.pc;
  }
}

// ─── Federated Relay Client ───────────────────────────────────

/**
 * Connects to multiple relay instances simultaneously for redundancy.
 * Signals are sent to all relays; incoming signals from any relay are processed.
 */
export class FederatedRelayClient {
  private clients: DwebRelayClient[] = [];
  private peerId: string = '';

  constructor(private relayUrls: string[]) {}

  /** Connect to all configured relays */
  connect(peerId: string): void {
    this.peerId = peerId;
    for (const url of this.relayUrls) {
      const client = new DwebRelayClient(url);
      client.connect(peerId);
      this.clients.push(client);
    }
  }

  /** Disconnect from all relays */
  disconnect(): void {
    for (const client of this.clients) {
      client.disconnect();
    }
    this.clients = [];
  }

  /** Send signal to a peer via all connected relays */
  sendSignal(targetPeerId: string, type: string, sdp?: string, candidate?: string): void {
    for (const client of this.clients) {
      client.sendSignal(targetPeerId, type, sdp, candidate);
    }
  }

  /** Number of connected relay sessions */
  get connectedCount(): number {
    return this.clients.filter(c => c.connectionState === WSConnectionState.CONNECTED).length;
  }

  /** Total number of relay clients */
  get totalCount(): number {
    return this.clients.length;
  }

  /** Get all underlying clients */
  get allClients(): DwebRelayClient[] {
    return [...this.clients];
  }
}

// ─── HTTP API Functions (fallback) ────────────────────────────

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

/** Send a signal (WebRTC offer/answer/ICE) to a peer via relay HTTP */
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

/** Poll for incoming signals from other peers (HTTP fallback) */
export async function pollSignals(): Promise<RelaySignal[]> {
  const data = await apiGet<{ status: string; count: number; signals: RelaySignal[] }>('/relay/signals');
  return data?.signals || [];
}

/** Check if the dweb-server (and thus relay) is reachable */
export async function pingServer(): Promise<boolean> {
  const data = await apiGet<{ status: string }>('/ping');
  return data?.status === 'ok';
}
