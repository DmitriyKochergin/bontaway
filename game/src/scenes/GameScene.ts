import Phaser from "phaser";
import { Player } from "../entities/Player";
import { type PhaserRaycasterPlugin } from "../phaser-raycaster";
import { DungeonSystem } from "../systems/DungeonSystem";
import { FieldOfViewSystem } from "../systems/FieldOfViewSystem";
import { KeyboardSystem } from "../systems/KeyboardSystem";
import { MobileSystem } from "../systems/MobileSystem";
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

    this.physics.add.collider(this.player, this.dungeonSystem.getPhysicsWalls());

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    const isMobile =
      !this.sys.game.device.os.desktop ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Multi-touch config: allow at least 5 active pointers
      this.input.addPointer(5);

      // Instantiate Mobile System for touch controls (movement joystick & right-screen face fireballs)
      this.mobileSystem = new MobileSystem(this, this.player, (x, y) => this.castFireball(x, y));
    } else {
      // Desktop behavior: fire fireball directly where clicked
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (this.scene.isPaused()) {
          return;
        }
        this.castFireball(pointer.worldX, pointer.worldY);
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

  private castFireball(targetX: number, targetY: number) {
    this.audioSystem?.playFireballCast(0.45);

    // Create fireball sprite
    const projectile = this.physics.add.sprite(this.player.x, this.player.y, "fireball");
    projectile.setPipeline("Light2D");
    projectile.setDepth(250);

    this.fovSystem.addProjectile(projectile);

    // Add light that flies with the fireball
    const spellLight = this.lights.addLight(projectile.x, projectile.y, 150, 0xff5500, 3);

    // Particles (fire trail)
    const particles = this.add.particles(0, 0, "fireball", {
      speed: 20,
      scale: { start: 1, end: 0 },
      blendMode: "ADD",
      lifespan: 300
    });
    particles.setDepth(240);
    particles.startFollow(projectile);

    // Move to target coordinates
    this.physics.moveTo(projectile, targetX, targetY, 300);

    let isCleanedUp = false;
    const cleanUp = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      this.fovSystem.removeProjectile(projectile);
      this.lights.removeLight(spellLight);

      // Stop emitting and following so existing tail fades out naturally
      try {
        particles.stop();
        particles.stopFollow();
      } catch (err) {
        // Safe guard in case particles or scene were already destroyed
      }
      this.time.delayedCall(500, () => {
        try {
          particles.destroy();
        } catch (err) {
          // Safe guard
        }
      });

      projectile.destroy();
      this.events.off("update", updateListener);
    };

    // Destroy fireball and trigger explosion when it hits a wall/obstacle
    this.physics.add.collider(projectile, this.dungeonSystem.getPhysicsWalls(), () => {
      this.audioSystem?.playFireballHit(0.55);
      this.createExplosion(projectile.x, projectile.y);
      cleanUp();
    });

    // Destroy and cleanup after 10 seconds (or upon wall/obstacle collision)
    this.time.delayedCall(10000, () => {
      cleanUp();
    });

    // Update light position every frame
    const updateListener = () => {
      if (this.scene.isPaused()) return;

      if (projectile.active) {
        spellLight.x = projectile.x;
        spellLight.y = projectile.y;
      } else {
        cleanUp();
      }
    };
    this.events.on("update", updateListener);
  }

  private createExplosion(x: number, y: number) {
    // Create an expanding explosion light (matching fireball's orange color)
    const explosionLight = this.lights.addLight(x, y, 50, 0xff5500, 10);

    const explosionObj = { x, y, radius: 50 };
    this.fovSystem.addExplosion(explosionObj);

    // Explosion particles (longer lifespan to match the slower fade out)
    const particles = this.add.particles(x, y, "fireball", {
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 2, end: 0 },
      blendMode: "ADD",
      lifespan: { min: 600, max: 700 },
      maxParticles: 25
    });
    particles.setDepth(260);

    // Animate the light expansion and fading (longer duration for a slower fade out)
    let elapsed = 0;
    const duration = 1000; // 1000 ms (1 second fade out)

    const updateLight = (_time: number, delta: number) => {
      if (this.scene.isPaused()) return;

      elapsed += delta;
      const progress = Math.min(elapsed / duration, 1);

      explosionLight.radius = 150 + progress * 250; // Expands to 400 radius
      explosionLight.intensity = 10 * (1 - progress);
      explosionObj.radius = explosionLight.radius;

      if (progress >= 1) {
        this.lights.removeLight(explosionLight);
        this.events.off("update", updateLight);
        this.fovSystem.removeExplosion(explosionObj);
      }
    };

    this.events.on("update", updateLight);

    // Destroy particle emitter system when all particles fade
    this.time.delayedCall(1200, () => {
      particles.destroy();
    });
  }

}
