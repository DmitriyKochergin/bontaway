import Phaser from "phaser";

export type ProjectileVisualKind = "fireball" | "ray" | "sphere";

interface ProjectileVisualConfig {
  readonly particleTexture: string;
  readonly particleDepth: number;
  readonly particleConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  readonly lightRadius: number;
  readonly lightColor: number;
  readonly lightIntensity: number;
  readonly particleDestroyDelayMs: number;
}

const PROJECTILE_VISUALS: Record<ProjectileVisualKind, ProjectileVisualConfig> = {
  fireball: {
    particleTexture: "fireball",
    particleDepth: 240,
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
    particleDepth: 246,
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
    particleDepth: 248,
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

export interface ProjectileVisualBundle {
  readonly light?: Phaser.GameObjects.Light;
  readonly particles: ReturnType<Phaser.Scene["add"]["particles"]>;
  syncLight(): void;
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
