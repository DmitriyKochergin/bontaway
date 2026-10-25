import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { WeaponSystem } from "../systems/WeaponSystem";
import { NetworkManager } from "./NetworkManager";
import { RemotePlayer } from "./RemotePlayer";
import { type SyncMessage, type WeaponKind } from "./SyncMessages";

const APP_ID = "bontaway";
const DEFAULT_ROOM_ID = "bontaway-arena";

// 20 Hz position feed; anything faster is wasted on the interpolation.
const POS_BROADCAST_INTERVAL_MS = 50;
const POS_EPSILON = 0.5;
const ROTATION_EPSILON = 0.01;

/**
 * Wires a shared level into the P2P mesh. Lives only while the level scene lives. Each peer owns
 * itself: this broadcasts the local player's position and shots, and renders everyone else as
 * interpolated replicas. No authority, no reconciliation — the level has no shared world state.
 */
export class ArenaNetSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly network = new NetworkManager();
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly weaponSystem: WeaponSystem;
  private readonly roomId: string;
  private readonly visibilityMask?: Phaser.Display.Masks.BitmapMask;

  private lastBroadcastAt = 0;
  private lastPingSampleAt = 0;
  private lastSentX = Number.NaN;
  private lastSentY = Number.NaN;
  private lastSentRotation = Number.NaN;
  private isDestroyed = false;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    weaponSystem: WeaponSystem,
    visibilityMask?: Phaser.Display.Masks.BitmapMask,
    roomId: string = DEFAULT_ROOM_ID
  ) {
    this.scene = scene;
    this.player = player;
    this.weaponSystem = weaponSystem;
    this.visibilityMask = visibilityMask;
    this.roomId = roomId;

    this.network.onMessage((message, peerId) => this.handleMessage(message, peerId));
    this.network.onPeerJoin(peerId => this.greetPeer(peerId));
    this.network.onPeerLeave(peerId => this.removePeer(peerId));
    this.network.join(APP_ID, this.roomId);
  }

  /** Called by GameScene right after a local cast so peers can retrace the shot. */
  broadcastFire(weapon: WeaponKind, originX: number, originY: number, targetX: number, targetY: number): void {
    if (this.isDestroyed) {
      return;
    }

    this.network.broadcast({ type: "fire", weapon, ox: originX, oy: originY, tx: targetX, ty: targetY });
  }

  /** Called by GameScene when the local player sends a chat line. */
  broadcastChat(text: string): void {
    if (this.isDestroyed) {
      return;
    }

    this.network.broadcast({ type: "chat", text });
  }

  update(time: number): void {
    if (this.isDestroyed) {
      return;
    }

    this.broadcastPosition(time);

    if (time - this.lastPingSampleAt > 2000) {
      this.lastPingSampleAt = time;
      void this.network.samplePing();
    }

    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.tick();
    }
  }

  getNetworkStats(): { peerCount: number; pingMs: number | null } {
    return {
      peerCount: this.network.getPeerCount(),
      pingMs: this.network.getLastPingMs()
    };
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.network.leave();

    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.destroy();
    }
    this.remotePlayers.clear();
  }

  private broadcastPosition(time: number): void {
    if (time - this.lastBroadcastAt < POS_BROADCAST_INTERVAL_MS) {
      return;
    }

    const { x, y, rotation } = this.player;
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    const moving = !!body && body.velocity.lengthSq() > 1;

    const unchanged =
      Math.abs(x - this.lastSentX) < POS_EPSILON &&
      Math.abs(y - this.lastSentY) < POS_EPSILON &&
      Math.abs(Phaser.Math.Angle.Wrap(rotation - this.lastSentRotation)) < ROTATION_EPSILON;

    if (unchanged) {
      return;
    }

    this.lastBroadcastAt = time;
    this.lastSentX = x;
    this.lastSentY = y;
    this.lastSentRotation = rotation;

    this.network.broadcast({ type: "pos", x, y, rotation, moving });
  }

  private greetPeer(peerId: string): void {
    // Snapshot self straight to the newcomer so we appear on their screen immediately.
    this.network.send({ type: "hello", x: this.player.x, y: this.player.y, rotation: this.player.rotation }, peerId);
  }

  private removePeer(peerId: string): void {
    const remotePlayer = this.remotePlayers.get(peerId);
    if (remotePlayer) {
      remotePlayer.destroy();
      this.remotePlayers.delete(peerId);
    }
  }

  private handleMessage(message: SyncMessage, peerId: string): void {
    switch (message.type) {
      case "hello":
      case "pos":
        this.resolveRemotePlayer(peerId, message.x, message.y, message.rotation).setTarget(
          message.x,
          message.y,
          message.rotation
        );
        break;
      case "fire":
        if (message.weapon === "fireball") {
          this.weaponSystem.castFireball(message.tx, message.ty, message.ox, message.oy);
        } else if (message.weapon === "ray") {
          this.weaponSystem.castRay(message.tx, message.ty, message.ox, message.oy);
        } else if (message.weapon === "sphere") {
          this.weaponSystem.castSphere(message.tx, message.ty, message.ox, message.oy);
        }
        this.remotePlayers.get(peerId)?.flash();
        break;
      case "chat":
        this.remotePlayers.get(peerId)?.say(message.text);
        break;
    }
  }

  private resolveRemotePlayer(peerId: string, x: number, y: number, rotation: number): RemotePlayer {
    let remotePlayer = this.remotePlayers.get(peerId);
    if (!remotePlayer) {
      remotePlayer = new RemotePlayer(this.scene, x, y, rotation, this.player, this.visibilityMask);
      this.remotePlayers.set(peerId, remotePlayer);
    }
    return remotePlayer;
  }
}
