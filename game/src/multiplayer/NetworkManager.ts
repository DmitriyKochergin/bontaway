import { joinRoom, type Room } from "trystero";
import { type SyncMessage } from "./SyncMessages";

type MessageHandler = (message: SyncMessage, peerId: string) => void;
type PeerHandler = (peerId: string) => void;

/**
 * Thin wrapper over Trystero's P2P room. GitHub Pages ships only static files, so there is no
 * signaling server of our own: Trystero borrows a public relay (BitTorrent/Nostr/MQTT) purely to
 * exchange the WebRTC handshake, after which peers talk directly, browser to browser.
 *
 * Everyone who joins the same appId + room converges into one mesh. Deliberately minimal — no
 * host/guest roles, no reconnect, no room codes; the arena is a single shared room.
 */
export class NetworkManager {
  private room: Room | null = null;
  private sendSync: ((message: SyncMessage, targetPeerId?: string) => void) | null = null;
  private messageHandler: MessageHandler | null = null;
  private peerJoinHandler: PeerHandler | null = null;
  private peerLeaveHandler: PeerHandler | null = null;

  join(appId: string, roomId: string): void {
    if (this.room) {
      return;
    }

    this.room = joinRoom({ appId }, roomId);
    const [send, receive] = this.room.makeAction<SyncMessage>("sync");

    this.sendSync = (message: SyncMessage, targetPeerId?: string) => {
      void send(message, targetPeerId);
    };

    receive((message: SyncMessage, peerId: string) => this.messageHandler?.(message, peerId));
    this.room.onPeerJoin((peerId: string) => this.peerJoinHandler?.(peerId));
    this.room.onPeerLeave((peerId: string) => this.peerLeaveHandler?.(peerId));
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
    if (this.room) {
      try {
        this.room.leave();
      } catch {
        // Room may already be torn down.
      }
      this.room = null;
    }

    this.sendSync = null;
    this.messageHandler = null;
    this.peerJoinHandler = null;
    this.peerLeaveHandler = null;
  }
}
