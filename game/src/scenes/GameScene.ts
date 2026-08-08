import Phaser from "phaser";
import { NPC } from "../entities/NPC";
import { Player } from "../entities/Player";
import { getLevelDefinition } from "../levels";
import { ArenaNetSystem } from "../multiplayer/ArenaNetSystem";
import { ChatBubble } from "../multiplayer/ChatBubble";
import { DevModeOverlay } from "../systems/DevModeOverlay";
import { DungeonSystem } from "../systems/DungeonSystem";
import { FieldOfViewSystem } from "../systems/FieldOfViewSystem";
import { PlayerControlsSystem } from "../systems/PlayerControlsSystem";
import { loadPlayerProgress, savePlayerProgress, type PlayerProgressState } from "../systems/PlayerProgressManager";
import { PlayerTeleport } from "../systems/PlayerTeleport";
import { WeaponSystem } from "../systems/WeaponSystem";
import { type PhaserRaycasterPlugin } from "../types/phaser-raycaster";
import { BaseScene } from "./BaseScene";

/**
 * Core gameplay scene.
 * MainScene owns pause and settings coordination; this scene focuses on dungeon exploration and combat.
 */
export default class GameScene extends BaseScene {
  raycasterPlugin!: PhaserRaycasterPlugin;
  private player!: Player;
  private dungeonSystem!: DungeonSystem;
  private fovSystem!: FieldOfViewSystem;
  private playerControlSystem!: PlayerControlsSystem;
  private weaponSystem!: WeaponSystem;
  private playerTeleport!: PlayerTeleport;
  private arenaNet?: ArenaNetSystem;
  private localChatBubble?: ChatBubble;
  private isChatTyping = false;
  private devModeEnabled = false;
  private devModeOverlay?: DevModeOverlay;
  private levelId = "arena";
  private savedPlayerProgress?: PlayerProgressState;
  private lastSavedPlayerProgress?: PlayerProgressState;
  private npcs: NPC[] = [];
  private npcGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super("GameScene");
  }

  init(data?: { levelId?: string }): void {
    const savedPlayerProgress = loadPlayerProgress();

    if (data?.levelId) {
      this.levelId = data.levelId;
      this.savedPlayerProgress = savedPlayerProgress?.levelId === data.levelId ? savedPlayerProgress : undefined;
      return;
    }

    if (savedPlayerProgress && getLevelDefinition(savedPlayerProgress.levelId)) {
      this.levelId = savedPlayerProgress.levelId;
      this.savedPlayerProgress = savedPlayerProgress;
      return;
    }

    this.savedPlayerProgress = undefined;
  }

  public getLevelId(): string {
    return this.levelId;
  }

  /** Restart gameplay on a different level. Invoked by the HUD, which now lives on MainScene. */
  public restartLevel(levelId: string): void {
    this.scene.restart({ levelId });
  }

  create(): void {
    this.setupShutdownCleanup();
    this.events.on("toggle-dev-mode", this.toggleDevMode, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.saveCurrentPlayerProgress(true);
      this.events.off("toggle-dev-mode", this.toggleDevMode, this);
      this.npcs.forEach(npc => npc.destroy());
      this.npcs = [];
      this.arenaNet?.destroy();
      this.arenaNet = undefined;
      this.localChatBubble?.destroy();
      this.localChatBubble = undefined;
      this.isChatTyping = false;
      this.devModeOverlay?.destroy();
      this.devModeOverlay = undefined;
      this.devModeEnabled = false;
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      this.player?.setVelocity(0, 0);

      // Keep the camera from shifting on the first frame after resume by temporarily setting smoothing (Lerp) to 0.
      this.cameras.main.setLerp(0, 0);
    });
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.time.delayedCall(1, () => {
        this.cameras.main.setLerp(0.1, 0.1);
      });
      this.syncKeyboardStateOnResume();
    });
    this.createScene();
  }

  private syncKeyboardStateOnResume() {
    if (this.player && this.playerControlSystem) {
      this.playerControlSystem.syncPlayerKeys();
      this.player.update(0, 16);
    }
  }

  createScene() {
    this.initAudio("exploration");

    this.cameras.main.setBackgroundColor("#000000");

    // Enable Phaser lighting system
    this.lights.enable();
    this.lights.setAmbientColor(0x111122); // Dark blue night/dungeon environment

    this.dungeonSystem = new DungeonSystem(this, this.levelId);

    this.physics.world.setBounds(0, 0, this.dungeonSystem.getMapWidth(), this.dungeonSystem.getMapHeight());
    const levelDef = getLevelDefinition(this.levelId);

    // Player
    const startingPlayerProgress = this.getStartingPlayerProgress();
    this.player = new Player(this, startingPlayerProgress.x, startingPlayerProgress.y);
    this.player.rotation = startingPlayerProgress.rotation;
    this.lastSavedPlayerProgress = undefined;
    this.saveCurrentPlayerProgress(true);

    this.fovSystem = new FieldOfViewSystem(
      this,
      this.player,
      this.raycasterPlugin,
      this.dungeonSystem.getMapWidth(),
      this.dungeonSystem.getMapHeight(),
      this.dungeonSystem.getOccluders()
    );

    this.fovSystem.setEnabled(levelDef?.fogOfWarEnabled !== false);

    this.weaponSystem = new WeaponSystem(this, this.player, this.dungeonSystem, this.fovSystem, this.audioSystem);
    this.playerTeleport = new PlayerTeleport(this, this.player, () => this.devModeEnabled);
    this.playerControlSystem = new PlayerControlsSystem(
      this,
      this.player,
      (x, y) => this.castSelectedPrimaryWeapon(x, y),
      (x, y) => this.castSelectedSecondaryWeapon(x, y),
      pointer => this.isPointerOverHud(pointer)
    );

    this.physics.add.collider(this.player, this.dungeonSystem.getPhysicsWalls());

    this.spawnNPCs();
    this.physics.add.collider(this.player, this.npcGroup);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Arena is a shared, static, fog-free room with no NPCs — the one level where peers can
    // simply see each other. Other levels stay single-player.
    if (this.levelId === "arena") {
      this.arenaNet = new ArenaNetSystem(this, this.player, this.dungeonSystem.getPhysicsWalls());
    }

    this.localChatBubble = new ChatBubble(this);
  }

  /**
   * True when the pointer is over an interactive HUD element on the supervisor (MainScene).
   * The HUD renders on a sibling scene, so its buttons cannot stop this scene's cast via
   * event propagation; this cross-scene hit test replaces that guard.
   */
  private isPointerOverHud(pointer: Phaser.Input.Pointer): boolean {
    const mainScene = this.scene.get("MainScene");
    if (!mainScene?.input) {
      return false;
    }
    return mainScene.input.hitTestPointer(pointer).length > 0;
  }

  private toggleDevMode(): void {
    this.devModeEnabled = !this.devModeEnabled;

    this.devModeOverlay ??= new DevModeOverlay(this, this.dungeonSystem);

    if (this.devModeEnabled) {
      this.devModeOverlay.show();
      return;
    }

    this.devModeOverlay.hide();
  }

  private getSelectedWeaponSlot(): number {
    const mainScene = this.scene.get("MainScene") as unknown as {
      getSelectedWeaponSlot?: () => number;
    };

    return mainScene.getSelectedWeaponSlot?.() ?? 0;
  }

  private castSelectedPrimaryWeapon(targetX: number, targetY: number): void {
    if (this.getSelectedWeaponSlot() === 1) {
      this.weaponSystem.castRay(targetX, targetY);
      this.arenaNet?.broadcastFire("ray", this.player.x, this.player.y, targetX, targetY);
      return;
    }

    this.weaponSystem.castFireball(targetX, targetY);
    this.arenaNet?.broadcastFire("fireball", this.player.x, this.player.y, targetX, targetY);
  }

  private castSelectedSecondaryWeapon(targetX: number, targetY: number): void {
    if (this.getSelectedWeaponSlot() === 1) {
      this.weaponSystem.castSphere(targetX, targetY);
      this.arenaNet?.broadcastFire("sphere", this.player.x, this.player.y, targetX, targetY);
      return;
    }

    // Fireball (slot 0) grants a blink: right-click teleports the player to the target.
    this.playerTeleport.teleport(targetX, targetY);
  }

  public isDevModeEnabled(): boolean {
    return this.devModeEnabled;
  }

  /** Suspend player movement while the chat input is focused (typed keys must not steer). */
  public setChatTyping(active: boolean): void {
    this.isChatTyping = active;
    if (active) {
      this.player?.setVelocity(0, 0);
      if (this.player) {
        this.player.joystickVector = null;
      }
    }
  }

  /** Show the line above the local player and broadcast it to arena peers. */
  public sendArenaChat(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }

    this.localChatBubble?.show(trimmed);
    this.arenaNet?.broadcastChat(trimmed);
  }

  update(_time: number, delta: number) {
    if (!this.player || !this.player.body) return;

    if (this.scene.isPaused()) {
      this.player.setVelocity(0, 0);
      return;
    }

    if (this.isChatTyping) {
      // Suspend movement while the chat box is open so typed keys don't drive the player.
      this.player.setVelocity(0, 0);
    } else {
      this.playerControlSystem.syncPlayerKeys();
      this.player.update(_time, delta);
    }
    this.saveCurrentPlayerProgress();

    // Update standing NPCs in real-time
    for (const npc of this.npcs) {
      if (npc.active) {
        npc.update(this.player.x, this.player.y, _time, delta);
      }
    }

    this.fovSystem.update(delta);
    this.arenaNet?.update(_time);
    this.localChatBubble?.follow(this.player.x, this.player.y);
    this.devModeOverlay?.update();
  }

  private spawnNPCs(): void {
    this.npcGroup = this.physics.add.staticGroup();
    this.npcs = [];

    const levelDef = getLevelDefinition(this.levelId);
    if (!levelDef || !levelDef.npcPlacements) {
      return;
    }

    const tileSize = this.dungeonSystem.getTileSize();

    for (const p of levelDef.npcPlacements) {
      const x = p.tileX * tileSize;
      const y = p.tileY * tileSize;

      const npc = new NPC(this, x, y, p.type, p.name, p.dialogue, p.emotion, p.restTarget);
      npc.setMask(this.fovSystem.getNpcVisibilityMask());
      this.npcGroup.add(npc);
      this.npcs.push(npc);
    }
  }

  private getStartingPlayerProgress(): PlayerProgressState {
    if (this.savedPlayerProgress && this.isSavedPlayerProgressValid(this.savedPlayerProgress)) {
      return this.savedPlayerProgress;
    }

    return {
      levelId: this.levelId,
      x: this.dungeonSystem.getSpawnX(),
      y: this.dungeonSystem.getSpawnY(),
      rotation: 0
    };
  }

  private isSavedPlayerProgressValid(progress: PlayerProgressState): boolean {
    if (progress.levelId !== this.levelId) {
      return false;
    }

    const mapWidth = this.dungeonSystem.getMapWidth();
    const mapHeight = this.dungeonSystem.getMapHeight();

    if (progress.x < 0 || progress.x >= mapWidth || progress.y < 0 || progress.y >= mapHeight) {
      return false;
    }

    const tileSize = this.dungeonSystem.getTileSize();
    const column = Math.floor(progress.x / tileSize);
    const row = Math.floor(progress.y / tileSize);
    return this.dungeonSystem.isWalkable(column, row);
  }

  private saveCurrentPlayerProgress(force = false): void {
    if (!this.player?.body) {
      return;
    }

    const currentPlayerProgress: PlayerProgressState = {
      levelId: this.levelId,
      x: this.player.x,
      y: this.player.y,
      rotation: this.player.rotation
    };

    if (!force && this.isSamePlayerProgress(currentPlayerProgress, this.lastSavedPlayerProgress)) {
      return;
    }

    savePlayerProgress(currentPlayerProgress);
    this.lastSavedPlayerProgress = currentPlayerProgress;
  }

  private isSamePlayerProgress(
    currentProgress: PlayerProgressState,
    savedProgress?: PlayerProgressState
  ): boolean {
    if (!savedProgress) {
      return false;
    }

    return (
      currentProgress.levelId === savedProgress.levelId &&
      Math.abs(currentProgress.x - savedProgress.x) < 0.5 &&
      Math.abs(currentProgress.y - savedProgress.y) < 0.5 &&
      Math.abs(Phaser.Math.Angle.Wrap(currentProgress.rotation - savedProgress.rotation)) < 0.01
    );
  }
}
