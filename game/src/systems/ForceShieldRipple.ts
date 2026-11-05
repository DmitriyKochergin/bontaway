import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
import type { ProjectileImpactVisualBundle } from "./ProjectileVisuals";

const RIPPLE_DURATION_MS = 950;
const RIPPLE_COLOR = 0x9fd8ff;
const WAVE_FRONT_COUNT = 3;
const WAVE_FRONT_DELAY = 0.16;
const WAVE_FRONT_ARC = Math.PI / 4;
const WAVE_TRAVEL_ANGLE = Math.PI / 6;

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

  let elapsed = 0;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;
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

      const travelledAngle = Math.min(waveProgress, 1) * WAVE_TRAVEL_ANGLE;
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

    if (progress >= 1) {
      cleanup();
      return false;
    }

    return true;
  };

  return { update, cleanup };
}
