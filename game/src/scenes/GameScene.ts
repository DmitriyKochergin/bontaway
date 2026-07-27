import Phaser from "phaser";
import { Player } from "../entities/Player";
import { DevModeOverlay } from "../systems/DevModeOverlay";
import { DungeonSystem } from "../systems/DungeonSystem";
import { FieldOfViewSystem } from "../systems/FieldOfViewSystem";
import { PlayerControlsSystem } from "../systems/PlayerControlsSystem";
import { PlayerTeleport } from "../systems/PlayerTeleport";
import { WeaponSystem } from "../systems/WeaponSystem";
import { type PhaserRaycasterPlugin } from "../types/phaser-raycaster";
import { GameHUD } from "../ui/GameHUD";
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
  private playerTeleport!: PlayerTeleport;
  private playerControlSystem!: PlayerControlsSystem;
  private weaponSystem!: WeaponSystem;
  private gameHUD?: GameHUD;
  private devModeEnabled = false;
  private devModeOverlay?: DevModeOverlay;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.setupShutdownCleanup();
    this.events.on("toggle-dev-mode", this.toggleDevMode, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off("toggle-dev-mode", this.toggleDevMode, this);
      this.devModeOverlay?.destroy();
      this.devModeOverlay = undefined;
      this.playerTeleport?.destroy();
      this.gameHUD?.destroy();
      this.gameHUD = undefined;
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

    this.dungeonSystem = new DungeonSystem(this);

    this.physics.world.setBounds(0, 0, this.dungeonSystem.getMapWidth(), this.dungeonSystem.getMapHeight());

    // Player
    this.player = new Player(this, this.dungeonSystem.getSpawnX(), this.dungeonSystem.getSpawnY());

    this.fovSystem = new FieldOfViewSystem(
      this,
      this.player,
      this.raycasterPlugin,
      this.dungeonSystem.getMapWidth(),
      this.dungeonSystem.getMapHeight(),
      this.dungeonSystem.getOccluders()
    );

    this.weaponSystem = new WeaponSystem(this, this.player, this.dungeonSystem, this.fovSystem, this.audioSystem);
    this.playerTeleport = new PlayerTeleport(this, this.player, () => this.devModeEnabled);
    this.playerControlSystem = new PlayerControlsSystem(
      this,
      this.player,
      (x, y) => this.weaponSystem.castFireball(x, y),
      (x, y) => this.playerTeleport.teleport(x, y)
    );

    this.physics.add.collider(this.player, this.dungeonSystem.getPhysicsWalls());

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.gameHUD = new GameHUD(this, this.audioSystem);
    this.gameHUD.create();
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

  public isDevModeEnabled(): boolean {
    return this.devModeEnabled;
  }

  update(_time: number, delta: number) {
    if (!this.player || !this.player.body) return;

    if (this.scene.isPaused()) {
      this.player.setVelocity(0, 0);
      return;
    }

    this.playerControlSystem.syncPlayerKeys();
    this.player.update(_time, delta);

    this.fovSystem.update(delta);
    this.gameHUD?.update(delta);
    this.devModeOverlay?.update();
  }
}
