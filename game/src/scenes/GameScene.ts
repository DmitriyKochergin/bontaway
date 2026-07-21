import Phaser from "phaser";
import { Player } from "../entities/Player";
import { type PhaserRaycasterPlugin } from "../phaser-raycaster";
import { DungeonSystem } from "../systems/DungeonSystem";
import { FieldOfViewSystem } from "../systems/FieldOfViewSystem";
import { KeyboardSystem } from "../systems/KeyboardSystem";
import { MobileSystem } from "../systems/MobileSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
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
  private keyboardSystem!: KeyboardSystem;
  private weaponSystem!: WeaponSystem;
  // @ts-expect-error
  private mobileSystem?: MobileSystem;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.setupShutdownCleanup();
    this.keyboardSystem = new KeyboardSystem(this);
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
    if (this.player) {
      this.keyboardSystem.syncPlayerKeys(this.player);
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

    this.physics.add.collider(this.player, this.dungeonSystem.getPhysicsWalls());

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    const isMobile =
      !this.sys.game.device.os.desktop ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Multi-touch config: allow at least 5 active pointers
      this.input.addPointer(5);

      // Instantiate Mobile System for touch controls (movement joystick & right-screen face fireballs)
      this.mobileSystem = new MobileSystem(this, this.player, (x, y) => this.weaponSystem.castFireball(x, y));
    } else {
      // Desktop behavior: fire fireball directly where clicked
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (this.scene.isPaused()) {
          return;
        }
        this.weaponSystem.castFireball(pointer.worldX, pointer.worldY);
      });
    }
  }

  update(_time: number, delta: number) {
    if (!this.player || !this.player.body) return;

    if (this.scene.isPaused()) {
      this.player.setVelocity(0, 0);
      return;
    }

    this.keyboardSystem.syncPlayerKeys(this.player);
    this.player.update(_time, delta);

    this.fovSystem.update(delta);
  }


}
