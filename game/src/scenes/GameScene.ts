import Phaser from "phaser";
import { EDITOR_MODE_ENABLED } from "../editor/editorMode";
import { cloneLevelDocument, type LevelDocument } from "../editor/LevelDocument";
import { type LevelEditorController } from "../editor/LevelEditorController";
import { Player } from "../entities/Player";
import { getLevelDefinition } from "../levels";
import { ArenaNetSystem } from "../multiplayer/ArenaNetSystem";
import { ChatBubble } from "../multiplayer/ChatBubble";
import { type NetworkStats } from "../multiplayer/NetworkManager";
import { DevModeOverlay } from "../systems/DevModeOverlay";
import { DungeonSystem } from "../systems/DungeonSystem";
import { FieldOfViewSystem } from "../systems/FieldOfViewSystem";
import { NpcManager } from "../systems/NpcManager";
import { PlayerControlsSystem } from "../systems/PlayerControlsSystem";
import { loadPlayerProgress, type PlayerProgressState, savePlayerProgress } from "../systems/PlayerProgressManager";
import { PlayerTeleport } from "../systems/PlayerTeleport";
import { TorchManager } from "../systems/TorchManager";
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
  private sharedNet?: ArenaNetSystem;
  private localChatBubble?: ChatBubble;
  private isChatTyping = false;
  private devModeEnabled = false;
  private devModeOverlay?: DevModeOverlay;
  private levelEditorController?: LevelEditorController;
  private currentLevelDocument?: LevelDocument;
  private levelId = "arena";
  private savedPlayerProgress?: PlayerProgressState;
  private lastSavedPlayerProgress?: PlayerProgressState;
  private npcManager?: NpcManager;
  private torchManager?: TorchManager;

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

  public getNetworkStats(): NetworkStats {
    return (
      this.sharedNet?.getNetworkStats() ?? {
        peerCount: 0,
        pingMs: null,
        connectionState: "offline"
      }
    );
  }

  public getTileSize(): number {
    return this.dungeonSystem.getTileSize();
  }

  public getDungeonColumns(): number {
    return this.dungeonSystem.getDungeonColumns();
  }

  public getDungeonRows(): number {
    return this.dungeonSystem.getDungeonRows();
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
      this.npcManager?.destroy();
      this.npcManager = undefined;
      this.torchManager?.destroy();
      this.torchManager = undefined;
      this.sharedNet?.destroy();
      this.sharedNet = undefined;
      this.localChatBubble?.destroy();
      this.localChatBubble = undefined;
      this.isChatTyping = false;
      this.devModeOverlay?.destroy();
      this.devModeOverlay = undefined;
      this.levelEditorController?.destroy();
      this.levelEditorController = undefined;
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
    this.currentLevelDocument = this.buildLevelDocument();

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

    this.npcManager = new NpcManager(this, this.dungeonSystem, this.fovSystem, this.levelId);
    this.npcManager.spawn();
    this.physics.add.collider(this.player, this.npcManager.getGroup());

    this.torchManager = new TorchManager(this, this.dungeonSystem, this.fovSystem, this.levelId);
    this.torchManager.spawn();

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Arena and Trademeet are shared, static rooms with no NPC-authority sync — the levels where
    // peers can simply see each other. Other levels stay single-player.
    const multiplayerRoomId = this.getMultiplayerRoomId();
    if (multiplayerRoomId) {
      this.sharedNet = new ArenaNetSystem(
        this,
        this.player,
        this.weaponSystem,
        this.fovSystem.getNpcVisibilityMask(),
        multiplayerRoomId
      );
    }

    this.localChatBubble = new ChatBubble(this);
  }

  /**
   * True when the pointer is over an interactive HUD element on the supervisor (MainScene),
   * or when the level editor is active (editor owns all world-space pointer events while enabled).
   * The HUD renders on a sibling scene, so its buttons cannot stop this scene's cast via
   * event propagation; this cross-scene hit test replaces that guard.
   */
  private isPointerOverHud(pointer: Phaser.Input.Pointer): boolean {
    // Block player firing while the level editor owns the viewport.
    if (this.levelEditorController?.isEnabled()) {
      return true;
    }

    const mainScene = this.scene.get("MainScene");
    if (!mainScene?.input) {
      return false;
    }
    return mainScene.input.hitTestPointer(pointer).length > 0;
  }

  public isLevelEditorActive(): boolean {
    return Boolean(this.levelEditorController?.isEnabled());
  }

  public async toggleLevelEditor(): Promise<void> {
    if (!EDITOR_MODE_ENABLED) {
      return;
    }

    if (!this.devModeEnabled) {
      this.devModeEnabled = true;
      this.getOrCreateDevModeOverlay().show();
    }

    if (!this.levelEditorController) {
      await this.ensureLevelEditorController();
    }

    this.levelEditorController?.toggleEnabled();
  }

  private toggleDevMode(): void {
    if (!EDITOR_MODE_ENABLED) {
      return;
    }

    this.devModeEnabled = !this.devModeEnabled;

    if (this.devModeEnabled) {
      this.getOrCreateDevModeOverlay().show();
      void this.ensureLevelEditorController();
      return;
    }

    this.devModeOverlay?.hide();
    this.levelEditorController?.destroy();
    this.levelEditorController = undefined;
  }

  private getOrCreateDevModeOverlay(): DevModeOverlay {
    this.devModeOverlay ??= new DevModeOverlay(this, this.dungeonSystem, {
      getFovRaycastTimeMs: () => this.fovSystem?.getLastRaycastTimeMs() ?? 0,
      getNetworkStats: () =>
        this.sharedNet?.getNetworkStats() ?? { peerCount: 0, pingMs: null, connectionState: "offline" },
      getActiveLightsCount: () =>
        (this.lights as { lights?: unknown[] })?.lights?.length ?? this.torchManager?.getLightCount() ?? 0
    });
    return this.devModeOverlay;
  }

  private async ensureLevelEditorController(): Promise<void> {
    if (!this.devModeEnabled || this.levelEditorController) {
      return;
    }

    const { LevelEditorController } = await import("../editor/LevelEditorController");

    if (!this.devModeEnabled || this.levelEditorController) {
      return;
    }

    this.levelEditorController = new LevelEditorController(this, this, pointer => this.isPointerOverHud(pointer));
    this.levelEditorController.attachDocument(this.getLevelDocument());
    this.levelEditorController.setEnabled(false);
  }

  private getSelectedWeaponSlot(): number {
    const mainScene = this.scene.get("MainScene") as unknown as {
      getSelectedWeaponSlot?: () => number;
    };

    return mainScene.getSelectedWeaponSlot?.() ?? 0;
  }

  private getMultiplayerRoomId(): string | undefined {
    if (this.levelId !== "arena" && this.levelId !== "trademeet") {
      return undefined;
    }

    return `bontaway-${this.levelId}`;
  }

  private castSelectedPrimaryWeapon(targetX: number, targetY: number): void {
    if (this.getSelectedWeaponSlot() === 1) {
      this.weaponSystem.castRay(targetX, targetY);
      this.sharedNet?.broadcastFire("ray", this.player.x, this.player.y, targetX, targetY);
      return;
    }

    this.weaponSystem.castFireball(targetX, targetY);
    this.sharedNet?.broadcastFire("fireball", this.player.x, this.player.y, targetX, targetY);
  }

  private castSelectedSecondaryWeapon(targetX: number, targetY: number): void {
    if (this.getSelectedWeaponSlot() === 1) {
      this.weaponSystem.castSphere(targetX, targetY);
      this.sharedNet?.broadcastFire("sphere", this.player.x, this.player.y, targetX, targetY);
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
    this.sharedNet?.broadcastChat(trimmed);
  }

  update(_time: number, delta: number) {
    if (!this.player || !this.player.body) return;

    this.levelEditorController?.update();
    this.devModeOverlay?.update();

    if (this.levelEditorController?.isEnabled()) {
      this.player.setVelocity(0, 0);
      return;
    }

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

    this.npcManager?.update(this.player.x, this.player.y, _time, delta);

    this.fovSystem.update(delta);
    this.sharedNet?.update(_time);
    this.localChatBubble?.follow(this.player.x, this.player.y);
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

  private isSamePlayerProgress(currentProgress: PlayerProgressState, savedProgress?: PlayerProgressState): boolean {
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

  public getLevelDocument(): LevelDocument {
    this.currentLevelDocument ??= this.buildLevelDocument();
    return cloneLevelDocument(this.currentLevelDocument);
  }

  public applyLevelDocument(document: LevelDocument): void {
    this.currentLevelDocument = cloneLevelDocument(document);
    const levelDef = getLevelDefinition(this.levelId);

    if (!levelDef || document.type === "matrix") {
      return;
    }

    levelDef.doors = document.doors.map(door => ({ ...door }));
    levelDef.obstacles = document.obstacles.map(obstacle => ({ ...obstacle }));
    levelDef.torches = document.torches?.map(torch => ({ ...torch }));
    levelDef.npcs = document.npcs?.map(npc => ({ ...npc }));
    levelDef.spawnX = document.spawnX;
    levelDef.spawnY = document.spawnY;
  }

  public refreshRuntimeObjects(): void {
    if (!this.npcManager || !this.torchManager) {
      return;
    }

    this.torchManager.destroy();
    this.npcManager.destroy();
    this.npcManager.spawn();
    this.physics.add.collider(this.player, this.npcManager.getGroup());
    this.torchManager.spawn();
  }

  public reloadLevel(): void {
    this.scene.restart({ levelId: this.levelId });
  }

  public getLevelSourcePath(): string {
    return `src/levels/${this.levelId}.ts`;
  }

  public getWorldPoint(pointer: Phaser.Input.Pointer): { column: number; row: number } {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileSize = this.dungeonSystem.getTileSize();
    return {
      column: worldPoint.x / tileSize,
      row: worldPoint.y / tileSize
    };
  }

  private buildLevelDocument(): LevelDocument {
    const levelDef = getLevelDefinition(this.levelId);
    if (!levelDef) {
      throw new Error(`Level definition not found for levelId: ${this.levelId}`);
    }
    const layout = levelDef.generateLayout(this.dungeonSystem.getTileSize());

    // Matrix levels carry their tile grid on the definition object.
    if (levelDef.tiles) {
      return {
        type: "matrix",
        id: levelDef.id,
        name: levelDef.name,
        columns: levelDef.columns,
        rows: levelDef.rows,
        spawnX: layout.spawnX,
        spawnY: layout.spawnY,
        fogOfWarEnabled: levelDef.fogOfWarEnabled,
        doors: levelDef.doors.map(door => ({ ...door })),
        obstacles: levelDef.obstacles.map(obstacle => ({ ...obstacle })),
        torches: levelDef.torches?.map(torch => ({ ...torch })),
        npcs: levelDef.npcs?.map(npc => ({ ...npc })),
        tiles: levelDef.tiles.map(row => [...row])
      };
    }

    return {
      type: "ts",
      id: levelDef.id,
      name: levelDef.name,
      columns: levelDef.columns,
      rows: levelDef.rows,
      spawnX: layout.spawnX,
      spawnY: layout.spawnY,
      fogOfWarEnabled: levelDef.fogOfWarEnabled,
      doors: levelDef.doors.map(door => ({ ...door })),
      obstacles: levelDef.obstacles.map(obstacle => ({ ...obstacle })),
      torches: levelDef.torches?.map(torch => ({ ...torch })),
      npcs: levelDef.npcs?.map(npc => ({ ...npc })),
      layout: {
        walkable: layout.walkable.map(row => [...row]),
        blueprints: []
      }
    };
  }
}
