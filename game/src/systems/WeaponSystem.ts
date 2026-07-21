import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { type AudioSystem } from "./AudioSystem";
import { type DungeonSystem } from "./DungeonSystem";
import { type FieldOfViewSystem } from "./FieldOfViewSystem";

export class WeaponSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly dungeonSystem: DungeonSystem;
  private readonly fovSystem: FieldOfViewSystem;
  private readonly audioSystem?: AudioSystem;
  private readonly activeCleanups = new Set<() => void>();
  private isDestroyed = false;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    dungeonSystem: DungeonSystem,
    fovSystem: FieldOfViewSystem,
    audioSystem?: AudioSystem
  ) {
    this.scene = scene;
    this.player = player;
    this.dungeonSystem = dungeonSystem;
    this.fovSystem = fovSystem;
    this.audioSystem = audioSystem;

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    for (const cleanup of [...this.activeCleanups]) {
      cleanup();
    }

    this.activeCleanups.clear();
  }

  public castFireball(targetX: number, targetY: number): void {
    if (this.isDestroyed) {
      return;
    }

    this.audioSystem?.playFireballCast(0.45);

    const projectile = this.scene.physics.add.sprite(this.player.x, this.player.y, "fireball");
    projectile.setPipeline("Light2D");
    projectile.setDepth(250);

    this.fovSystem.addProjectile(projectile);

    const spellLight = this.scene.lights.addLight(projectile.x, projectile.y, 150, 0xff5500, 3);

    const particles = this.scene.add.particles(0, 0, "fireball", {
      speed: 20,
      scale: { start: 1, end: 0 },
      blendMode: "ADD",
      lifespan: 300
    });
    particles.setDepth(240);
    particles.startFollow(projectile);

    this.scene.physics.moveTo(projectile, targetX, targetY, 300);

    let isCleanedUp = false;
    const destroyParticles = () => {
      try {
        particles.destroy();
      } catch {
        // Safe guard.
      }
    };

    const cleanUp = () => {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;
      this.activeCleanups.delete(cleanUp);
      this.fovSystem.removeProjectile(projectile);
      this.scene.lights.removeLight(spellLight);

      try {
        particles.stop();
        particles.stopFollow();
      } catch {
        // Safe guard in case particles or scene were already destroyed.
      }

      if (this.isDestroyed) {
        destroyParticles();
      } else {
        this.scene.time.delayedCall(500, () => {
          destroyParticles();
        });
      }

      projectile.destroy();
      this.scene.events.off("update", updateListener);
    };

    this.activeCleanups.add(cleanUp);

    this.scene.physics.add.collider(projectile, this.dungeonSystem.getPhysicsWalls(), () => {
      this.audioSystem?.playFireballHit(0.55);
      this.createExplosion(projectile.x, projectile.y);
      cleanUp();
    });

    this.scene.time.delayedCall(10000, () => {
      cleanUp();
    });

    const updateListener = () => {
      if (this.scene.scene.isPaused()) {
        return;
      }

      if (projectile.active) {
        spellLight.x = projectile.x;
        spellLight.y = projectile.y;
      } else {
        cleanUp();
      }
    };

    this.scene.events.on("update", updateListener);
  }

  private createExplosion(x: number, y: number): void {
    if (this.isDestroyed) {
      return;
    }

    const explosionLight = this.scene.lights.addLight(x, y, 50, 0xff5500, 10);
    const explosionObj = { x, y, radius: 50 };
    this.fovSystem.addExplosion(explosionObj);

    const particles = this.scene.add.particles(x, y, "fireball", {
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 2, end: 0 },
      blendMode: "ADD",
      lifespan: { min: 600, max: 700 },
      maxParticles: 25
    });
    particles.setDepth(260);

    const particleDestroyTimer = this.scene.time.delayedCall(1200, () => {
      destroyParticles();
    });

    let elapsed = 0;
    const duration = 1000;
    let isCleanedUp = false;

    const destroyParticles = () => {
      try {
        particles.destroy();
      } catch {
        // Safe guard.
      }
    };

    const cleanUp = () => {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;
      this.activeCleanups.delete(cleanUp);
      this.scene.lights.removeLight(explosionLight);
      this.scene.events.off("update", updateLight);
      this.fovSystem.removeExplosion(explosionObj);

      if (this.isDestroyed) {
        particleDestroyTimer.remove(false);
        destroyParticles();
      }
    };

    this.activeCleanups.add(cleanUp);

    const updateLight = (_time: number, delta: number) => {
      if (this.scene.scene.isPaused()) {
        return;
      }

      elapsed += delta;
      const progress = Math.min(elapsed / duration, 1);

      explosionLight.radius = 150 + progress * 250;
      explosionLight.intensity = 10 * (1 - progress);
      explosionObj.radius = explosionLight.radius;

      if (progress >= 1) {
        cleanUp();
      }
    };

    this.scene.events.on("update", updateLight);
  }
}

