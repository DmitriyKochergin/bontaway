import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
import type { ProjectileImpactVisualBundle } from "./ProjectileVisuals";

const RIPPLE_DURATION_MS = 950;
const RIPPLE_COLOR = 0x9fd8ff;
const RIPPLE_CORE_COLOR = 0xecffff;
const WAVE_FRONT_COUNT = 3;
const WAVE_FRONT_DELAY = 0.16;
const WAVE_FRONT_ARC = 0.32;

/**
 * Wave running across an otherwise invisible force sphere. Starts at the impact point and
 * travels around the sphere surface in both directions, fading before it reaches the far side.
 */
export function createForceShieldRipple(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  shieldRadius: number,
  impactAngle: number
): ProjectileImpactVisualBundle {
  const graphics = scene.add.graphics();
  graphics.setDepth(DepthLayer.ForceShieldRipple);
  graphics.setBlendMode(Phaser.BlendModes.ADD);

  const impactX = centerX + Math.cos(impactAngle) * shieldRadius;
  const impactY = centerY + Math.sin(impactAngle) * shieldRadius;
  const impactLight = scene.lights?.addLight(impactX, impactY, 70, RIPPLE_COLOR, 1.4);

  let elapsed = 0;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;
    if (impactLight && scene.lights) {
      try {
        scene.lights.removeLight(impactLight);
      } catch {
        // Scene lights may already be gone during shutdown.
      }
    }

    graphics.destroy();
  };

  const drawShieldArc = (startAngle: number, endAngle: number, lineWidth: number, color: number, alpha: number) => {
    if (alpha <= 0) {
      return;
    }

    graphics.lineStyle(lineWidth, color, alpha);
    graphics.beginPath();
    graphics.arc(centerX, centerY, shieldRadius, startAngle, endAngle);
    graphics.strokePath();
  };

  const update = (delta: number): boolean => {
    if (isCleanedUp) {
      return false;
    }

    elapsed += delta;
    const progress = Math.min(elapsed / RIPPLE_DURATION_MS, 1);
    const fade = 1 - progress;

    graphics.clear();

    // Whole sphere glimmers briefly so the shield silhouette is readable.
    drawShieldArc(0, Math.PI * 2, 1, RIPPLE_COLOR, 0.18 * fade * fade);

    for (let waveIndex = 0; waveIndex < WAVE_FRONT_COUNT; waveIndex++) {
      const waveProgress = progress - waveIndex * WAVE_FRONT_DELAY;
      if (waveProgress <= 0) {
        continue;
      }

      const travelledAngle = Math.min(waveProgress, 1) * Math.PI * 0.85;
      const waveAlpha = (1 - Math.min(waveProgress, 1)) * (0.75 - waveIndex * 0.2);
      const lineWidth = 3 - waveIndex * 0.8;

      // Two fronts racing around the sphere from the impact point, one per direction.
      for (const direction of [-1, 1]) {
        const frontAngle = impactAngle + direction * travelledAngle;
        const trailAngle = frontAngle - direction * WAVE_FRONT_ARC;
        drawShieldArc(
          Math.min(frontAngle, trailAngle),
          Math.max(frontAngle, trailAngle),
          lineWidth,
          RIPPLE_COLOR,
          waveAlpha
        );
      }
    }

    // Dent at the impact point, swelling and fading.
    const dentRadius = 3 + progress * 10;
    graphics.lineStyle(1.5, RIPPLE_CORE_COLOR, 0.8 * fade);
    graphics.strokeCircle(impactX, impactY, dentRadius);
    graphics.fillStyle(RIPPLE_CORE_COLOR, 0.5 * fade * fade);
    graphics.fillCircle(impactX, impactY, 3);

    if (impactLight) {
      impactLight.intensity = 1.4 * fade;
    }

    if (progress >= 1) {
      cleanup();
      return false;
    }

    return true;
  };

  return { update, cleanup };
}
