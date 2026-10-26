import Phaser from "phaser";
import { getLevelDefinition } from "../levels";
import { DepthLayer } from "../types/depth-layer";
import { DungeonSystem } from "./DungeonSystem";
import { FieldOfViewSystem } from "./FieldOfViewSystem";

export class TorchManager {
  private readonly torchLights: Phaser.GameObjects.Light[] = [];
  private readonly torchFx: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly dungeonSystem: DungeonSystem,
    private readonly fovSystem: FieldOfViewSystem,
    private readonly levelId: string
  ) {}

  public spawn(): void {
    const levelDef = getLevelDefinition(this.levelId);
    if (!levelDef?.torches?.length) {
      return;
    }

    const tileSize = this.dungeonSystem.getTileSize();
    const defaultLightRadius = 150;
    const baseFireRadius = 12;
    const defaultFireRadius = 15;

    for (const torch of levelDef.torches) {
      const worldX = torch.tileX * tileSize;
      const worldY = torch.tileY * tileSize;
      const lightRadius = torch.lightRadius ?? defaultLightRadius;
      const fireRadius = torch.radius ?? defaultFireRadius;
      const scaleRatio = fireRadius / baseFireRadius;

      const fovMask = this.fovSystem.getNpcVisibilityMask();

      // Iron sconce base seen from above. Drawn dark so the fire on top reads as the light source.
      const torchSprite = this.scene.add.image(worldX, worldY, "torch");
      torchSprite.setDepth(DepthLayer.TorchBase);
      torchSprite.setMask(fovMask);
      this.torchFx.push(torchSprite);

      // Flickering hot core sitting in the sconce. ADD blend makes it glow like a live coal bed.
      const flameCore = this.scene.add.image(worldX, worldY, "torch");
      flameCore.setDepth(DepthLayer.TorchCore);
      flameCore.setScale(0.6 * scaleRatio);
      flameCore.setTint(0xffc04d);
      flameCore.setBlendMode(Phaser.BlendModes.ADD);
      flameCore.setMask(fovMask);
      this.torchFx.push(flameCore);
      this.scene.tweens.add({
        targets: flameCore,
        scale: Phaser.Math.FloatBetween(0.78 * scaleRatio, 0.95 * scaleRatio),
        alpha: { from: 0.85, to: 1 },
        duration: Phaser.Math.Between(90, 180),
        delay: Phaser.Math.Between(0, 260),
        yoyo: true,
        repeat: -1,
        repeatDelay: Phaser.Math.Between(40, 200),
        ease: "Sine.inOut"
      });

      // Body of the flame seen from directly above: soft particles flare outward in every direction
      // from the hot core, tinted hot-to-cool as they spread and shrink. No vertical bias — a top-down
      // fire radiates, it does not rise, so the perspective stays flat.
      const flame = this.scene.add.particles(worldX, worldY, "fireball", {
        speed: { min: 8 * scaleRatio, max: 26 * scaleRatio },
        angle: { min: 0, max: 360 },
        scale: { start: 0.55 * scaleRatio, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: { min: 260, max: 520 },
        frequency: 45,
        quantity: 2,
        tint: [0xfff2b2, 0xffad00, 0xe65c00, 0xc21f00],
        blendMode: "ADD",
        emitZone: {
          type: "random",
          source: new Phaser.Geom.Circle(0, 0, Math.max(1, 2 * scaleRatio)),
          quantity: 1
        }
      });
      flame.setDepth(DepthLayer.TorchFlame);
      flame.setMask(fovMask);
      this.torchFx.push(flame);

      // Sparse embers that shoot outward and wink out — "real fire sparks" scattering across the floor.
      const embers = this.scene.add.particles(worldX, worldY, "fireball", {
        speed: { min: 30 * scaleRatio, max: 70 * scaleRatio },
        angle: { min: 0, max: 360 },
        scale: { start: 0.16 * scaleRatio, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 400, max: 800 },
        frequency: Phaser.Math.Between(140, 240),
        quantity: 1,
        tint: [0xffe08a, 0xff8a2b],
        blendMode: "ADD"
      });
      embers.setDepth(DepthLayer.TorchEmbers);
      embers.setMask(fovMask);
      this.torchFx.push(embers);

      // Warm glow on nearby Light2D surfaces. Phaser lights render regardless of the player's view
      // radius, matching the fog reveal registered below.
      const torchLight = this.scene.lights.addLight(worldX, worldY, lightRadius * 2, 0xff8844, 1.35);
      this.torchLights.push(torchLight);
      this.fovSystem.addTorch(torchLight, lightRadius);

      // Independent flicker. Each flame gets its own beat so the room stops breathing in sync.
      this.scene.tweens.add({
        targets: torchLight,
        intensity: Phaser.Math.FloatBetween(1.8, 2.35),
        duration: Phaser.Math.Between(120, 260),
        delay: Phaser.Math.Between(120, 420),
        yoyo: true,
        repeat: -1,
        repeatDelay: Phaser.Math.Between(100, 1520),
        ease: "Sine.inOut"
      });
    }
  }

  public destroy(): void {
    this.torchLights.forEach(light => this.fovSystem.removeTorch(light));
    this.torchLights.forEach(light => this.scene.lights.removeLight(light));
    this.torchLights.length = 0;
    this.torchFx.forEach(fx => fx.destroy());
    this.torchFx.length = 0;
  }

  public getLightCount(): number {
    return this.torchLights.length;
  }
}
