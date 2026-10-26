import { joinRoom, type Room } from "trystero";
import { type SyncMessage } from "./SyncMessages";

type MessageHandler = (message: SyncMessage, peerId: string) => void;
type PeerHandler = (peerId: string) => void;

const DEFAULT_RELAY_URLS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.fountain.fm"];
const RELAY_CONFIG_PATH = "./network-relays.json";
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 32_000;
const CONNECTION_CHECK_INTERVAL_MS = 1_000;

export const MAX_ROOM_PEERS = 8;

export type NetworkConnectionState = "offline" | "connecting" | "connected" | "reconnecting" | "room-full";

export type NetworkStats = {
  readonly peerCount: number;
  readonly pingMs: number | null;
  readonly connectionState: NetworkConnectionState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRelayUrls(value: unknown): string[] {
  const relayUrls = Array.isArray(value) ? value : isRecord(value) ? value.relayUrls : undefined;
  if (!Array.isArray(relayUrls)) {
    return [];
  }

  return relayUrls.filter((relayUrl): relayUrl is string => typeof relayUrl === "string" && relayUrl.startsWith("wss://"));
}

/**
 * Thin wrapper over Trystero's P2P room. GitHub Pages ships only static files, so there is no
 * signaling server of our own: Trystero borrows a public relay (BitTorrent/Nostr/MQTT) purely to
 * exchange the WebRTC handshake, after which peers talk directly, browser to browser.
 *
 * Everyone who joins the same appId + room converges into one mesh. This wrapper keeps the mesh
 * bounded and retries failed room joins without requiring a signaling server of our own.
 */
export class NetworkManager {
  private static pendingLeave: Promise<void> | null = null;

  private room: Room | null = null;
  private sendSync: ((message: SyncMessage, targetPeerId?: string) => void) | null = null;
  private messageHandler: MessageHandler | null = null;
  private peerJoinHandler: PeerHandler | null = null;
  private peerLeaveHandler: PeerHandler | null = null;
  private readonly connectedPeers = new Set<string>();
  private readonly rejectedPeers = new Set<string>();
  private lastPingMs: number | null = null;
  private joinRequestId = 0;
  private appId: string | null = null;
  private roomId: string | null = null;
  private connectionState: NetworkConnectionState = "offline";
  private reconnectAt = 0;
  private reconnectAttempt = 0;
  private lastConnectionCheckAt = 0;

  join(appId: string, roomId: string): void {
    if (this.room || (this.appId === appId && this.roomId === roomId && this.connectionState !== "offline")) {
      return;
    }

    this.appId = appId;
    this.roomId = roomId;
    this.connectionState = "connecting";
    this.reconnectAt = 0;
    this.reconnectAttempt = 0;
    const requestId = ++this.joinRequestId;
    void this.joinWhenReady(appId, roomId, requestId);
  }

  update(): void {
    const now = Date.now();
    if (this.reconnectAt > 0) {
      if (now < this.reconnectAt) {
        return;
      }

      this.reconnectAt = 0;
      if (this.appId && this.roomId) {
        this.connectionState = "connecting";
        const requestId = ++this.joinRequestId;
        void this.joinWhenReady(this.appId, this.roomId, requestId);
      }
      return;
    }

    if (!this.room || now - this.lastConnectionCheckAt < CONNECTION_CHECK_INTERVAL_MS) {
      return;
    }

    this.lastConnectionCheckAt = now;
    let peerConnections: RTCPeerConnection[];
    try {
      peerConnections = Object.values(this.room.getPeers());
    } catch {
      this.scheduleReconnect();
      return;
    }

    const allConnectionsFailed =
      peerConnections.length > 0 && peerConnections.every(connection => this.isFailedConnection(connection));
    if (allConnectionsFailed) {
      this.scheduleReconnect();
    }
  }

  private async joinWhenReady(appId: string, roomId: string, requestId: number): Promise<void> {
    const pendingLeave = NetworkManager.pendingLeave;
    if (pendingLeave) {
      await pendingLeave;
    }

    if (requestId !== this.joinRequestId || this.room) {
      return;
    }

    let room: Room;
    try {
      const relayUrls = await this.loadRelayUrls();
      if (requestId !== this.joinRequestId || this.room) {
        return;
      }

      room = joinRoom({ appId, relayUrls, relayRedundancy: relayUrls.length }, roomId, () => {
        if (requestId === this.joinRequestId) {
          this.scheduleReconnect();
        }
      });
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.room = room;
    this.connectionState = "connected";
    this.reconnectAttempt = 0;
    this.lastConnectionCheckAt = 0;
    const [send, receive] = room.makeAction<SyncMessage>("sync");

    this.sendSync = (message: SyncMessage, targetPeerId?: string) => {
      void send(message, targetPeerId);
    };

    receive((message: SyncMessage, peerId: string) => {
      if (this.room === room && !this.rejectedPeers.has(peerId)) {
        this.messageHandler?.(message, peerId);
      }
    });
    room.onPeerJoin((peerId: string) => {
      if (this.room !== room) {
        return;
      }

      this.rejectedPeers.delete(peerId);
      this.connectedPeers.add(peerId);
      this.connectionState = "connected";
      this.peerJoinHandler?.(peerId);
    });
    room.onPeerLeave((peerId: string) => {
      if (this.room !== room) {
        return;
      }

      this.connectedPeers.delete(peerId);
      this.rejectedPeers.delete(peerId);
      this.peerLeaveHandler?.(peerId);
    });
  }

  private async loadRelayUrls(): Promise<string[]> {
    let configuredRelayUrls: string[] = [];
    try {
      const response = await fetch(RELAY_CONFIG_PATH, { cache: "no-store" });
      if (response.ok) {
        configuredRelayUrls = getRelayUrls(await response.json());
      }
    } catch {
      // Static hosting may be offline or the optional config may not be deployed.
    }

    return [...new Set([...configuredRelayUrls, ...DEFAULT_RELAY_URLS])];
  }

  private isFailedConnection(connection: RTCPeerConnection): boolean {
    return (
      connection.connectionState === "failed" ||
      connection.connectionState === "closed" ||
      connection.iceConnectionState === "failed" ||
      connection.iceConnectionState === "closed"
    );
  }

  private scheduleReconnect(): void {
    if (!this.appId || !this.roomId || this.connectionState === "offline" || this.connectionState === "room-full") {
      return;
    }

    if (this.reconnectAt > 0) {
      return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectAt = Date.now() + delay;
    this.connectionState = "reconnecting";
    this.joinRequestId += 1;
    this.closeCurrentRoom();
  }

  private closeCurrentRoom(): void {
    const peersToRemove = [...this.connectedPeers];

    if (this.room) {
      try {
        const leavePromise = this.room.leave();
        let trackedLeave: Promise<void>;
        trackedLeave = Promise.resolve(leavePromise)
          .catch(() => {
            // Room may already be torn down.
          })
          .finally(() => {
            if (NetworkManager.pendingLeave === trackedLeave) {
              NetworkManager.pendingLeave = null;
            }
          });
        NetworkManager.pendingLeave = trackedLeave;
      } catch {
        // Room may already be torn down.
      }
      this.room = null;
    }

    this.sendSync = null;
    this.connectedPeers.clear();
    this.rejectedPeers.clear();
    this.lastPingMs = null;
    this.lastConnectionCheckAt = 0;
    peersToRemove.forEach(peerId => this.peerLeaveHandler?.(peerId));
  }

  getPeerCount(): number {
    return this.connectedPeers.size;
  }

  getLastPingMs(): number | null {
    return this.lastPingMs;
  }

  getConnectionState(): NetworkConnectionState {
    return this.connectionState;
  }

  rejectPeer(peerId: string): void {
    if (!this.connectedPeers.has(peerId)) {
      return;
    }

    this.send({ type: "room-full" }, peerId);
    this.connectedPeers.delete(peerId);
    this.rejectedPeers.add(peerId);
  }

  markRoomFull(): void {
    if (this.connectionState === "room-full") {
      return;
    }

    this.reconnectAt = 0;
    this.joinRequestId++;
    this.closeCurrentRoom();
    this.connectionState = "room-full";
  }

  async samplePing(): Promise<number | null> {
    if (!this.room || this.connectedPeers.size === 0) {
      this.lastPingMs = null;
      return null;
    }

    const firstPeer = this.connectedPeers.values().next().value;
    if (!firstPeer) {
      this.lastPingMs = null;
      return null;
    }

    try {
      const pingDuration = await this.room.ping(firstPeer);
      this.lastPingMs = Math.round(pingDuration);
      return this.lastPingMs;
    } catch {
      return null;
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onPeerJoin(handler: PeerHandler): void {
    this.peerJoinHandler = handler;
  }

  onPeerLeave(handler: PeerHandler): void {
    this.peerLeaveHandler = handler;
  }

  /** Send to a single peer; omit the target to reach everyone in the room. */
  send(message: SyncMessage, targetPeerId?: string): void {
    this.sendSync?.(message, targetPeerId);
  }

  broadcast(message: SyncMessage): void {
    this.sendSync?.(message);
  }

  leave(): void {
    this.joinRequestId++;

    this.reconnectAt = 0;
    this.appId = null;
    this.roomId = null;
    this.connectionState = "offline";
    this.closeCurrentRoom();
    this.messageHandler = null;
    this.peerJoinHandler = null;
    this.peerLeaveHandler = null;
  }
}
