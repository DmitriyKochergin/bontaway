import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
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
  private npcVisibilityMask!: Phaser.Display.Masks.BitmapMask;

  private readonly fovRadiusTiles = 7.5;
  private readonly fovFadeTiles = 7.5;
  private readonly tileSize = 32;
  private readonly fovRefreshMs = 33;
  // The mask canvas is baked a little larger than the screen so it can be nudged to follow the
  // world between redraws (see repositionMask) without exposing un-fogged screen edges.
  private readonly maskMargin = 48;
  // Halving resolution cuts canvas 2D CPU cost and WebGL texture upload bandwidth by ~4x.
  // Bilinear texture filtering keeps fog borders visually soft without an expensive blur filter.
  private readonly maskResolutionScale = 0.5;

  private fovRefreshAccumulator = 0;
  private lastRedrawOriginX = Number.NaN;
  private lastRedrawOriginY = Number.NaN;
  // Camera scroll captured at the last mask redraw. Used to keep the throttled mask glued to the
  // world (not the player/screen) every frame.
  private maskScrollX = 0;
  private maskScrollY = 0;

  private mapWidth: number;
  private mapHeight: number;

  private readonly activeProjectiles = new Set<Phaser.Types.Physics.Arcade.SpriteWithDynamicBody>();
  private readonly activeExplosions = new Set<{ x: number; y: number; radius: number }>();
  private readonly activeTorchLights = new Map<Phaser.GameObjects.Light, number>();
  private enabled: boolean;
  // Reused each redraw to hold only the occluders whose AABB overlaps the FOV reach box. castCircle
  // runs an O(objects^2) pairwise pass plus a per-ray cast over every object it is given, so handing
  // it every wall in the map made cost scale with total wall count and spike in the dense top-left.
  private readonly occludersInView: Phaser.GameObjects.GameObject[] = [];
  // Cached shadow shape from the last raycast, in world space and sorted by angle around the FOV
  // origin. The raycast only depends on the player's position, so while the player holds still we
  // reuse this and just re-stamp moving projectile/explosion light in paintMask — no castCircle.
  private cachedVisibilityPolygon: Phaser.Math.Vector2[] = [];
  // Whether the previous paint stamped projectile / explosion light. When the last dynamic light
  // disappears while the player stands still, one final paint is needed to clear its carved hole,
  // otherwise the lit circle lingers in the fog (which re-closes) until the player next moves.
  private lastPaintHadDynamicLights = false;
  // Torch changes are rare, but when they happen the static torch layer needs to be rebaked.
  private torchLightsDirty = false;
  private lastRaycastTimeMs = 0;

  // Pre-baked radial gradients (avoids createRadialGradient allocation and per-pixel evaluation in hot loop)
  private playerGradientCanvas!: HTMLCanvasElement | OffscreenCanvas;
  private pointLightGradientCanvas!: HTMLCanvasElement | OffscreenCanvas;
  private projectileGradientCanvas!: HTMLCanvasElement | OffscreenCanvas;

  // Cached static torch layer. Torches are static in world space; we bake them once and blit the layer
  // into the mask on repaint, completely skipping torch loops while player moves or dynamic spells fly.
  private staticTorchCanvas!: HTMLCanvasElement | OffscreenCanvas;
  private staticTorchContext!: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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
    this.enabled = true;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

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

    this.initGradients();
    this.initStaticTorchCanvas();
    this.createFovOverlay();

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  private createOffscreenCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    const safeWidth = Math.max(1, Math.ceil(width));
    const safeHeight = Math.max(1, Math.ceil(height));
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(safeWidth, safeHeight);
    }
    const canvas = document.createElement("canvas");
    canvas.width = safeWidth;
    canvas.height = safeHeight;
    return canvas;
  }

  private initGradients(): void {
    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    const innerRadius = this.tileSize * this.fovRadiusTiles;
    const outerRadiusScaled = outerRadius * this.maskResolutionScale;
    const innerRadiusScaled = innerRadius * this.maskResolutionScale;
    const playerCanvasSize = Math.ceil(outerRadiusScaled * 2);
    const playerCenter = outerRadiusScaled;

    // 1. Player FOV radial gradient
    this.playerGradientCanvas = this.createOffscreenCanvas(playerCanvasSize, playerCanvasSize);
    const playerContext = this.playerGradientCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;

    const playerGradient = playerContext.createRadialGradient(
      playerCenter,
      playerCenter,
      0,
      playerCenter,
      playerCenter,
      outerRadiusScaled
    );
    const innerStop = innerRadiusScaled / outerRadiusScaled;
    playerGradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    playerGradient.addColorStop(innerStop * 0.5, "rgba(0, 0, 0, 0.85)");
    playerGradient.addColorStop(innerStop, "rgba(0, 0, 0, 0.55)");
    playerGradient.addColorStop(0.82, "rgba(0, 0, 0, 0.18)");
    playerGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    playerContext.fillStyle = playerGradient;
    playerContext.beginPath();
    playerContext.arc(playerCenter, playerCenter, outerRadiusScaled, 0, Math.PI * 2);
    playerContext.fill();

    // 2. Base point light gradient (high-res template for torches & explosions)
    const baseRadius = 256;
    const baseDiameter = baseRadius * 2;
    this.pointLightGradientCanvas = this.createOffscreenCanvas(baseDiameter, baseDiameter);
    const pointContext = this.pointLightGradientCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;

    const pointGradient = pointContext.createRadialGradient(
      baseRadius,
      baseRadius,
      0,
      baseRadius,
      baseRadius,
      baseRadius
    );
    pointGradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    pointGradient.addColorStop(0.5, "rgba(0, 0, 0, 0.7)");
    pointGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    pointContext.fillStyle = pointGradient;
    pointContext.beginPath();
    pointContext.arc(baseRadius, baseRadius, baseRadius, 0, Math.PI * 2);
    pointContext.fill();

    // 3. Projectile light gradient (pre-baked at exact scaled radius 150 * scale for 1:1 blit)
    const projectileRadiusScaled = 150 * this.maskResolutionScale;
    const projectileDiameter = Math.ceil(projectileRadiusScaled * 2);
    this.projectileGradientCanvas = this.createOffscreenCanvas(projectileDiameter, projectileDiameter);
    const projectileContext = this.projectileGradientCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
    projectileContext.drawImage(this.pointLightGradientCanvas, 0, 0, projectileDiameter, projectileDiameter);
  }

  private initStaticTorchCanvas(): void {
    const width = Math.max(1, Math.ceil(this.mapWidth * this.maskResolutionScale));
    const height = Math.max(1, Math.ceil(this.mapHeight * this.maskResolutionScale));
    this.staticTorchCanvas = this.createOffscreenCanvas(width, height);
    this.staticTorchContext = this.staticTorchCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
    this.torchLightsDirty = true;
  }

  private expandStaticTorchCanvas(requiredWidth: number, requiredHeight: number): void {
    const newCanvas = this.createOffscreenCanvas(requiredWidth, requiredHeight);
    const newContext = newCanvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    this.staticTorchCanvas = newCanvas;
    this.staticTorchContext = newContext;
    this.torchLightsDirty = true;
  }

  private rebakeStaticTorchCanvas(): void {
    const width = this.staticTorchCanvas.width;
    const height = this.staticTorchCanvas.height;
    this.staticTorchContext.clearRect(0, 0, width, height);

    if (this.activeTorchLights.size === 0) {
      this.torchLightsDirty = false;
      return;
    }

    this.staticTorchContext.save();
    this.staticTorchContext.globalCompositeOperation = "source-over";

    for (const [torchLight, revealRadius] of this.activeTorchLights) {
      const scaledTorchX = torchLight.x * this.maskResolutionScale;
      const scaledTorchY = torchLight.y * this.maskResolutionScale;
      const scaledRevealRadius = revealRadius * this.maskResolutionScale;
      const diameter = scaledRevealRadius * 2;

      this.staticTorchContext.drawImage(
        this.pointLightGradientCanvas,
        scaledTorchX - scaledRevealRadius,
        scaledTorchY - scaledRevealRadius,
        diameter,
        diameter
      );
    }

    this.staticTorchContext.restore();
    this.torchLightsDirty = false;
  }

  private createFovOverlay() {
    this.fovOverlay = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0x000000, 1);
    this.fovOverlay.setOrigin(0, 0);
    this.fovOverlay.setScrollFactor(0);
    this.fovOverlay.setDepth(DepthLayer.FovOverlay);

    const canvasWidth = Math.ceil((this.scene.scale.width + this.maskMargin * 2) * this.maskResolutionScale);
    const canvasHeight = Math.ceil((this.scene.scale.height + this.maskMargin * 2) * this.maskResolutionScale);

    const maskTexture = this.scene.textures.createCanvas("fov-mask", canvasWidth, canvasHeight);

    if (!maskTexture) {
      throw new Error("Unable to create the field-of-view mask texture.");
    }

    this.fovMaskTexture = maskTexture;
    this.fovMaskTexture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.fovMaskImage = this.scene.add.image(0, 0, "fov-mask");
    this.fovMaskImage.setOrigin(0, 0);
    this.fovMaskImage.setScrollFactor(0);
    this.fovMaskImage.setScale(1 / this.maskResolutionScale);
    this.fovMaskImage.setVisible(false);

    this.fovOverlay.setMask(new Phaser.Display.Masks.BitmapMask(this.scene, this.fovMaskImage));
    this.npcVisibilityMask = new Phaser.Display.Masks.BitmapMask(this.scene, this.fovMaskImage);
    this.npcVisibilityMask.invertAlpha = true;
    this.recomputeVisibilityPolygon();
    this.paintMask();
  }

  /**
   * NPCs sit above the fog overlay, so they need its inverse alpha to disappear in the same shadow.
   * The shared source image is refreshed whenever player vision or a spell light changes.
   */
  public getNpcVisibilityMask(): Phaser.Display.Masks.BitmapMask {
    return this.npcVisibilityMask;
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
    this.activeProjectiles.add(projectile);
  }

  public removeProjectile(projectile: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
    this.activeProjectiles.delete(projectile);
  }

  public addExplosion(explosion: { x: number; y: number; radius: number }) {
    this.activeExplosions.add(explosion);
  }

  public removeExplosion(explosion: { x: number; y: number; radius: number }) {
    this.activeExplosions.delete(explosion);
  }

  public addTorch(torchLight: Phaser.GameObjects.Light, revealRadius: number): void {
    if (this.activeTorchLights.get(torchLight) === revealRadius) {
      return;
    }

    const requiredWidth = Math.ceil((torchLight.x + revealRadius) * this.maskResolutionScale);
    const requiredHeight = Math.ceil((torchLight.y + revealRadius) * this.maskResolutionScale);
    if (
      this.staticTorchCanvas &&
      (requiredWidth > this.staticTorchCanvas.width || requiredHeight > this.staticTorchCanvas.height)
    ) {
      this.expandStaticTorchCanvas(
        Math.max(this.staticTorchCanvas.width, requiredWidth),
        Math.max(this.staticTorchCanvas.height, requiredHeight)
      );
    }

    this.activeTorchLights.set(torchLight, revealRadius);
    this.torchLightsDirty = true;
    this.fovRefreshAccumulator = this.fovRefreshMs;
  }

  public removeTorch(torchLight: Phaser.GameObjects.Light): void {
    if (!this.activeTorchLights.delete(torchLight)) {
      return;
    }

    this.torchLightsDirty = true;
    this.fovRefreshAccumulator = this.fovRefreshMs;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    this.fovRefreshAccumulator = this.fovRefreshMs;
    this.lastPaintHadDynamicLights = false;

    if (!enabled) {
      this.paintDisabledMask();
      return;
    }

    this.fovOverlay.setVisible(true);
    this.recomputeVisibilityPolygon();
    this.paintMask();
  }

  /**
   * Return only the occluders whose bounding box overlaps the square that circumscribes the FOV
   * circle. castCircle runs an O(objects^2) pairwise pass plus a per-ray cast over every object it is
   * given, so feeding it the whole map made the raycast cost scale with total wall count and spike in
   * the dense top-left rooms. The FOV circle is inscribed in this square, so no in-range occluder is
   * ever dropped and the visibility polygon is unchanged. Reuses one array to avoid per-redraw GC.
   */
  private collectOccludersInRange(originX: number, originY: number, reach: number): Phaser.GameObjects.GameObject[] {
    const inView = this.occludersInView;
    inView.length = 0;
    const minX = originX - reach;
    const maxX = originX + reach;
    const minY = originY - reach;
    const maxY = originY + reach;

    for (const occluder of this.raycasterOccluders) {
      const image = occluder as Phaser.GameObjects.Image;
      const halfWidth = image.displayWidth * 0.5;
      const halfHeight = image.displayHeight * 0.5;

      if (
        image.x + halfWidth < minX ||
        image.x - halfWidth > maxX ||
        image.y + halfHeight < minY ||
        image.y - halfHeight > maxY
      ) {
        continue;
      }

      inView.push(occluder);
    }

    return inView;
  }

  // Re-run the raycast to rebuild the shadow shape. This is the expensive, location-sensitive step
  // (castCircle scales with occluder density), so update() only calls it when the player actually
  // moved. Stored in world space, sorted by angle around the origin, so paintMask can re-project it
  // at the current camera scroll without recasting while the player holds still.
  private recomputeVisibilityPolygon() {
    const originX = this.player.x;
    const originY = this.player.y;
    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);

    this.cachedVisibilityPolygon = this.computeVisibilityPolygon(originX, originY, outerRadius);
    this.lastRedrawOriginX = originX;
    this.lastRedrawOriginY = originY;
  }

  public getLastRaycastTimeMs(): number {
    return this.lastRaycastTimeMs;
  }

  // Cast the FOV ray in a circle from the player origin and return the shadow polygon in world
  // space, sorted by angle around that origin.
  private computeVisibilityPolygon(originX: number, originY: number, radius: number): Phaser.Math.Vector2[] {
    const raycastStartTime = performance.now();
    this.fovRay.setRay(originX, originY, 0, radius);
    this.raycaster.update();
    const intersections = this.fovRay.castCircle({
      objects: this.collectOccludersInRange(originX, originY, radius)
    });

    // Angle sort is done in world space around the world origin. Projection to canvas space is a pure
    // translation, so the ordering is identical to sorting the projected points.
    intersections.sort(
      (left: Phaser.Math.Vector2, right: Phaser.Math.Vector2) =>
        Math.atan2(left.y - originY, left.x - originX) - Math.atan2(right.y - originY, right.x - originX)
    );

    this.lastRaycastTimeMs = performance.now() - raycastStartTime;

    return intersections;
  }

  // Repaint the mask canvas from the cached shadow polygon plus pre-baked light layers, then upload
  // to GPU. No castCircle here, so this is cheap relative to a recompute. Runs every time the mask
  // needs refreshing, including while a fireball flies past a stationary player.
  private paintMask() {
    const context = this.fovMaskTexture.getContext();
    const camera = this.scene.cameras.main;
    const margin = this.maskMargin;
    const canvasWidth = this.fovMaskTexture.width;
    const canvasHeight = this.fovMaskTexture.height;
    const scrollX = camera.scrollX;
    const scrollY = camera.scrollY;
    const originX = this.lastRedrawOriginX;
    const originY = this.lastRedrawOriginY;
    const resolutionScale = this.maskResolutionScale;

    // Project world -> mask-canvas space.
    const playerCanvasCenterX = (originX - scrollX + margin) * resolutionScale;
    const playerCanvasCenterY = (originY - scrollY + margin) * resolutionScale;
    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    const outerRadiusScaled = outerRadius * resolutionScale;
    const visibilityPolygon = this.cachedVisibilityPolygon;

    // Bookmark the scroll this canvas was baked at so repositionMask keeps it glued to the world.
    this.maskScrollX = scrollX;
    this.maskScrollY = scrollY;

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = "rgba(255, 255, 255, 1)";
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    if (visibilityPolygon.length < 3) {
      this.fovMaskTexture.refresh();
      this.repositionMask();
      return;
    }

    // 1. Draw player FOV visibility polygon using pre-baked player gradient.
    // Clip to the raycasted polygon, then stamp the pre-baked gradient with destination-out.
    // context.filter = "blur(1px)" is removed: bilinear scaling produces smooth edges natively.
    context.save();
    context.beginPath();
    context.moveTo(
      (visibilityPolygon[0].x - scrollX + margin) * resolutionScale,
      (visibilityPolygon[0].y - scrollY + margin) * resolutionScale
    );

    for (let i = 1; i < visibilityPolygon.length; i++) {
      context.lineTo(
        (visibilityPolygon[i].x - scrollX + margin) * resolutionScale,
        (visibilityPolygon[i].y - scrollY + margin) * resolutionScale
      );
    }

    context.closePath();
    context.clip();
    context.globalCompositeOperation = "destination-out";

    context.drawImage(
      this.playerGradientCanvas,
      playerCanvasCenterX - outerRadiusScaled,
      playerCanvasCenterY - outerRadiusScaled
    );
    context.restore();

    // 2. Composite static torches. If dirty, rebake the static layer once.
    // Torches are static in world space: blitting the pre-baked layer avoids looping all torches on player move.
    if (this.torchLightsDirty) {
      this.rebakeStaticTorchCanvas();
    }

    if (this.activeTorchLights.size > 0) {
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.drawImage(
        this.staticTorchCanvas,
        (-scrollX + margin) * resolutionScale,
        (-scrollY + margin) * resolutionScale
      );
      context.restore();
    }

    // 3. Draw dynamic lights (projectiles & explosions) directly with pre-baked gradient drawImage calls
    if (this.activeProjectiles.size > 0 || this.activeExplosions.size > 0) {
      context.save();
      context.globalCompositeOperation = "destination-out";

      const projectileRadiusScaled = 150 * resolutionScale;
      for (const projectile of this.activeProjectiles) {
        if (!projectile.active) continue;
        const projectileCanvasX = (projectile.x - scrollX + margin) * resolutionScale;
        const projectileCanvasY = (projectile.y - scrollY + margin) * resolutionScale;

        context.drawImage(
          this.projectileGradientCanvas,
          projectileCanvasX - projectileRadiusScaled,
          projectileCanvasY - projectileRadiusScaled
        );
      }

      for (const explosion of this.activeExplosions) {
        const explosionCanvasX = (explosion.x - scrollX + margin) * resolutionScale;
        const explosionCanvasY = (explosion.y - scrollY + margin) * resolutionScale;
        const explosionRadiusScaled = explosion.radius * resolutionScale;
        const explosionDiameter = explosionRadiusScaled * 2;

        context.drawImage(
          this.pointLightGradientCanvas,
          explosionCanvasX - explosionRadiusScaled,
          explosionCanvasY - explosionRadiusScaled,
          explosionDiameter,
          explosionDiameter
        );
      }

      context.restore();
    }

    this.fovMaskTexture.refresh();
    this.repositionMask();
  }

  private paintDisabledMask() {
    const context = this.fovMaskTexture.getContext();
    const camera = this.scene.cameras.main;

    this.maskScrollX = camera.scrollX;
    this.maskScrollY = camera.scrollY;

    context.clearRect(0, 0, this.fovMaskTexture.width, this.fovMaskTexture.height);
    this.fovMaskTexture.refresh();
    this.fovOverlay.setVisible(false);
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
    if (!this.enabled) {
      return;
    }

    // Cheap per-frame: keep the throttled mask glued to the world so shadows stay under the walls
    // instead of sliding with the camera during the gap between redraws.
    this.repositionMask();

    this.fovRefreshAccumulator += delta;

    const camera = this.scene.cameras.main;
    const originX = this.player.x;
    const originY = this.player.y;
    const playerMoved =
      Math.abs(originX - this.lastRedrawOriginX) > 0.25 || Math.abs(originY - this.lastRedrawOriginY) > 0.25;
    const hasDynamicLights = this.activeProjectiles.size > 0 || this.activeExplosions.size > 0;

    // Safety valve: if the camera drifted toward the fog border, re-bake now regardless of the
    // throttle so the oversized mask never runs out and shows the raw screen edge.
    const driftX = Math.abs(this.maskScrollX - camera.scrollX);
    const driftY = Math.abs(this.maskScrollY - camera.scrollY);
    const driftNearMargin = driftX > this.maskMargin * 0.75 || driftY > this.maskMargin * 0.75;

    // Throttle the mask repaint + full-screen texture upload to ~30/sec.
    const throttleReady = this.fovRefreshAccumulator >= this.fovRefreshMs;
    // One more paint after the last dynamic light vanishes clears its carved hole from the fog.
    const dynamicLightsJustCleared = this.lastPaintHadDynamicLights && !hasDynamicLights;
    const needsPaint =
      (playerMoved || hasDynamicLights || dynamicLightsJustCleared || this.torchLightsDirty) && throttleReady;
    if (!needsPaint && !driftNearMargin) {
      return;
    }

    this.fovRefreshAccumulator = 0;

    // The raycast (shadow shape) only depends on the player's position, so recompute it only when the
    // player actually moved (or on the first paint). While a fireball flies past a stationary player,
    // reuse the cached shadow and just re-stamp the moving light in paintMask. This keeps castCircle —
    // the location-sensitive cost — off the hot path during "cast fireballs on the run".
    if (playerMoved || this.cachedVisibilityPolygon.length === 0) {
      this.recomputeVisibilityPolygon();
    }

    this.paintMask();
    this.lastPaintHadDynamicLights = hasDynamicLights;
  }

  public destroy() {
    this.fovOverlay?.destroy();
    this.fovMaskImage?.destroy();
    this.npcVisibilityMask?.destroy();

    if (this.scene.textures.exists("fov-mask")) {
      this.scene.textures.remove("fov-mask");
    }
  }
}
