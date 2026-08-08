import Phaser from "phaser";
import {
  createProjectileVisuals,
  type ProjectileVisualBundle,
  type ProjectileVisualKind
} from "../systems/ProjectileVisuals";
import { type WeaponKind } from "./SyncMessages";

const MAX_LIFETIME_MS = 6000;

interface ProjectileState {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly visuals: ProjectileVisualBundle;
  isCleanedUp: boolean;
}

/**
 * Pooled, purely cosmetic replicas of other players' shots. They fly the same arc at the same
 * speed and splat on walls, but carry no damage and never touch the fog-of-view system — the
 * arena runs no PvP, we only need to *see* the fire. Recycled via enable/disableBody.
 */
export class RemoteProjectiles {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.Physics.Arcade.Group;
  private readonly lifetimeTimers = new Map<Phaser.Physics.Arcade.Sprite, Phaser.Time.TimerEvent>();
  private readonly activeProjectiles = new Map<Phaser.Physics.Arcade.Sprite, ProjectileState>();
  private isDestroyed = false;

  constructor(scene: Phaser.Scene, walls: Phaser.Physics.Arcade.StaticGroup) {
    this.scene = scene;
    this.pool = scene.physics.add.group();

    scene.physics.add.collider(this.pool, walls, projectile => {
      this.deactivate(projectile as Phaser.Physics.Arcade.Sprite);
    });
  }

  spawn(weapon: WeaponKind, originX: number, originY: number, targetX: number, targetY: number): void {
    const kind = weapon as ProjectileVisualKind;
    const textureKey = weapon === "fireball" ? "fireball" : weapon === "ray" ? "weapon-blue-ray" : "weapon-blue-sphere";
    if (!this.scene.textures.exists(textureKey)) {
      return;
    }

    const projectile = this.pool.get(originX, originY, textureKey) as Phaser.Physics.Arcade.Sprite | null;
    if (!projectile) {
      return;
    }

    projectile.enableBody(true, originX, originY, true, true);
    projectile.setTexture(textureKey);
    projectile.setDepth(weapon === "ray" ? 255 : weapon === "sphere" ? 253 : 250);
    projectile.setPipeline("Light2D");
    projectile.setAlpha(weapon === "ray" ? 0.98 : weapon === "sphere" ? 0.94 : 1);
    const visuals = createProjectileVisuals(this.scene, projectile, kind);
    this.scene.physics.moveTo(projectile, targetX, targetY, weapon === "ray" ? 980 : weapon === "sphere" ? 280 : 300);

    const state: ProjectileState = {
      sprite: projectile,
      visuals,
      isCleanedUp: false
    };

    this.activeProjectiles.set(projectile, state);
    this.lifetimeTimers.get(projectile)?.remove(false);
    this.lifetimeTimers.set(
      projectile,
      this.scene.time.delayedCall(MAX_LIFETIME_MS, () => this.deactivate(projectile))
    );
  }

  update(): void {
    const worldBounds = this.scene.physics.world.bounds;
    const strayProjectiles: Phaser.Physics.Arcade.Sprite[] = [];

    for (const [projectile, state] of this.activeProjectiles) {
      if (!projectile.active) {
        continue;
      }

      state.visuals.syncLight();

      if (!Phaser.Geom.Rectangle.Contains(worldBounds, projectile.x, projectile.y)) {
        strayProjectiles.push(projectile);
      }
    }

    for (const projectile of strayProjectiles) {
      this.deactivate(projectile);
    }
  }

  private deactivate(projectile: Phaser.Physics.Arcade.Sprite): void {
    const state = this.activeProjectiles.get(projectile);
    if (!state || state.isCleanedUp) {
      return;
    }

    state.isCleanedUp = true;
    state.visuals.cleanup(this.isDestroyed);
    this.activeProjectiles.delete(projectile);

    this.lifetimeTimers.get(projectile)?.remove(false);
    this.lifetimeTimers.delete(projectile);

    projectile.disableBody(true, true);
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    for (const state of this.activeProjectiles.values()) {
      state.visuals.cleanup(true);
    }
    this.activeProjectiles.clear();

    for (const timer of this.lifetimeTimers.values()) {
      timer.remove(false);
    }
    this.lifetimeTimers.clear();

    try {
      this.pool.destroy(true);
    } catch {
      // Scene physics may already be torn down during a level restart.
    }
  }
}
