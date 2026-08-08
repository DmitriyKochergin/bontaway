import Phaser from "phaser";
import { type WeaponKind } from "./SyncMessages";

interface RemoteWeaponConfig {
  readonly texture: string;
  readonly speed: number;
  readonly depth: number;
  readonly lightColor: number;
  readonly lightRadius: number;
  readonly lightIntensity: number;
}

// Textures are owned by WeaponSystem: "fireball" is a preloaded asset, the blue keys are generated
// in its constructor. ArenaNetSystem is built after WeaponSystem, so all three exist by spawn time.
const WEAPON_CONFIG: Record<WeaponKind, RemoteWeaponConfig> = {
  fireball: { texture: "fireball", speed: 300, depth: 250, lightColor: 0xff5500, lightRadius: 150, lightIntensity: 3 },
  ray: {
    texture: "weapon-blue-ray",
    speed: 980,
    depth: 255,
    lightColor: 0x93dfff,
    lightRadius: 120,
    lightIntensity: 3.4
  },
  sphere: {
    texture: "weapon-blue-sphere",
    speed: 280,
    depth: 253,
    lightColor: 0x5eb7ff,
    lightRadius: 190,
    lightIntensity: 5.2
  }
};

const MAX_LIFETIME_MS = 6000;

/**
 * Pooled, purely cosmetic replicas of other players' shots. They fly the same arc at the same
 * speed and splat on walls, but carry no damage and never touch the fog-of-view system — the
 * arena runs no PvP, we only need to *see* the fire. Recycled via enable/disableBody.
 */
export class RemoteProjectiles {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.Physics.Arcade.Group;
  private readonly lights = new Map<Phaser.Physics.Arcade.Sprite, Phaser.GameObjects.Light>();
  private readonly lifetimeTimers = new Map<Phaser.Physics.Arcade.Sprite, Phaser.Time.TimerEvent>();

  constructor(scene: Phaser.Scene, walls: Phaser.Physics.Arcade.StaticGroup) {
    this.scene = scene;
    this.pool = scene.physics.add.group();

    scene.physics.add.collider(this.pool, walls, projectile => {
      this.deactivate(projectile as Phaser.Physics.Arcade.Sprite);
    });
  }

  spawn(weapon: WeaponKind, originX: number, originY: number, targetX: number, targetY: number): void {
    const config = WEAPON_CONFIG[weapon];
    if (!config || !this.scene.textures.exists(config.texture)) {
      return;
    }

    const projectile = this.pool.get(originX, originY, config.texture) as Phaser.Physics.Arcade.Sprite | null;
    if (!projectile) {
      return;
    }

    projectile.enableBody(true, originX, originY, true, true);
    projectile.setTexture(config.texture);
    projectile.setDepth(config.depth);
    projectile.setPipeline("Light2D");
    this.scene.physics.moveTo(projectile, targetX, targetY, config.speed);

    // A recycled sprite has already been through deactivate(), so it carries no light — always
    // mint a fresh one here.
    if (this.scene.lights) {
      this.lights.set(
        projectile,
        this.scene.lights.addLight(originX, originY, config.lightRadius, config.lightColor, config.lightIntensity)
      );
    }

    this.lifetimeTimers.get(projectile)?.remove(false);
    this.lifetimeTimers.set(
      projectile,
      this.scene.time.delayedCall(MAX_LIFETIME_MS, () => this.deactivate(projectile))
    );
  }

  update(): void {
    const worldBounds = this.scene.physics.world.bounds;
    const strayProjectiles: Phaser.Physics.Arcade.Sprite[] = [];

    for (const [projectile, light] of this.lights) {
      if (!projectile.active) {
        continue;
      }

      light.x = projectile.x;
      light.y = projectile.y;

      if (!Phaser.Geom.Rectangle.Contains(worldBounds, projectile.x, projectile.y)) {
        strayProjectiles.push(projectile);
      }
    }

    for (const projectile of strayProjectiles) {
      this.deactivate(projectile);
    }
  }

  private deactivate(projectile: Phaser.Physics.Arcade.Sprite): void {
    if (!projectile.active) {
      return;
    }

    const light = this.lights.get(projectile);
    if (light && this.scene.lights) {
      try {
        this.scene.lights.removeLight(light);
      } catch {
        // Scene lights may already be gone during shutdown.
      }
    }
    this.lights.delete(projectile);

    this.lifetimeTimers.get(projectile)?.remove(false);
    this.lifetimeTimers.delete(projectile);

    projectile.disableBody(true, true);
  }

  destroy(): void {
    for (const light of this.lights.values()) {
      try {
        this.scene.lights?.removeLight(light);
      } catch {
        // Scene lights may already be gone during shutdown.
      }
    }
    this.lights.clear();

    for (const timer of this.lifetimeTimers.values()) {
      timer.remove(false);
    }
    this.lifetimeTimers.clear();

    this.pool.clear(true, true);
    this.pool.destroy(true);
  }
}
