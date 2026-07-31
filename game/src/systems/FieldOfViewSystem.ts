import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { type PhaserRaycasterPlugin, type Raycaster, type RaycasterRay } from "../types/phaser-raycaster";

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
  // The mask canvas is baked a little larger than the screen so it can be nudged to follow the
  // world between redraws (see repositionMask) without exposing un-fogged screen edges.
  private readonly maskMargin = 48;
  private fovRefreshAccumulator = 0;
  private lastRedrawOriginX = Number.NaN;
  private lastRedrawOriginY = Number.NaN;
  // Camera scroll captured at the last mask redraw. Used to keep the throttled mask glued to the
  // world (not the player/screen) every frame.
  private maskScrollX = 0;
  private maskScrollY = 0;

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

    const maskTexture = this.scene.textures.createCanvas(
      "fov-mask",
      this.scene.scale.width + this.maskMargin * 2,
      this.scene.scale.height + this.maskMargin * 2
    );

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
    const camera = this.scene.cameras.main;
    const margin = this.maskMargin;
    const canvasWidth = this.scene.scale.width + margin * 2;
    const canvasHeight = this.scene.scale.height + margin * 2;
    const originX = this.player.x + this.player.fovOffsetX;
    const originY = this.player.y + this.player.fovOffsetY;
    // Project world -> mask-canvas space. The +margin bakes a fog border around the screen so the
    // mask can be nudged to track the world between redraws (repositionMask) without leaking light.
    const centerX = originX - camera.scrollX + margin;
    const centerY = originY - camera.scrollY + margin;
    const tileSize = this.tileSize;
    const outerRadius = tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    const innerRadius = tileSize * this.fovRadiusTiles;
    this.fovRay.setRay(originX, originY, 0, outerRadius);
    this.raycaster.update();
    const intersections = this.fovRay.castCircle({ objects: this.raycasterOccluders });
    const visibilityPolygon = intersections
      .map(
        (point: Phaser.Math.Vector2) =>
          new Phaser.Math.Vector2(point.x - camera.scrollX + margin, point.y - camera.scrollY + margin)
      )
      .sort(
        (left: Phaser.Math.Vector2, right: Phaser.Math.Vector2) =>
          Math.atan2(left.y - centerY, left.x - centerX) - Math.atan2(right.y - centerY, right.x - centerX)
      );

    // Bookmark where this mask was baked so update() can keep it glued to the world and only re-bake
    // the shadow shape once the player has actually moved.
    this.maskScrollX = camera.scrollX;
    this.maskScrollY = camera.scrollY;
    this.lastRedrawOriginX = originX;
    this.lastRedrawOriginY = originY;

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = "rgba(255, 255, 255, 1)";
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    if (visibilityPolygon.length < 3) {
      this.fovMaskTexture.refresh();
      this.repositionMask();
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
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.restore();

    // Draw circles for fireballs and explosions directly to the mask (no shadows/raycasting)
    context.save();
    context.globalCompositeOperation = "destination-out";

    for (const projectile of this.activeProjectiles) {
      if (!projectile.active) continue;
      const pX = projectile.x - camera.scrollX + margin;
      const pY = projectile.y - camera.scrollY + margin;
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
      const eX = explosion.x - camera.scrollX + margin;
      const eY = explosion.y - camera.scrollY + margin;
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

    this.fovMaskTexture.refresh();
    this.repositionMask();
  }

  /**
   * Nudge the throttled mask so its baked contents stay locked to world space as the camera scrolls.
   * The mask is baked maskMargin px larger than the screen, so shifting it by the camera delta keeps
   * the fog under the walls without exposing un-fogged screen edges. Near-free vs a full re-bake.
   */
  private repositionMask() {
    const camera = this.scene.cameras.main;
    this.fovMaskImage.x = this.maskScrollX - camera.scrollX - this.maskMargin;
    this.fovMaskImage.y = this.maskScrollY - camera.scrollY - this.maskMargin;
  }

  public update(delta: number) {
    // Cheap per-frame: keep the throttled mask glued to the world so shadows stay under the walls
    // instead of sliding with the camera during the gap between redraws.
    this.repositionMask();

    this.fovRefreshAccumulator += delta;

    const camera = this.scene.cameras.main;
    const originX = this.player.x + this.player.fovOffsetX;
    const originY = this.player.y + this.player.fovOffsetY;
    const playerMoved =
      Math.abs(originX - this.lastRedrawOriginX) > 0.25 || Math.abs(originY - this.lastRedrawOriginY) > 0.25;
    const hasDynamicLights = this.activeProjectiles.length > 0 || this.activeExplosions.length > 0;

    // Safety valve: if the camera drifted toward the fog border, re-bake now regardless of the
    // throttle so the oversized mask never runs out and shows the raw screen edge.
    const driftX = Math.abs(this.maskScrollX - camera.scrollX);
    const driftY = Math.abs(this.maskScrollY - camera.scrollY);
    const driftNearMargin = driftX > this.maskMargin * 0.75 || driftY > this.maskMargin * 0.75;

    // Throttle the raycast + full-screen texture upload to ~30/sec. History: an in-flight fireball
    // once forced a full raycast + mask redraw every frame, bypassing this throttle; castCircle
    // against every occluder at the display rate (120/sec) tanked FPS in the wall-dense dungeon.
    // repositionMask above now holds the fog in place, so the redraw only refreshes the shape.
    const throttleReady = this.fovRefreshAccumulator >= this.fovRefreshMs;
    const needsRedraw = (playerMoved || hasDynamicLights) && throttleReady;
    if (!needsRedraw && !driftNearMargin) {
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
