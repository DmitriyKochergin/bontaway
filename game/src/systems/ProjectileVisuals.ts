import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
import { type FieldOfViewSystem } from "./FieldOfViewSystem";

export type ProjectileVisualKind = "fireball" | "ray" | "sphere";
export type ProjectileImpactKind = "fireball" | "small" | "large" | "huge";

interface ProjectileVisualConfig {
  readonly particleTexture: string;
  readonly particleDepth: DepthLayer;
  readonly particleConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  readonly lightRadius: number;
  readonly lightColor: number;
  readonly lightIntensity: number;
  readonly particleDestroyDelayMs: number;
}

const PROJECTILE_VISUALS: Record<ProjectileVisualKind, ProjectileVisualConfig> = {
  fireball: {
    particleTexture: "fireball",
    particleDepth: DepthLayer.FireballTrail,
    particleConfig: {
      speed: 20,
      scale: { start: 1, end: 0 },
      blendMode: "ADD",
      lifespan: 300
    },
    lightRadius: 150,
    lightColor: 0xff5500,
    lightIntensity: 3,
    particleDestroyDelayMs: 500
  },
  ray: {
    particleTexture: "weapon-blue-spark",
    particleDepth: DepthLayer.RayTrail,
    particleConfig: {
      speed: { min: 25, max: 90 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.75, end: 0 },
      lifespan: { min: 100, max: 160 },
      quantity: 1,
      frequency: -1,
      emitting: true,
      blendMode: "ADD"
    },
    lightRadius: 120,
    lightColor: 0x93dfff,
    lightIntensity: 3.4,
    particleDestroyDelayMs: 240
  },
  sphere: {
    particleTexture: "weapon-blue-spark",
    particleDepth: DepthLayer.SphereTrail,
    particleConfig: {
      speed: { min: 45, max: 165 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 120, max: 320 },
      quantity: 4,
      frequency: 20,
      rotate: { min: 0, max: 360 },
      emitting: false,
      blendMode: "ADD"
    },
    lightRadius: 190,
    lightColor: 0x5eb7ff,
    lightIntensity: 5.2,
    particleDestroyDelayMs: 360
  }
};

interface ProjectileImpactConfig {
  readonly lightRadius: number;
  readonly maxRadius: number;
  readonly animationStartRadius: number;
  readonly animationRadiusGrowth: number;
  readonly intensity: number;
  readonly lightColor: number;
  readonly duration: number;
  readonly particleTexture: string;
  readonly particleSpeedMin: number;
  readonly particleSpeedMax: number;
  readonly particleLifespanMin: number;
  readonly particleLifespanMax: number;
  readonly particleCount: number;
  readonly particleScaleStart: number;
  readonly particleAlpha?: { readonly start: number; readonly end: number };
  readonly particleDestroyDelayMs: number;
  readonly particleDepth: DepthLayer;
  readonly flashColor?: number;
  readonly flashDepth?: DepthLayer;
  readonly ringColor?: number;
  readonly ringDepth?: DepthLayer;
  readonly flashScale?: number;
  readonly ringScale?: number;
}

const IMPACT_VISUALS: Record<ProjectileImpactKind, ProjectileImpactConfig> = {
  fireball: {
    lightRadius: 50,
    maxRadius: 50,
    animationStartRadius: 150,
    animationRadiusGrowth: 250,
    intensity: 10,
    lightColor: 0xff5500,
    duration: 1000,
    particleTexture: "fireball",
    particleSpeedMin: 30,
    particleSpeedMax: 120,
    particleLifespanMin: 600,
    particleLifespanMax: 700,
    particleCount: 25,
    particleScaleStart: 2,
    particleDestroyDelayMs: 1200,
    particleDepth: DepthLayer.ExplosionFlash
  },
  small: {
    lightRadius: 90,
    maxRadius: 58,
    animationStartRadius: 90,
    animationRadiusGrowth: 124.7,
    intensity: 6,
    lightColor: 0x8fdcff,
    duration: 420,
    particleTexture: "weapon-blue-spark",
    particleSpeedMin: 40,
    particleSpeedMax: 130,
    particleLifespanMin: 220,
    particleLifespanMax: 360,
    particleCount: 14,
    particleScaleStart: 1.2,
    particleAlpha: { start: 0.95, end: 0 },
    particleDestroyDelayMs: 680,
    particleDepth: DepthLayer.ExplosionParticles,
    flashColor: 0xeaf9ff,
    flashDepth: DepthLayer.ExplosionFlash,
    ringDepth: DepthLayer.ExplosionRing,
    ringColor: 0x84cfff,
    flashScale: 2.5,
    ringScale: 3.2
  },
  large: {
    lightRadius: 180,
    maxRadius: 108,
    animationStartRadius: 180,
    animationRadiusGrowth: 232.2,
    intensity: 8,
    lightColor: 0x8fdcff,
    duration: 650,
    particleTexture: "weapon-blue-spark",
    particleSpeedMin: 60,
    particleSpeedMax: 180,
    particleLifespanMin: 320,
    particleLifespanMax: 520,
    particleCount: 24,
    particleScaleStart: 1.6,
    particleAlpha: { start: 0.95, end: 0 },
    particleDestroyDelayMs: 910,
    particleDepth: DepthLayer.ExplosionParticles,
    flashColor: 0xf6ffff,
    flashDepth: DepthLayer.ExplosionFlash,
    ringDepth: DepthLayer.ExplosionRing,
    ringColor: 0x66bfff,
    flashScale: 2.5,
    ringScale: 3.2
  },
  huge: {
    lightRadius: 320,
    maxRadius: 168,
    animationStartRadius: 320,
    animationRadiusGrowth: 361.2,
    intensity: 12,
    lightColor: 0x8fdcff,
    duration: 980,
    particleTexture: "weapon-blue-spark",
    particleSpeedMin: 90,
    particleSpeedMax: 260,
    particleLifespanMin: 420,
    particleLifespanMax: 780,
    particleCount: 40,
    particleScaleStart: 1.9,
    particleAlpha: { start: 0.95, end: 0 },
    particleDestroyDelayMs: 1240,
    particleDepth: DepthLayer.ExplosionParticles,
    flashColor: 0xffffff,
    flashDepth: DepthLayer.ExplosionFlash,
    ringDepth: DepthLayer.ExplosionRing,
    ringColor: 0x9ce8ff,
    flashScale: 2.5,
    ringScale: 3.2
  }
};

export interface ProjectileVisualBundle {
  readonly light?: Phaser.GameObjects.Light;
  readonly particles: ReturnType<Phaser.Scene["add"]["particles"]>;
  syncLight(): void;
  cleanup(forceImmediate?: boolean): void;
}

export interface ProjectileImpactVisualBundle {
  update(delta: number): boolean;
  cleanup(forceImmediate?: boolean): void;
}

/**
 * Shared weapon FX bundle. Both local and remote projectiles reuse this so the trail, light,
 * and teardown timing stay identical across every weapon kind.
 */
export function createProjectileVisuals(
  scene: Phaser.Scene,
  projectile: Phaser.Physics.Arcade.Sprite,
  kind: ProjectileVisualKind
): ProjectileVisualBundle {
  const config = PROJECTILE_VISUALS[kind];

  const light = scene.lights
    ? scene.lights.addLight(projectile.x, projectile.y, config.lightRadius, config.lightColor, config.lightIntensity)
    : undefined;

  const particles = scene.add.particles(0, 0, config.particleTexture, config.particleConfig);
  particles.setDepth(config.particleDepth);
  particles.startFollow(projectile);

  let isCleanedUp = false;
  let particleDestroyTimer: Phaser.Time.TimerEvent | undefined;

  const destroyParticles = () => {
    try {
      particles.destroy();
    } catch {
      // Scene or particle manager may already be gone during shutdown.
    }
  };

  const syncLight = () => {
    if (!light) {
      return;
    }

    light.x = projectile.x;
    light.y = projectile.y;
  };

  const cleanup = (forceImmediate = false) => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;

    if (light && scene.lights) {
      try {
        scene.lights.removeLight(light);
      } catch {
        // Scene lights may already be gone during shutdown.
      }
    }

    try {
      particles.stop();
      particles.stopFollow();
    } catch {
      // Safe guard in case particles or scene were already destroyed.
    }

    if (!forceImmediate) {
      particleDestroyTimer = scene.time.delayedCall(config.particleDestroyDelayMs, () => {
        destroyParticles();
      });
      return;
    }

    particleDestroyTimer?.remove(false);
    destroyParticles();
  };

  return {
    light,
    particles,
    syncLight,
    cleanup
  };
}

/** Shared impact burst for local and remote weapons. */
export function createProjectileImpactVisuals(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: ProjectileImpactKind,
  fovSystem: FieldOfViewSystem
): ProjectileImpactVisualBundle {
  const profile = IMPACT_VISUALS[kind];
  const explosionLight = scene.lights.addLight(x, y, profile.lightRadius, profile.lightColor, profile.intensity);
  const explosionObj = { x, y, radius: profile.maxRadius };
  fovSystem.addExplosion(explosionObj);

  const flash =
    profile.flashColor === undefined
      ? undefined
      : scene.add.circle(x, y, profile.maxRadius * 0.18, profile.flashColor, 0.95);
  flash?.setDepth(profile.flashDepth ?? DepthLayer.ExplosionFlash);
  flash?.setBlendMode(Phaser.BlendModes.ADD);

  const ring = profile.ringColor
    ? scene.add.circle(x, y, profile.maxRadius * 0.45, profile.ringColor, 0.35)
    : undefined;
  ring?.setDepth(profile.ringDepth ?? DepthLayer.ExplosionRing);
  ring?.setBlendMode(Phaser.BlendModes.ADD);

  const particleConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    speed: { min: profile.particleSpeedMin, max: profile.particleSpeedMax },
    angle: { min: 0, max: 360 },
    scale: { start: profile.particleScaleStart, end: 0 },
    blendMode: "ADD",
    lifespan: { min: profile.particleLifespanMin, max: profile.particleLifespanMax },
    maxParticles: profile.particleCount
  };
  if (profile.particleAlpha) {
    particleConfig.alpha = profile.particleAlpha;
  }

  const particles = scene.add.particles(x, y, profile.particleTexture, particleConfig);
  particles.setDepth(profile.particleDepth);

  let elapsed = 0;
  let isCleanedUp = false;
  const particleDestroyTimer = scene.time.delayedCall(profile.particleDestroyDelayMs, () => {
    destroyParticles();
  });

  const destroyParticles = () => {
    try {
      particles.destroy();
    } catch {
      // Safe guard.
    }
  };

  const cleanUp = (forceImmediate = false) => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;

    try {
      scene.lights.removeLight(explosionLight);
    } catch {
      // Safe guard.
    }

    fovSystem.removeExplosion(explosionObj);

    flash?.destroy();
    ring?.destroy();

    if (forceImmediate) {
      particleDestroyTimer.remove(false);
      destroyParticles();
    }
  };

  const update = (delta: number): boolean => {
    if (isCleanedUp) {
      return false;
    }

    elapsed += delta;
    const progress = Math.min(elapsed / profile.duration, 1);

    explosionLight.radius = profile.animationStartRadius + progress * profile.animationRadiusGrowth;
    explosionLight.intensity = profile.intensity * (1 - progress);
    explosionObj.radius = explosionLight.radius;

    flash?.setScale(1 + progress * (profile.flashScale ?? 0));
    flash?.setAlpha(Math.max(0, 0.95 * (1 - progress * 1.3)));
    if (ring) {
      ring.setScale(1 + progress * (profile.ringScale ?? 0));
      ring.setAlpha(Math.max(0, 0.35 * (1 - progress)));
    }

    if (progress >= 1) {
      cleanUp();
      return false;
    }

    return true;
  };

  return {
    update,
    cleanup: cleanUp
  };
}
