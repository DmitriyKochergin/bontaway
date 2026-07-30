import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { type AudioSystem } from "./AudioSystem";
import { type DungeonSystem } from "./DungeonSystem";
import { type FieldOfViewSystem } from "./FieldOfViewSystem";

type ProjectileKind = "ray" | "sphere";
type ExplosionTier = "small" | "large" | "huge";

interface ProjectileState {
  readonly kind: ProjectileKind;
  readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  readonly light: Phaser.GameObjects.Light;
  readonly particles: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly collisionRadius: number;
  cleanup: () => void;
  lightningGraphics?: Phaser.GameObjects.Graphics;
  isCleanedUp: boolean;
}

interface ExplosionProfile {
  readonly lightRadius: number;
  readonly maxRadius: number;
  readonly intensity: number;
  readonly duration: number;
  readonly particleSpeedMin: number;
  readonly particleSpeedMax: number;
  readonly particleLifespanMin: number;
  readonly particleLifespanMax: number;
  readonly particleCount: number;
  readonly coreColor: number;
  readonly ringColor: number;
}

const WEAPON_TEXTURES = {
  ray: "weapon-blue-ray",
  sphere: "weapon-blue-sphere",
  spark: "weapon-blue-spark"
} as const;

const EXPLOSION_PROFILES: Record<ExplosionTier, ExplosionProfile> = {
  small: {
    lightRadius: 90,
    maxRadius: 58,
    intensity: 6,
    duration: 420,
    particleSpeedMin: 40,
    particleSpeedMax: 130,
    particleLifespanMin: 220,
    particleLifespanMax: 360,
    particleCount: 14,
    coreColor: 0xeaf9ff,
    ringColor: 0x84cfff
  },
  large: {
    lightRadius: 180,
    maxRadius: 108,
    intensity: 8,
    duration: 650,
    particleSpeedMin: 60,
    particleSpeedMax: 180,
    particleLifespanMin: 320,
    particleLifespanMax: 520,
    particleCount: 24,
    coreColor: 0xf6ffff,
    ringColor: 0x66bfff
  },
  huge: {
    lightRadius: 320,
    maxRadius: 168,
    intensity: 12,
    duration: 980,
    particleSpeedMin: 90,
    particleSpeedMax: 260,
    particleLifespanMin: 420,
    particleLifespanMax: 780,
    particleCount: 40,
    coreColor: 0xffffff,
    ringColor: 0x9ce8ff
  }
};

export class WeaponSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly dungeonSystem: DungeonSystem;
  private readonly fovSystem: FieldOfViewSystem;
  private readonly audioSystem?: AudioSystem;
  private readonly activeCleanups = new Set<() => void>();
  private readonly activeRays = new Set<ProjectileState>();
  private readonly activeSpheres = new Set<ProjectileState>();
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
    this.activeRays.clear();
    this.activeSpheres.clear();
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

      try {
        this.scene.lights.removeLight(spellLight);
      } catch {
        // Safe guard.
      }

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

      try {
        projectile.destroy();
      } catch {
        // Safe guard.
      }

      this.scene.events.off("update", updateListener);
    };

    this.activeCleanups.add(cleanUp);

    this.scene.physics.add.collider(projectile, this.dungeonSystem.getPhysicsWalls(), () => {
      this.audioSystem?.playFireballHit(0.55);
      this.createFireballExplosion(projectile.x, projectile.y);
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

  public castRay(targetX: number, targetY: number): void {
    this.castProjectile("ray", targetX, targetY);
  }

  public castSphere(targetX: number, targetY: number): void {
    this.castProjectile("sphere", targetX, targetY);
  }

  private castProjectile(kind: ProjectileKind, targetX: number, targetY: number): void {
    if (this.isDestroyed) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, targetX, targetY);
    if (distance < 4) {
      return;
    }

    const textureKey = kind === "ray" ? WEAPON_TEXTURES.ray : WEAPON_TEXTURES.sphere;
    const explosionTier = kind === "ray" ? "small" : "large";
    const speed = kind === "ray" ? 980 : 280;

    this.audioSystem?.playFireballCast(kind === "ray" ? 0.35 : 0.55);

    const projectile = this.scene.physics.add.sprite(this.player.x, this.player.y, textureKey);
    projectile.setPipeline("Light2D");
    projectile.setDepth(kind === "ray" ? 255 : 253);
    projectile.setCollideWorldBounds(false);
    projectile.setAlpha(kind === "ray" ? 0.98 : 0.94);

    this.fovSystem.addProjectile(projectile);

    const light = this.scene.lights.addLight(
      projectile.x,
      projectile.y,
      kind === "ray" ? 120 : 190,
      kind === "ray" ? 0x93dfff : 0x5eb7ff,
      kind === "ray" ? 3.4 : 5.2
    );

    const particles = this.scene.add.particles(0, 0, WEAPON_TEXTURES.spark, {
      speed: kind === "ray" ? { min: 25, max: 90 } : { min: 45, max: 165 },
      angle: kind === "ray" ? undefined : { min: 0, max: 360 },
      scale: kind === "ray" ? { start: 0.35, end: 0 } : { start: 0.6, end: 0 },
      alpha: { start: kind === "ray" ? 0.75 : 0.95, end: 0 },
      lifespan: kind === "ray" ? { min: 100, max: 160 } : { min: 120, max: 320 },
      quantity: kind === "ray" ? 1 : 4,
      frequency: kind === "ray" ? -1 : 20,
      rotate: kind === "ray" ? undefined : { min: 0, max: 360 },
      emitting: kind === "ray",
      blendMode: "ADD"
    });
    particles.setDepth(kind === "ray" ? 246 : 248);
    particles.startFollow(projectile);

    this.scene.physics.moveTo(projectile, targetX, targetY, speed);

    const state: ProjectileState = {
      kind,
      sprite: projectile,
      light,
      particles,
      collisionRadius: kind === "ray" ? 12 : 26,
      cleanup: () => undefined,
      isCleanedUp: false
    };

    if (kind === "sphere") {
      state.lightningGraphics = this.scene.add.graphics();
      state.lightningGraphics.setDepth(249);
      state.lightningGraphics.setBlendMode(Phaser.BlendModes.ADD);
    }

    let elapsed = 0;
    let particleDestroyTimer: Phaser.Time.TimerEvent | undefined;
    let updateListener: (_time: number, delta: number) => void = () => undefined;

    const destroyParticles = () => {
      try {
        particles.destroy();
      } catch {
        // Safe guard.
      }
    };

    const cleanUp = () => {
      if (state.isCleanedUp) {
        return;
      }

      state.isCleanedUp = true;
      this.activeCleanups.delete(cleanUp);
      this.activeRays.delete(state);
      this.activeSpheres.delete(state);
      this.fovSystem.removeProjectile(projectile);

      try {
        this.scene.lights.removeLight(light);
      } catch {
        // Safe guard.
      }

      try {
        particles.stop();
        particles.stopFollow();
      } catch {
        // Safe guard in case particles or scene were already destroyed.
      }

      state.lightningGraphics?.destroy();

      if (this.isDestroyed) {
        particleDestroyTimer?.remove(false);
        destroyParticles();
      } else {
        const particleCleanupDelay = kind === "ray" ? 240 : 360;
        particleDestroyTimer = this.scene.time.delayedCall(particleCleanupDelay, () => {
          destroyParticles();
        });
      }

      try {
        projectile.destroy();
      } catch {
        // Safe guard.
      }

      this.scene.events.off("update", updateListener);
    };

    state.cleanup = cleanUp;
    this.activeCleanups.add(cleanUp);

    if (kind === "ray") {
      this.activeRays.add(state);
    } else {
      this.activeSpheres.add(state);
    }

    this.scene.physics.add.collider(projectile, this.dungeonSystem.getPhysicsWalls(), () => {
      if (state.isCleanedUp) {
        return;
      }

      this.audioSystem?.playFireballHit(kind === "ray" ? 0.4 : 0.65);
      this.createExplosion(projectile.x, projectile.y, explosionTier);
      cleanUp();
    });

    updateListener = (_time: number, delta: number) => {
      if (this.scene.scene.isPaused()) {
        return;
      }

      if (!projectile.active || !projectile.body) {
        cleanUp();
        return;
      }

      elapsed += delta;
      light.x = projectile.x;
      light.y = projectile.y;

      if (kind === "ray") {
        this.resolveRaySphereImpact(state);
        return;
      }

      this.updateSphereEffects(state, elapsed);
    };

    this.scene.events.on("update", updateListener);

    const lifetime = kind === "ray" ? 5200 : 7000;
    this.scene.time.delayedCall(lifetime, () => {
      cleanUp();
    });
  }

  private resolveRaySphereImpact(rayState: ProjectileState): void {
    if (rayState.isCleanedUp) {
      return;
    }

    for (const sphereState of [...this.activeSpheres]) {
      if (sphereState.isCleanedUp || !sphereState.sprite.active) {
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

      this.audioSystem?.playFireballHit(0.85);
      this.createExplosion(
        (rayState.sprite.x + sphereState.sprite.x) * 0.5,
        (rayState.sprite.y + sphereState.sprite.y) * 0.5,
        "huge"
      );

      rayState.cleanup();
      sphereState.cleanup();
      return;
    }
  }

  private updateSphereEffects(state: ProjectileState, elapsed: number): void {
    const graphics = state.lightningGraphics;
    if (!graphics) {
      return;
    }

    const pulse = 0.5 + Math.sin(elapsed * 0.007) * 0.5;
    const flicker = 0.5 + Math.sin(elapsed * 0.035) * 0.5;
    state.light.radius = 170 + pulse * 45;
    state.light.intensity = 4.8 + pulse * 1.4 + flicker * 0.8;

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

  private strokePolyline(
    graphics: Phaser.GameObjects.Graphics,
    points: ReadonlyArray<{ x: number; y: number }>
  ): void {
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

  private createExplosion(x: number, y: number, tier: ExplosionTier): void {
    if (this.isDestroyed) {
      return;
    }

    const profile = EXPLOSION_PROFILES[tier];
    const explosionLight = this.scene.lights.addLight(x, y, profile.lightRadius, 0x8fdcff, profile.intensity);
    const explosionObj = { x, y, radius: profile.maxRadius };
    this.fovSystem.addExplosion(explosionObj);

    const flash = this.scene.add.circle(x, y, profile.maxRadius * 0.18, profile.coreColor, 0.95);
    flash.setDepth(260);
    flash.setBlendMode(Phaser.BlendModes.ADD);

    const ring = this.scene.add.circle(x, y, profile.maxRadius * 0.45, profile.ringColor, 0.35);
    ring.setDepth(259);
    ring.setBlendMode(Phaser.BlendModes.ADD);

    const particles = this.scene.add.particles(x, y, WEAPON_TEXTURES.spark, {
      speed: { min: profile.particleSpeedMin, max: profile.particleSpeedMax },
      angle: { min: 0, max: 360 },
      scale: { start: tier === "huge" ? 1.9 : tier === "large" ? 1.6 : 1.2, end: 0 },
      alpha: { start: 0.95, end: 0 },
      blendMode: "ADD",
      lifespan: { min: profile.particleLifespanMin, max: profile.particleLifespanMax },
      maxParticles: profile.particleCount
    });
    particles.setDepth(261);

    const particleDestroyTimer = this.scene.time.delayedCall(profile.duration + 260, () => {
      destroyParticles();
    });

    let elapsed = 0;
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

      try {
        this.scene.lights.removeLight(explosionLight);
      } catch {
        // Safe guard.
      }

      this.scene.events.off("update", updateLight);
      this.fovSystem.removeExplosion(explosionObj);

      flash.destroy();
      ring.destroy();

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
      const progress = Math.min(elapsed / profile.duration, 1);

      explosionLight.radius = profile.lightRadius + progress * profile.maxRadius * 2.15;
      explosionLight.intensity = profile.intensity * (1 - progress);
      explosionObj.radius = explosionLight.radius;

      flash.setScale(1 + progress * 2.5);
      flash.setAlpha(Math.max(0, 0.95 * (1 - progress * 1.3)));
      ring.setScale(1 + progress * 3.2);
      ring.setAlpha(Math.max(0, 0.35 * (1 - progress)));

      if (progress >= 1) {
        cleanUp();
      }
    };

    this.scene.events.on("update", updateLight);
  }

  private createFireballExplosion(x: number, y: number): void {
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

      try {
        this.scene.lights.removeLight(explosionLight);
      } catch {
        // Safe guard.
      }

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
