import Phaser from "phaser";
import { Player } from "../entities/Player";
import { type PhaserRaycasterPlugin, type Raycaster, type RaycasterRay } from "../phaser-raycaster";
import { type ActiveExplosion } from "./ProjectileSystem";

interface VisibilitySource {
  getActiveProjectiles(): Phaser.Physics.Arcade.Sprite[];
  getActiveExplosions(): ActiveExplosion[];
}

export class FieldOfViewSystem {
  private raycaster!: Raycaster;
  private fovRay!: RaycasterRay;
  private fovOverlay!: Phaser.GameObjects.Rectangle;
  private fovMaskTexture!: Phaser.Textures.CanvasTexture;
  private fovMaskImage!: Phaser.GameObjects.Image;
  private fovRefreshAccumulator = 0;
  private lastFovCenterX = Number.NaN;
  private lastFovCenterY = Number.NaN;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly raycasterPlugin: PhaserRaycasterPlugin,
    private readonly raycasterOccluders: Phaser.Physics.Arcade.Image[],
    private readonly visibilitySource: VisibilitySource,
    private readonly tileSize: number,
    private readonly fovRadiusTiles = 7.5,
    private readonly fovFadeTiles = 7.5,
    private readonly fovRefreshMs = 33
  ) {}

  create(): void {
    const mapWidth = this.scene.scale.width;
    const mapHeight = this.scene.scale.height;

    this.raycaster = this.raycasterPlugin.createRaycaster({
      boundingBox: new Phaser.Geom.Rectangle(0, 0, mapWidth, mapHeight),
      autoUpdate: false,
    });
    this.raycaster.mapGameObjects(this.raycasterOccluders, false);

    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    this.fovRay = this.raycaster.createRay({
      origin: { x: this.player.x, y: this.player.y },
      range: outerRadius,
      collisionRange: outerRadius,
      detectionRange: outerRadius,
      ignoreNotIntersectedRays: false,
    });

    this.fovOverlay = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0x000000, 1);
    this.fovOverlay.setOrigin(0, 0);
    this.fovOverlay.setScrollFactor(0);
    this.fovOverlay.setDepth(100);

    const maskTexture = this.scene.textures.createCanvas("fov-mask", this.scene.scale.width, this.scene.scale.height);
    if (!maskTexture) {
      throw new Error("Unable to create the field-of-view mask texture.");
    }

    this.fovMaskTexture = maskTexture;
    this.fovMaskImage = this.scene.add.image(0, 0, "fov-mask");
    this.fovMaskImage.setOrigin(0, 0);
    this.fovMaskImage.setScrollFactor(0);
    this.fovMaskImage.setVisible(false);

    this.fovOverlay.setMask(new Phaser.Display.Masks.BitmapMask(this.scene, this.fovMaskImage));
    this.redrawFovMask();
  }

  update(delta: number): void {
    if (!this.player || !this.player.body) {
      return;
    }

    this.fovRefreshAccumulator += delta;

    const camera = this.scene.cameras.main;
    const currentFovCenterX = this.player.x + this.player.fovOffsetX - camera.scrollX;
    const currentFovCenterY = this.player.y + this.player.fovOffsetY - camera.scrollY;
    const movedEnough =
      Math.abs(currentFovCenterX - this.lastFovCenterX) > 0.25 ||
      Math.abs(currentFovCenterY - this.lastFovCenterY) > 0.25 ||
      this.visibilitySource.getActiveProjectiles().length > 0 ||
      this.visibilitySource.getActiveExplosions().length > 0;

    if (!movedEnough && this.fovRefreshAccumulator < this.fovRefreshMs) {
      return;
    }

    this.fovRefreshAccumulator = 0;
    this.redrawFovMask();
  }

  destroy(): void {
    this.fovOverlay?.destroy();
    this.fovMaskImage?.destroy();
    this.fovMaskTexture?.destroy();
  }

  private redrawFovMask(): void {
    const context = this.fovMaskTexture.getContext();
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const camera = this.scene.cameras.main;
    const originX = this.player.x + this.player.fovOffsetX;
    const originY = this.player.y + this.player.fovOffsetY;
    const centerX = originX - camera.scrollX;
    const centerY = originY - camera.scrollY;
    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    const innerRadius = this.tileSize * this.fovRadiusTiles;

    this.fovRay.setRay(originX, originY, 0, outerRadius);
    this.raycaster.update();

    const intersections = this.fovRay.castCircle({ objects: this.raycasterOccluders });
    const visibilityPolygon = intersections
      .map((point: Phaser.Math.Vector2) => new Phaser.Math.Vector2(point.x - camera.scrollX, point.y - camera.scrollY))
      .sort(
        (left: Phaser.Math.Vector2, right: Phaser.Math.Vector2) =>
          Math.atan2(left.y - centerY, left.x - centerX) - Math.atan2(right.y - centerY, right.x - centerX)
      );

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(255, 255, 255, 1)";
    context.fillRect(0, 0, width, height);

    if (visibilityPolygon.length >= 3) {
      context.save();
      context.beginPath();
      context.moveTo(visibilityPolygon[0].x, visibilityPolygon[0].y);

      for (let i = 1; i < visibilityPolygon.length; i++) {
        context.lineTo(visibilityPolygon[i].x, visibilityPolygon[i].y);
      }

      context.closePath();
      context.clip();
      context.globalCompositeOperation = "destination-out";

      const radialGradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius);
      radialGradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      radialGradient.addColorStop(innerRadius / outerRadius, "rgba(0, 0, 0, 0.75)");
      radialGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      context.fillStyle = radialGradient;
      context.fillRect(0, 0, width, height);
      context.restore();
    }

    context.save();
    context.globalCompositeOperation = "destination-out";

    for (const projectile of this.visibilitySource.getActiveProjectiles()) {
      if (!projectile.active) {
        continue;
      }

      const projectileX = projectile.x - camera.scrollX;
      const projectileY = projectile.y - camera.scrollY;
      const radius = 150;
      const gradient = context.createRadialGradient(projectileX, projectileY, 0, projectileX, projectileY, radius);
      gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.7)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      context.fillStyle = gradient;
      context.beginPath();
      context.arc(projectileX, projectileY, radius, 0, Math.PI * 2);
      context.fill();
    }

    for (const explosion of this.visibilitySource.getActiveExplosions()) {
      const explosionX = explosion.x - camera.scrollX;
      const explosionY = explosion.y - camera.scrollY;
      const radius = explosion.radius;
      const gradient = context.createRadialGradient(explosionX, explosionY, 0, explosionX, explosionY, radius);
      gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.7)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      context.fillStyle = gradient;
      context.beginPath();
      context.arc(explosionX, explosionY, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();

    this.lastFovCenterX = centerX;
    this.lastFovCenterY = centerY;
    this.fovMaskTexture.refresh();
  }
}

