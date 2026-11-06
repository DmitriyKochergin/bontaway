import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
import type { ProjectileImpactVisualBundle } from "./ProjectileVisuals";
import type { WeaponKind } from "./WeaponSystem";

const RIPPLE_DURATION_MS = 1050;
const MAX_RIPPLE_EXPLOSION_DAMAGE = 64;
const MIN_RIPPLE_INTENSITY = 0.65;
const MAX_RIPPLE_INTENSITY = 1.35;
const WAVE_FRONT_COUNT = 3;
const WAVE_FRONT_DELAY = 0.13;
const WAVE_TRAIL_ANGLE = Math.PI * 0.24;
const WAVE_TRAVEL_ANGLE = Math.PI * 0.78;
const CONTOUR_FRAGMENT_COUNT = 7;
const CONTOUR_FRAGMENT_LENGTHS = [0.15, 0.24, 0.18, 0.29, 0.2, 0.26, 0.17];

interface RipplePalette {
  readonly color: number;
  readonly coreColor: number;
}

const RIPPLE_PALETTES: Record<WeaponKind, RipplePalette> = {
  fireball: { color: 0xff7138, coreColor: 0xfff1d6 },
  ray: { color: 0x69c7ff, coreColor: 0xeafaff },
  icicle: { color: 0x8fe8ff, coreColor: 0xf2ffff },
  sphere: { color: 0x4e8dff, coreColor: 0xd9f7ff }
};

/**
 * A force-shell response that starts at the impact point and travels around the sphere surface.
 * The broken contour and short-lived bloom make the otherwise invisible shield readable without
 * turning it into a permanent outline.
 */
export function createForceShieldRipple(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  shieldRadius: number,
  impactAngle: number,
  weaponKind: WeaponKind,
  explosionDamage: number
): ProjectileImpactVisualBundle {
  const graphics = scene.add.graphics();
  graphics.setDepth(DepthLayer.ForceShieldRipple);
  graphics.setBlendMode(Phaser.BlendModes.ADD);

  const palette = RIPPLE_PALETTES[weaponKind];
  const damageProgress = Phaser.Math.Clamp(explosionDamage / MAX_RIPPLE_EXPLOSION_DAMAGE, 0, 1);
  const rippleIntensity = Phaser.Math.Linear(MIN_RIPPLE_INTENSITY, MAX_RIPPLE_INTENSITY, damageProgress);

  let elapsed = 0;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) {
      return;
    }

    isCleanedUp = true;
    graphics.destroy();
  };

  const clampProgress = (value: number) => Math.max(0, Math.min(value, 1));
  const easeOutCubic = (value: number) => 1 - (1 - clampProgress(value)) ** 3;

  const drawShieldArc = (startAngle: number, endAngle: number, lineWidth: number, color: number, alpha: number) => {
    if (alpha <= 0) {
      return;
    }

    graphics.lineStyle(lineWidth, color, alpha);
    graphics.beginPath();
    graphics.arc(centerX, centerY, shieldRadius, startAngle, endAngle);
    graphics.strokePath();
  };

  const drawGlowPoint = (x: number, y: number, radius: number, color: number, alpha: number) => {
    if (alpha <= 0) {
      return;
    }

    graphics.fillStyle(color, alpha * 0.2);
    graphics.fillCircle(x, y, radius * 2.6);
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(x, y, radius);
  };

  const update = (delta: number): boolean => {
    if (isCleanedUp) {
      return false;
    }

    elapsed += delta;
    const progress = Math.min(elapsed / RIPPLE_DURATION_MS, 1);
    const impactX = centerX + Math.cos(impactAngle) * shieldRadius;
    const impactY = centerY + Math.sin(impactAngle) * shieldRadius;

    graphics.clear();

    const shellPulse = clampProgress(1 - progress / 0.52);
    drawShieldArc(0, Math.PI * 2, 2.2, palette.color, 0.16 * shellPulse * rippleIntensity);
    drawShieldArc(0, Math.PI * 2, 0.9, palette.coreColor, 0.2 * shellPulse * shellPulse * rippleIntensity);

    const contourFade = clampProgress(1 - progress / 0.9) * 0.42;
    const contourRotation = impactAngle - progress * 0.55;
    const contourSpacing = (Math.PI * 2) / CONTOUR_FRAGMENT_COUNT;
    for (let fragmentIndex = 0; fragmentIndex < CONTOUR_FRAGMENT_COUNT; fragmentIndex++) {
      const fragmentStart = contourRotation + fragmentIndex * contourSpacing;
      const fragmentLength = CONTOUR_FRAGMENT_LENGTHS[fragmentIndex];
      const fragmentAlpha = contourFade * (fragmentIndex % 2 === 0 ? 1 : 0.65);
      drawShieldArc(fragmentStart, fragmentStart + fragmentLength, 1.1, palette.color, fragmentAlpha * rippleIntensity);
    }

    const bloomFade = clampProgress(1 - progress / 0.34);
    if (bloomFade > 0) {
      const bloomProgress = easeOutCubic(progress / 0.24);
      const bloomRadius = shieldRadius * (0.018 + bloomProgress * 0.06);
      drawGlowPoint(impactX, impactY, shieldRadius * 0.025, palette.coreColor, 0.75 * bloomFade * rippleIntensity);

      graphics.lineStyle(2.6, palette.coreColor, 0.85 * bloomFade * rippleIntensity);
      graphics.strokeCircle(impactX, impactY, bloomRadius);
      drawShieldArc(
        impactAngle - Math.PI * 0.13,
        impactAngle + Math.PI * 0.13,
        2.4,
        palette.coreColor,
        0.9 * bloomFade * rippleIntensity
      );
    }

    for (let waveIndex = 0; waveIndex < WAVE_FRONT_COUNT; waveIndex++) {
      const waveProgress = progress - waveIndex * WAVE_FRONT_DELAY;
      if (waveProgress <= 0 || waveProgress >= 1) {
        continue;
      }

      const travelledAngle = easeOutCubic(waveProgress) * WAVE_TRAVEL_ANGLE;
      const waveFade = clampProgress(1 - waveProgress);
      const waveAlpha = waveFade * (0.62 - waveIndex * 0.13) * rippleIntensity;
      const haloWidth = 4.8 - waveIndex * 0.8;
      const coreWidth = 1.4 - waveIndex * 0.15;

      for (const direction of [-1, 1]) {
        const frontAngle = impactAngle + direction * travelledAngle;
        const trailAngle = frontAngle - direction * WAVE_TRAIL_ANGLE;
        const arcStart = Math.min(frontAngle, trailAngle);
        const arcEnd = Math.max(frontAngle, trailAngle);

        drawShieldArc(arcStart, arcEnd, haloWidth, palette.color, waveAlpha * 0.45);
        drawShieldArc(arcStart, arcEnd, coreWidth, palette.coreColor, waveAlpha);

        const frontX = centerX + Math.cos(frontAngle) * shieldRadius;
        const frontY = centerY + Math.sin(frontAngle) * shieldRadius;
        drawGlowPoint(frontX, frontY, 1.8 - waveIndex * 0.25, palette.coreColor, waveAlpha);
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
