import Phaser from "phaser";
import { Player } from "../entities/Player";

export interface ActiveExplosion {
  x: number;
  y: number;
  radius: number;
}

export class ProjectileSystem {
  private activeProjectiles: Phaser.Physics.Arcade.Sprite[] = [];
  private activeExplosions: ActiveExplosion[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly physicsWalls: Phaser.Physics.Arcade.StaticGroup
  ) {}

  castFireball(targetX: number, targetY: number) {
    const projectile = this.scene.physics.add.sprite(this.player.x, this.player.y, "fireball");
    projectile.setPipeline("Light2D");
    projectile.setDepth(250);

    this.activeProjectiles.push(projectile);

    const spellLight = this.scene.lights.addLight(projectile.x, projectile.y, 150, 0xff5500, 3);

    const particles = this.scene.add.particles(0, 0, "fireball", {
      speed: 20,
      scale: { start: 1, end: 0 },
      blendMode: "ADD",
      lifespan: 300,
    });
    particles.setDepth(240);
    particles.startFollow(projectile);

    this.scene.physics.moveTo(projectile, targetX, targetY, 300);

    let isCleanedUp = false;
    const cleanUp = () => {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;
      this.activeProjectiles = this.activeProjectiles.filter((activeProjectile) => activeProjectile !== projectile);
      this.scene.lights.removeLight(spellLight);
      particles.destroy();
      projectile.destroy();
      this.scene.events.off("update", updateListener);
    };

    this.scene.physics.add.collider(projectile, this.physicsWalls, () => {
      this.createExplosion(projectile.x, projectile.y);
      cleanUp();
    });

    this.scene.time.delayedCall(10000, () => {
      cleanUp();
    });

    const updateListener = () => {
      if (projectile.active) {
        spellLight.x = projectile.x;
        spellLight.y = projectile.y;
      } else {
        cleanUp();
      }
    };
    this.scene.events.on("update", updateListener);
  }

  getActiveProjectiles(): Phaser.Physics.Arcade.Sprite[] {
    return this.activeProjectiles;
  }

  getActiveExplosions(): ActiveExplosion[] {
    return this.activeExplosions;
  }

  destroy(): void {
    this.activeProjectiles = [];
    this.activeExplosions = [];
  }

  private createExplosion(x: number, y: number) {
    const explosionLight = this.scene.lights.addLight(x, y, 50, 0xff5500, 10);

    const explosionObj = { x, y, radius: 50 };
    this.activeExplosions.push(explosionObj);

    const particles = this.scene.add.particles(x, y, "fireball", {
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 2, end: 0 },
      blendMode: "ADD",
      lifespan: { min: 600, max: 700 },
      maxParticles: 25,
    });
    particles.setDepth(260);

    let elapsed = 0;
    const duration = 1000;

    const updateLight = (_time: number, delta: number) => {
      elapsed += delta;
      const progress = Math.min(elapsed / duration, 1);

      explosionLight.radius = 150 + progress * 250;
      explosionLight.intensity = 10 * (1 - progress);
      explosionObj.radius = explosionLight.radius;

      if (progress >= 1) {
        this.scene.lights.removeLight(explosionLight);
        this.scene.events.off("update", updateLight);
        this.activeExplosions = this.activeExplosions.filter((activeExplosion) => activeExplosion !== explosionObj);
      }
    };

    this.scene.events.on("update", updateLight);

    this.scene.time.delayedCall(1200, () => {
      particles.destroy();
    });
  }
}

