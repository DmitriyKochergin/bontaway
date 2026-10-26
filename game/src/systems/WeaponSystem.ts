import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { DepthLayer } from "../types/depth-layer";
import { type AudioSystem } from "./AudioSystem";
import { type DungeonSystem } from "./DungeonSystem";
import { type FieldOfViewSystem } from "./FieldOfViewSystem";
import {
  createProjectileImpactVisuals,
  createProjectileVisuals,
  type ProjectileImpactKind,
  type ProjectileImpactVisualBundle,
  type ProjectileVisualKind
} from "./ProjectileVisuals";

type ProjectileKind = ProjectileVisualKind;

interface ProjectileState {
  readonly kind: ProjectileKind;
  readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  readonly collisionRadius: number;
  cleanup: () => void;
  visuals?: ReturnType<typeof createProjectileVisuals>;
  launchedAt: number;
  expiresAt: number;
  lightningGraphics?: Phaser.GameObjects.Graphics;
  isActive: boolean;
}

interface ProjectileProfile {
  readonly textureKey: string;
  readonly depth: DepthLayer;
  readonly alpha: number;
  readonly speed: number;
  readonly lifetime: number;
  readonly collisionRadius: number;
  readonly explosionKind: ProjectileImpactKind;
}

const WEAPON_TEXTURES = {
  ray: "weapon-blue-ray",
  sphere: "weapon-blue-sphere",
  spark: "weapon-blue-spark"
} as const;

const PROJECTILE_PROFILES: Record<ProjectileKind, ProjectileProfile> = {
  fireball: {
    textureKey: "fireball",
    depth: DepthLayer.FireballProjectile,
    alpha: 1,
    speed: 300,
    lifetime: 10000,
    collisionRadius: 0,
    explosionKind: "fireball"
  },
  ray: {
    textureKey: WEAPON_TEXTURES.ray,
    depth: DepthLayer.RayProjectile,
    alpha: 0.98,
    speed: 980,
    lifetime: 5200,
    collisionRadius: 12,
    explosionKind: "small"
  },
  sphere: {
    textureKey: WEAPON_TEXTURES.sphere,
    depth: DepthLayer.SphereProjectile,
    alpha: 0.94,
    speed: 280,
    lifetime: 7000,
    collisionRadius: 26,
    explosionKind: "large"
  }
};

export class WeaponSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly dungeonSystem: DungeonSystem;
  private readonly fovSystem: FieldOfViewSystem;
  private readonly audioSystem?: AudioSystem;
  private readonly activeCleanups = new Set<() => void>();
  private readonly activeProjectiles = new Set<ProjectileState>();
  private readonly activeRays = new Set<ProjectileState>();
  private readonly activeSpheres = new Set<ProjectileState>();
  private readonly activeExplosions = new Set<ProjectileImpactVisualBundle>();
  private readonly projectilePools: Record<ProjectileKind, ProjectileState[]> = {
    fireball: [],
    ray: [],
    sphere: []
  };
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

    this.ensureWeaponTextures();

    this.scene.events.on("update", this.updateProjectiles, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.scene.events.off("update", this.updateProjectiles, this);

    for (const cleanup of [...this.activeCleanups]) {
      cleanup();
    }

    for (const explosion of this.activeExplosions) {
      explosion.cleanup(true);
    }

    this.activeCleanups.clear();
    this.activeProjectiles.clear();
    this.activeRays.clear();
    this.activeSpheres.clear();
    this.activeExplosions.clear();

    for (const pool of Object.values(this.projectilePools)) {
      for (const state of pool) {
        state.lightningGraphics?.destroy();
        state.sprite.destroy();
      }
    }
  }

  public castFireball(targetX: number, targetY: number, originX = this.player.x, originY = this.player.y): void {
    if (this.isDestroyed) {
      return;
    }

    this.audioSystem?.playFireballCast(0.45);

    this.launchProjectile("fireball", targetX, targetY, originX, originY);
  }

  public castRay(targetX: number, targetY: number, originX = this.player.x, originY = this.player.y): void {
    this.castProjectile("ray", targetX, targetY, originX, originY);
  }

  public castSphere(targetX: number, targetY: number, originX = this.player.x, originY = this.player.y): void {
    this.castProjectile("sphere", targetX, targetY, originX, originY);
  }

  private castProjectile(
    kind: ProjectileKind,
    targetX: number,
    targetY: number,
    originX = this.player.x,
    originY = this.player.y
  ): void {
    if (this.isDestroyed) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(originX, originY, targetX, targetY);
    if (distance < 4) {
      return;
    }

    if (kind === "ray") {
      this.audioSystem?.playShockRifleFire(0.35);
    } else {
      this.audioSystem?.playShockRifleAltFire(0.55);
    }

    this.launchProjectile(kind, targetX, targetY, originX, originY);
  }

  private launchProjectile(
    kind: ProjectileKind,
    targetX: number,
    targetY: number,
    originX: number,
    originY: number
  ): void {
    const profile = PROJECTILE_PROFILES[kind];
    const state = this.acquireProjectile(kind);
    const { sprite } = state;

    sprite.setPosition(originX, originY);
    sprite.setTexture(profile.textureKey);
    sprite.setPipeline("Light2D");
    sprite.setDepth(profile.depth);
    sprite.setAlpha(profile.alpha);
    sprite.setCollideWorldBounds(false);
    sprite.setActive(true);
    sprite.setVisible(true);
    sprite.body.enable = true;
    sprite.body.reset(originX, originY);
    this.scene.physics.moveTo(sprite, targetX, targetY, profile.speed);

    state.launchedAt = this.scene.time.now;
    state.expiresAt = state.launchedAt + profile.lifetime;
    state.visuals = createProjectileVisuals(this.scene, sprite, kind);
    state.lightningGraphics?.setVisible(true);

    this.fovSystem.addProjectile(sprite);
    this.activeCleanups.add(state.cleanup);
    this.activeProjectiles.add(state);

    if (kind === "ray") {
      this.activeRays.add(state);
    } else if (kind === "sphere") {
      this.activeSpheres.add(state);
    }
  }

  private acquireProjectile(kind: ProjectileKind): ProjectileState {
    const pool = this.projectilePools[kind];
    const reusableState = pool.find(state => !state.isActive);
    if (reusableState) {
      reusableState.isActive = true;
      return reusableState;
    }

    const profile = PROJECTILE_PROFILES[kind];
    const sprite = this.scene.physics.add.sprite(0, 0, profile.textureKey);
    sprite.setActive(false);
    sprite.setVisible(false);
    sprite.body.enable = false;

    const state: ProjectileState = {
      kind,
      sprite,
      collisionRadius: profile.collisionRadius,
      cleanup: () => this.releaseProjectile(state),
      launchedAt: 0,
      expiresAt: 0,
      isActive: true
    };

    if (kind === "sphere") {
      state.lightningGraphics = this.scene.add.graphics();
      state.lightningGraphics.setDepth(DepthLayer.SphereLightning);
      state.lightningGraphics.setBlendMode(Phaser.BlendModes.ADD);
      state.lightningGraphics.setVisible(false);
    }

    this.scene.physics.add.collider(sprite, this.dungeonSystem.getPhysicsWalls(), () => {
      this.handleProjectileWallCollision(state);
    });
    pool.push(state);
    return state;
  }

  private releaseProjectile(state: ProjectileState): void {
    if (!state.isActive) {
      return;
    }

    state.isActive = false;
    state.launchedAt = 0;
    state.expiresAt = 0;
    this.activeCleanups.delete(state.cleanup);
    this.activeProjectiles.delete(state);
    this.activeRays.delete(state);
    this.activeSpheres.delete(state);
    const sprite = state.sprite;
    state.visuals?.cleanup(this.isDestroyed);
    state.visuals = undefined;
    state.lightningGraphics?.clear();
    state.lightningGraphics?.setVisible(false);

    if (!sprite) {
      return;
    }

    this.fovSystem.removeProjectile(sprite);

    if (!sprite.body) {
      sprite.setActive(false);
      sprite.setVisible(false);
      return;
    }

    sprite.setVelocity(0, 0);
    sprite.body.enable = false;
    sprite.setActive(false);
    sprite.setVisible(false);
  }

  private handleProjectileWallCollision(state: ProjectileState): void {
    if (!state.isActive) {
      return;
    }

    const { sprite } = state;
    if (state.kind === "fireball") {
      this.audioSystem?.playFireballHit(0.55);
    } else {
      if (state.kind === "sphere") {
        this.audioSystem?.playShockRifleHit(0.65);
      }
    }

    const explosion = createProjectileImpactVisuals(
      this.scene,
      sprite.x,
      sprite.y,
      PROJECTILE_PROFILES[state.kind].explosionKind,
      this.fovSystem
    );
    this.activeExplosions.add(explosion);

    this.releaseProjectile(state);
  }

  private updateProjectiles(time: number, delta: number): void {
    if (this.isDestroyed || this.scene.scene.isPaused()) {
      return;
    }

    for (const state of this.activeProjectiles) {
      if (!state.sprite.active || !state.sprite.body || time >= state.expiresAt) {
        this.releaseProjectile(state);
        continue;
      }

      state.visuals?.syncLight();

      if (state.kind === "ray") {
        this.resolveRaySphereImpact(state);
      } else if (state.kind === "sphere") {
        this.updateSphereEffects(state, time - state.launchedAt);
      }
    }

    for (const explosion of this.activeExplosions) {
      if (!explosion.update(delta)) {
        this.activeExplosions.delete(explosion);
      }
    }
  }

  private resolveRaySphereImpact(rayState: ProjectileState): void {
    if (!rayState.isActive) {
      return;
    }

    for (const sphereState of this.activeSpheres) {
      if (!sphereState.isActive || !sphereState.sprite.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(
        rayState.sprite.x,
        rayState.sprite.y,
        sphereState.sprite.x,
        sphereState.sprite.y
      );

      if (distance > rayState.collisionRadius + sphereState.collisionRadius) {
        continue;
      }

      this.audioSystem?.playShockRifleHit(0.85);
      const explosion = createProjectileImpactVisuals(
        this.scene,
        (rayState.sprite.x + sphereState.sprite.x) * 0.5,
        (rayState.sprite.y + sphereState.sprite.y) * 0.5,
        "huge",
        this.fovSystem
      );
      this.activeExplosions.add(explosion);

      this.releaseProjectile(rayState);
      this.releaseProjectile(sphereState);
      return;
    }
  }

  private updateSphereEffects(state: ProjectileState, elapsed: number): void {
    const graphics = state.lightningGraphics;
    if (!graphics) {
      return;
    }

    const light = state.visuals?.light;
    if (!light) {
      return;
    }

    const pulse = 0.5 + Math.sin(elapsed * 0.007) * 0.5;
    const flicker = 0.5 + Math.sin(elapsed * 0.035) * 0.5;
    light.radius = 170 + pulse * 45;
    light.intensity = 4.8 + pulse * 1.4 + flicker * 0.8;

    graphics.clear();

    const originX = state.sprite.body ? state.sprite.body.center.x : state.sprite.x;
    const originY = state.sprite.body ? state.sprite.body.center.y : state.sprite.y;

    // Pulsing electric core halo.
    graphics.fillStyle(0x2d77ff, 0.16 + pulse * 0.12);
    graphics.fillCircle(originX, originY, 22 + pulse * 8);
    graphics.fillStyle(0xd9f7ff, 0.28 + flicker * 0.22);
    graphics.fillCircle(originX, originY, 7 + flicker * 3);

    const boltCount = 8;
    for (let boltIndex = 0; boltIndex < boltCount; boltIndex++) {
      this.drawLightningBolt(graphics, originX, originY, elapsed, boltIndex);
    }
  }

  private drawLightningBolt(
    graphics: Phaser.GameObjects.Graphics,
    originX: number,
    originY: number,
    elapsed: number,
    boltIndex: number
  ): void {
    const angle = elapsed * 0.014 + boltIndex * 0.7853981633974483;
    const reach = 12 + (boltIndex % 3) * 4 + Math.sin(elapsed * 0.03 + boltIndex) * 3;
    const segments = 5;

    // Jagged path from core outward.
    const points: Array<{ x: number; y: number }> = [];
    for (let step = 0; step <= segments; step++) {
      const t = step / segments;
      const radius = 5 + reach * t;
      const wobble = step === 0 || step === segments ? 0 : Phaser.Math.Between(-6, 6);
      const spread = 0.35 * t;
      const localAngle = angle + Phaser.Math.FloatBetween(-spread, spread);
      points.push({
        x: originX + Math.cos(localAngle) * radius + wobble,
        y: originY + Math.sin(localAngle) * radius + wobble
      });
    }

    // Outer glow pass, then bright core pass.
    graphics.lineStyle(4, 0x3a86ff, 0.28);
    this.strokePolyline(graphics, points);
    graphics.lineStyle(1.5, boltIndex % 2 === 0 ? 0xecffff : 0x9fd8ff, 0.9);
    this.strokePolyline(graphics, points);
  }

  private strokePolyline(graphics: Phaser.GameObjects.Graphics, points: ReadonlyArray<{ x: number; y: number }>): void {
    if (points.length < 2) {
      return;
    }

    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
      graphics.lineTo(points[index].x, points[index].y);
    }

    graphics.strokePath();
  }

  private ensureWeaponTextures(): void {
    if (!this.scene.textures.exists(WEAPON_TEXTURES.ray)) {
      const rayGraphics = this.scene.add.graphics();
      rayGraphics.clear();
      rayGraphics.fillStyle(0x2553ff, 0.3);
      rayGraphics.fillCircle(12, 12, 11);
      rayGraphics.fillStyle(0x7ad9ff, 0.8);
      rayGraphics.fillCircle(12, 12, 7);
      rayGraphics.fillStyle(0xf6ffff, 1);
      rayGraphics.fillCircle(12, 12, 3.5);
      rayGraphics.generateTexture(WEAPON_TEXTURES.ray, 24, 24);
      rayGraphics.destroy();
    }

    if (!this.scene.textures.exists(WEAPON_TEXTURES.sphere)) {
      const sphereGraphics = this.scene.add.graphics();
      sphereGraphics.clear();
      sphereGraphics.fillStyle(0x1346ff, 0.22);
      sphereGraphics.fillCircle(24, 24, 22);
      sphereGraphics.fillStyle(0x2d77ff, 0.6);
      sphereGraphics.fillCircle(24, 24, 16);
      sphereGraphics.fillStyle(0x87ddff, 0.92);
      sphereGraphics.fillCircle(24, 24, 9);
      sphereGraphics.fillStyle(0xffffff, 1);
      sphereGraphics.fillCircle(24, 24, 4);
      sphereGraphics.lineStyle(2, 0xd9f7ff, 0.55);
      sphereGraphics.strokeCircle(24, 24, 18);
      sphereGraphics.generateTexture(WEAPON_TEXTURES.sphere, 48, 48);
      sphereGraphics.destroy();
    }

    if (!this.scene.textures.exists(WEAPON_TEXTURES.spark)) {
      const sparkGraphics = this.scene.add.graphics();
      sparkGraphics.clear();
      sparkGraphics.fillStyle(0x8be6ff, 0.8);
      sparkGraphics.fillCircle(5, 5, 4);
      sparkGraphics.fillStyle(0xffffff, 1);
      sparkGraphics.fillCircle(5, 5, 1.6);
      sparkGraphics.generateTexture(WEAPON_TEXTURES.spark, 10, 10);
      sparkGraphics.destroy();
    }
  }
}
