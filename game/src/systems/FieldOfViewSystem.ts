import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { type PhaserRaycasterPlugin, type Raycaster, type RaycasterRay } from "../phaser-raycaster";

export class FieldOfViewSystem {
  private scene: Phaser.Scene;
  private player: Player;
  private raycaster: Raycaster;
  private fovRay: RaycasterRay;
  private raycasterOccluders: Phaser.GameObjects.GameObject[] = [];
  private fovOverlay!: Phaser.GameObjects.Rectangle;
  private fovMaskTexture!: Phaser.Textures.CanvasTexture;
  private fovMaskImage!: Phaser.GameObjects.Image;

  private readonly fovRadiusTiles = 7.5;
  private readonly fovFadeTiles = 7.5;
  private readonly tileSize = 32;
  private readonly fovRefreshMs = 33;
  private fovRefreshAccumulator = 0;
  private lastFovCenterX = Number.NaN;
  private lastFovCenterY = Number.NaN;

  private activeProjectiles: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[] = [];
  private activeExplosions: { x: number; y: number; radius: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    player: Player,
    raycasterPlugin: PhaserRaycasterPlugin,
    mapWidth: number,
    mapHeight: number,
    initialOccluders: Phaser.GameObjects.GameObject[] = []
  ) {
    this.scene = scene;
    this.player = player;
    this.raycasterOccluders = [...initialOccluders];

    this.raycaster = raycasterPlugin.createRaycaster({
      boundingBox: new Phaser.Geom.Rectangle(0, 0, mapWidth, mapHeight),
      autoUpdate: false
    });
    this.raycaster.mapGameObjects(this.raycasterOccluders, false);

    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    this.fovRay = this.raycaster.createRay({
      origin: { x: this.player.x, y: this.player.y },
      range: outerRadius,
      collisionRange: outerRadius,
      detectionRange: outerRadius,
      ignoreNotIntersectedRays: false
    });

    this.createFovOverlay();

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  private createFovOverlay() {
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

  public addOccluder(gameObject: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) {
    if (Array.isArray(gameObject)) {
      this.raycasterOccluders.push(...gameObject);
      this.raycaster.mapGameObjects(gameObject, false);
    } else {
      this.raycasterOccluders.push(gameObject);
      this.raycaster.mapGameObjects(gameObject, false);
    }
  }

  public addProjectile(projectile: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
    this.activeProjectiles.push(projectile);
  }

  public removeProjectile(projectile: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
    this.activeProjectiles = this.activeProjectiles.filter(p => p !== projectile);
  }

  public addExplosion(explosion: { x: number; y: number; radius: number }) {
    this.activeExplosions.push(explosion);
  }

  public removeExplosion(explosion: { x: number; y: number; radius: number }) {
    this.activeExplosions = this.activeExplosions.filter(e => e !== explosion);
  }

  private redrawFovMask() {
    const context = this.fovMaskTexture.getContext();
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const camera = this.scene.cameras.main;
    const originX = this.player.x + this.player.fovOffsetX;
    const originY = this.player.y + this.player.fovOffsetY;
    const centerX = originX - camera.scrollX;
    const centerY = originY - camera.scrollY;
    const tileSize = this.tileSize;
    const outerRadius = tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    const innerRadius = tileSize * this.fovRadiusTiles;
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

    if (visibilityPolygon.length < 3) {
      this.fovMaskTexture.refresh();
      return;
    }

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

    // Draw circles for fireballs and explosions directly to the mask (no shadows/raycasting)
    context.save();
    context.globalCompositeOperation = "destination-out";

    for (const projectile of this.activeProjectiles) {
      if (!projectile.active) continue;
      const pX = projectile.x - camera.scrollX;
      const pY = projectile.y - camera.scrollY;
      const radius = 150; // Match fireball light radius

      const grad = context.createRadialGradient(pX, pY, 0, pX, pY, radius);
      grad.addColorStop(0, "rgba(0, 0, 0, 1)");
      grad.addColorStop(0.5, "rgba(0, 0, 0, 0.7)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      context.fillStyle = grad;
      context.beginPath();
      context.arc(pX, pY, radius, 0, Math.PI * 2);
      context.fill();
    }

    for (const explosion of this.activeExplosions) {
      const eX = explosion.x - camera.scrollX;
      const eY = explosion.y - camera.scrollY;
      const radius = explosion.radius;

      const grad = context.createRadialGradient(eX, eY, 0, eX, eY, radius);
      grad.addColorStop(0, "rgba(0, 0, 0, 1)");
      grad.addColorStop(0.5, "rgba(0, 0, 0, 0.7)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      context.fillStyle = grad;
      context.beginPath();
      context.arc(eX, eY, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();

    this.lastFovCenterX = centerX;
    this.lastFovCenterY = centerY;
    this.fovMaskTexture.refresh();
  }

  public update(delta: number) {
    this.fovRefreshAccumulator += delta;

    const camera = this.scene.cameras.main;
    const currentFovCenterX = this.player.x - camera.scrollX;
    const currentFovCenterY = this.player.y - camera.scrollY;
    const movedEnough =
      Math.abs(currentFovCenterX - this.lastFovCenterX) > 0.25 ||
      Math.abs(currentFovCenterY - this.lastFovCenterY) > 0.25 ||
      this.activeProjectiles.length > 0 ||
      this.activeExplosions.length > 0;

    if (!movedEnough && this.fovRefreshAccumulator < this.fovRefreshMs) {
      return;
    }

    this.fovRefreshAccumulator = 0;
    this.redrawFovMask();
  }

  public destroy() {
    this.fovOverlay?.destroy();
    this.fovMaskImage?.destroy();

    if (this.scene.textures.exists("fov-mask")) {
      this.scene.textures.remove("fov-mask");
    }
  }
}
