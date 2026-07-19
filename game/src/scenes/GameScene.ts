import Phaser from "phaser";
import { Player } from "../entities/Player";
import { type PhaserRaycasterPlugin, type Raycaster, type RaycasterRay } from "../phaser-raycaster";
import { KeyboardSystem } from "../systems/KeyboardSystem";
import { MobileSystem } from "../systems/MobileSystem";
import { BaseScene } from "./BaseScene";

/**
 * Core gameplay scene.
 * MainScene owns pause and settings coordination; this scene focuses on dungeon exploration and combat.
 */
export default class GameScene extends BaseScene {
  raycasterPlugin!: PhaserRaycasterPlugin;
  private player!: Player;
  private raycaster!: Raycaster;
  private fovRay!: RaycasterRay;
  private raycasterOccluders: Phaser.Physics.Arcade.Image[] = [];
  private fovOverlay!: Phaser.GameObjects.Rectangle;
  private fovMaskTexture!: Phaser.Textures.CanvasTexture;
  private fovMaskImage!: Phaser.GameObjects.Image;
  private readonly fovRadiusTiles = 7.5;
  private readonly fovFadeTiles = 7.5;
  private readonly tileSize = 32;
  private readonly dungeonColumns = 96;
  private readonly dungeonRows = 64;
  private readonly fovRefreshMs = 33;
  private fovRefreshAccumulator = 0;
  private lastFovCenterX = Number.NaN;
  private lastFovCenterY = Number.NaN;
  private physicsWalls!: Phaser.Physics.Arcade.StaticGroup;
  private activeProjectiles: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[] = [];
  private activeExplosions: { x: number; y: number; radius: number }[] = [];
  private keyboardSystem!: KeyboardSystem;
  // @ts-expect-error
  private mobileSystem?: MobileSystem;
  private settingsButton!: Phaser.GameObjects.Image;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.setupShutdownCleanup();
    this.keyboardSystem = new KeyboardSystem(this);
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      this.player?.setVelocity(0, 0);

      // Keep the camera from shifting on the first frame after resume by temporarily setting smoothing (Lerp) to 0.
      this.cameras.main.setLerp(0, 0);
    });
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.time.delayedCall(1, () => {
        this.cameras.main.setLerp(0.1, 0.1);
      });
      this.syncKeyboardStateOnResume();
    });
    this.createScene();
  }

  private syncKeyboardStateOnResume() {
    if (this.player) {
      this.keyboardSystem.syncPlayerKeys(this.player);
      this.player.update(0, 16);
    }
  }

  createScene() {
    this.initAudio("exploration");

    this.cameras.main.setBackgroundColor("#000000");

    // Enable Phaser lighting system
    this.lights.enable();
    this.lights.setAmbientColor(0x111122); // Dark blue night/dungeon environment

    const tileSize = this.tileSize;
    const dungeon = this.buildDungeonLayout();
    const mapWidth = this.dungeonColumns * tileSize;
    const mapHeight = this.dungeonRows * tileSize;

    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    for (let row = 0; row < this.dungeonRows; row++) {
      for (let column = 0; column < this.dungeonColumns; column++) {
        if (!dungeon.walkable[row][column]) {
          continue;
        }

        const floorImage = this.add
          .image(column * tileSize + tileSize / 2, row * tileSize + tileSize / 2, "floor")
          .setDepth(0);
        floorImage.setPipeline("Light2D"); // Floor responds to light
      }
    }

    const physicsWalls = this.physics.add.staticGroup();
    this.physicsWalls = physicsWalls;
    const wallCells = this.buildWallCells(dungeon.walkable);

    for (const wallCell of wallCells) {
      const [column, row] = wallCell.split(",").map(Number);
      this.addWallBlock(
        physicsWalls,
        column * tileSize + tileSize / 2,
        row * tileSize + tileSize / 2,
        column,
        row,
        dungeon.walkable
      );
    }

    const obstaclePlacements = [
      { x: 13.5 * tileSize, y: 16.5 * tileSize, width: 32, height: 32 },
      { x: 24.5 * tileSize, y: 16.5 * tileSize, width: 32, height: 32 },
      { x: 27.5 * tileSize, y: 6.5 * tileSize, width: 32, height: 32 },
      { x: 36.5 * tileSize, y: 13.5 * tileSize, width: 32, height: 32 },
      { x: 10.5 * tileSize, y: 27.5 * tileSize, width: 32, height: 32 },
      { x: 39.5 * tileSize, y: 26.5 * tileSize, width: 32, height: 32 },
      { x: 6.5 * tileSize, y: 9.5 * tileSize, width: 32, height: 32 },
      { x: 31.5 * tileSize, y: 21.5 * tileSize, width: 32, height: 32 }
    ];

    for (const obstaclePlacement of obstaclePlacements) {
      this.addObstacle(
        physicsWalls,
        obstaclePlacement.x,
        obstaclePlacement.y,
        obstaclePlacement.width,
        obstaclePlacement.height
      );
    }

    this.raycaster = this.raycasterPlugin.createRaycaster({
      boundingBox: new Phaser.Geom.Rectangle(0, 0, mapWidth, mapHeight),
      autoUpdate: false
    });
    this.raycaster.mapGameObjects(this.raycasterOccluders, false);

    // Player
    this.player = new Player(this, dungeon.spawnX, dungeon.spawnY);

    this.physics.add.collider(this.player, physicsWalls);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    const isMobile =
      !this.sys.game.device.os.desktop ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Multi-touch config: allow at least 5 active pointers
      this.input.addPointer(5);

      // Instantiate Mobile System for touch controls (movement joystick & right-screen face fireballs)
      this.mobileSystem = new MobileSystem(this, this.player, (x, y) => this.castFireball(x, y));
    } else {
      // Desktop behavior: fire fireball directly where clicked
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (this.scene.isPaused()) {
          return;
        }
        this.castFireball(pointer.worldX, pointer.worldY);
      });
    }

    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    this.fovRay = this.raycaster.createRay({
      origin: { x: this.player.x, y: this.player.y },
      range: outerRadius,
      collisionRange: outerRadius,
      detectionRange: outerRadius,
      ignoreNotIntersectedRays: false
    });

    this.createFovOverlay();
    this.createSettingsButton();
  }

  private addWallBlock(
    physicsWalls: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    y: number,
    column: number,
    row: number,
    walkable: boolean[][]
  ) {
    const wallBlock = this.physics.add.staticImage(x, y, "wall");
    wallBlock.setPipeline("Light2D"); // Wall responds to light
    wallBlock.setDepth(200);
    wallBlock.refreshBody();

    const body = wallBlock.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.left = this.isWalkable(walkable, column - 1, row);
    body.checkCollision.right = this.isWalkable(walkable, column + 1, row);
    body.checkCollision.up = this.isWalkable(walkable, column, row - 1);
    body.checkCollision.down = this.isWalkable(walkable, column, row + 1);

    physicsWalls.add(wallBlock);
    this.raycasterOccluders.push(wallBlock);
  }

  private isWalkable(walkable: boolean[][], column: number, row: number) {
    return row >= 0 && row < this.dungeonRows && column >= 0 && column < this.dungeonColumns && walkable[row][column];
  }

  private buildDungeonLayout() {
    const walkable = Array.from({ length: this.dungeonRows }, () => Array(this.dungeonColumns).fill(false));

    const carveRoom = (left: number, top: number, width: number, height: number) => {
      for (let row = top; row < top + height; row++) {
        for (let column = left; column < left + width; column++) {
          this.markWalkable(walkable, column, row);
        }
      }
    };

    const carveHorizontalPassage = (left: number, right: number, row: number, height = 3) => {
      const top = row - Math.floor(height / 2);
      for (let passageRow = top; passageRow < top + height; passageRow++) {
        for (let column = left; column <= right; column++) {
          this.markWalkable(walkable, column, passageRow);
        }
      }
    };

    const carveVerticalPassage = (column: number, top: number, bottom: number, width = 3) => {
      const left = column - Math.floor(width / 2);
      for (let passageColumn = left; passageColumn < left + width; passageColumn++) {
        for (let row = top; row <= bottom; row++) {
          this.markWalkable(walkable, passageColumn, row);
        }
      }
    };

    carveRoom(17, 12, 14, 9);
    carveRoom(4, 13, 7, 6);
    carveRoom(35, 10, 8, 7);
    carveRoom(19, 3, 9, 5);
    carveRoom(18, 24, 10, 6);
    carveRoom(7, 5, 6, 5);
    carveRoom(36, 24, 6, 5);
    carveRoom(49, 7, 11, 7);
    carveRoom(53, 21, 12, 8);
    carveRoom(41, 35, 14, 8);
    carveRoom(9, 34, 10, 8);
    carveRoom(27, 40, 9, 6);
    carveRoom(68, 8, 10, 8);
    carveRoom(77, 22, 12, 8);
    carveRoom(72, 36, 14, 9);
    carveRoom(58, 47, 11, 7);
    carveRoom(83, 45, 8, 6);
    carveRoom(19, 50, 12, 7);

    carveHorizontalPassage(10, 16, 15);
    carveHorizontalPassage(30, 34, 13);
    carveVerticalPassage(23, 8, 12);
    carveVerticalPassage(23, 20, 24);
    carveHorizontalPassage(12, 18, 7);
    carveVerticalPassage(39, 17, 23);
    carveHorizontalPassage(40, 52, 10);
    carveVerticalPassage(58, 12, 25);
    carveHorizontalPassage(48, 61, 25);
    carveVerticalPassage(48, 25, 39);
    carveHorizontalPassage(14, 30, 38);
    carveVerticalPassage(31, 32, 44);
    carveHorizontalPassage(56, 73, 11);
    carveVerticalPassage(74, 11, 27);
    carveHorizontalPassage(66, 86, 25);
    carveVerticalPassage(85, 25, 41);
    carveHorizontalPassage(60, 79, 40);
    carveVerticalPassage(60, 40, 52);
    carveHorizontalPassage(22, 34, 53);
    carveVerticalPassage(34, 48, 58);
    carveHorizontalPassage(74, 89, 48);

    return {
      walkable,
      spawnX: 23 * this.tileSize + this.tileSize / 2,
      spawnY: 16 * this.tileSize + this.tileSize / 2
    };
  }

  private markWalkable(walkable: boolean[][], column: number, row: number) {
    if (row < 0 || row >= this.dungeonRows || column < 0 || column >= this.dungeonColumns) {
      return;
    }

    walkable[row][column] = true;
  }

  private buildWallCells(walkable: boolean[][]): Set<string> {
    const wallCells = new Set<string>();
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (let row = 0; row < this.dungeonRows; row++) {
      for (let column = 0; column < this.dungeonColumns; column++) {
        if (walkable[row][column]) {
          continue;
        }

        for (const [dx, dy] of directions) {
          const neighborColumn = column + dx;
          const neighborRow = row + dy;

          if (
            neighborRow >= 0 &&
            neighborRow < this.dungeonRows &&
            neighborColumn >= 0 &&
            neighborColumn < this.dungeonColumns &&
            walkable[neighborRow][neighborColumn]
          ) {
            wallCells.add(`${column},${row}`);
            break;
          }
        }
      }
    }

    return wallCells;
  }

  private addObstacle(
    physicsWalls: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const obstacle = this.physics.add.staticImage(x, y, "obstacle");
    obstacle.setPipeline("Light2D"); // Obstacle responds to light
    obstacle.setDisplaySize(width, height);
    obstacle.refreshBody();
    obstacle.setDepth(200);
    physicsWalls.add(obstacle);
    this.raycasterOccluders.push(obstacle);
  }

  private createFovOverlay() {
    this.fovOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1);
    this.fovOverlay.setOrigin(0, 0);
    this.fovOverlay.setScrollFactor(0);
    this.fovOverlay.setDepth(100);

    const maskTexture = this.textures.createCanvas("fov-mask", this.scale.width, this.scale.height);

    if (!maskTexture) {
      throw new Error("Unable to create the field-of-view mask texture.");
    }

    this.fovMaskTexture = maskTexture;
    this.fovMaskImage = this.add.image(0, 0, "fov-mask");
    this.fovMaskImage.setOrigin(0, 0);
    this.fovMaskImage.setScrollFactor(0);
    this.fovMaskImage.setVisible(false);

    this.fovOverlay.setMask(new Phaser.Display.Masks.BitmapMask(this, this.fovMaskImage));
    this.redrawFovMask();
  }

  private redrawFovMask() {
    const context = this.fovMaskTexture.getContext();
    const width = this.scale.width;
    const height = this.scale.height;
    const camera = this.cameras.main;
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

  update(_time: number, delta: number) {
    if (!this.player || !this.player.body) return;

    if (this.scene.isPaused()) {
      this.player.setVelocity(0, 0);
      return;
    }

    this.keyboardSystem.syncPlayerKeys(this.player);
    this.player.update(_time, delta);

    this.fovRefreshAccumulator += delta;

    const camera = this.cameras.main;
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

  private castFireball(targetX: number, targetY: number) {
    this.audioSystem?.playFireballCast(0.45);

    // Create fireball sprite
    const projectile = this.physics.add.sprite(this.player.x, this.player.y, "fireball");
    projectile.setPipeline("Light2D");
    projectile.setDepth(250);

    this.activeProjectiles.push(projectile);

    // Add light that flies with the fireball
    const spellLight = this.lights.addLight(projectile.x, projectile.y, 150, 0xff5500, 3);

    // Particles (fire trail)
    const particles = this.add.particles(0, 0, "fireball", {
      speed: 20,
      scale: { start: 1, end: 0 },
      blendMode: "ADD",
      lifespan: 300
    });
    particles.setDepth(240);
    particles.startFollow(projectile);

    // Move to target coordinates
    this.physics.moveTo(projectile, targetX, targetY, 300);

    let isCleanedUp = false;
    const cleanUp = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      this.activeProjectiles = this.activeProjectiles.filter(p => p !== projectile);
      this.lights.removeLight(spellLight);

      // Stop emitting and following so existing tail fades out naturally
      try {
        particles.stop();
        particles.stopFollow();
      } catch (err) {
        // Safe guard in case particles or scene were already destroyed
      }
      this.time.delayedCall(500, () => {
        try {
          particles.destroy();
        } catch (err) {
          // Safe guard
        }
      });

      projectile.destroy();
      this.events.off("update", updateListener);
    };

    // Destroy fireball and trigger explosion when it hits a wall/obstacle
    this.physics.add.collider(projectile, this.physicsWalls, () => {
      this.audioSystem?.playFireballHit(0.55);
      this.createExplosion(projectile.x, projectile.y);
      cleanUp();
    });

    // Destroy and cleanup after 10 seconds (or upon wall/obstacle collision)
    this.time.delayedCall(10000, () => {
      cleanUp();
    });

    // Update light position every frame
    const updateListener = () => {
      if (this.scene.isPaused()) return;

      if (projectile.active) {
        spellLight.x = projectile.x;
        spellLight.y = projectile.y;
      } else {
        cleanUp();
      }
    };
    this.events.on("update", updateListener);
  }

  private createExplosion(x: number, y: number) {
    // Create an expanding explosion light (matching fireball's orange color)
    const explosionLight = this.lights.addLight(x, y, 50, 0xff5500, 10);

    const explosionObj = { x, y, radius: 50 };
    this.activeExplosions.push(explosionObj);

    // Explosion particles (longer lifespan to match the slower fade out)
    const particles = this.add.particles(x, y, "fireball", {
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 2, end: 0 },
      blendMode: "ADD",
      lifespan: { min: 600, max: 700 },
      maxParticles: 25
    });
    particles.setDepth(260);

    // Animate the light expansion and fading (longer duration for a slower fade out)
    let elapsed = 0;
    const duration = 1000; // 1000 ms (1 second fade out)

    const updateLight = (_time: number, delta: number) => {
      if (this.scene.isPaused()) return;

      elapsed += delta;
      const progress = Math.min(elapsed / duration, 1);

      explosionLight.radius = 150 + progress * 250; // Expands to 400 radius
      explosionLight.intensity = 10 * (1 - progress);
      explosionObj.radius = explosionLight.radius;

      if (progress >= 1) {
        this.lights.removeLight(explosionLight);
        this.events.off("update", updateLight);
        this.activeExplosions = this.activeExplosions.filter(e => e !== explosionObj);
      }
    };

    this.events.on("update", updateLight);

    // Destroy particle emitter system when all particles fade
    this.time.delayedCall(1200, () => {
      particles.destroy();
    });
  }

  private createSettingsButton(): void {
    const margin = 30;
    const x = this.scale.width - margin;

    this.settingsButton = this.add.image(x, margin, "gear");
    this.settingsButton.setScrollFactor(0);
    this.settingsButton.setDepth(300);
    this.settingsButton.setInteractive({ useHandCursor: true });

    this.settingsButton.on("pointerover", () => {
      this.tweens.add({
        targets: this.settingsButton,
        scale: 1.25,
        angle: 45,
        duration: 150,
        ease: "Back.easeOut"
      });
    });

    this.settingsButton.on("pointerout", () => {
      this.tweens.add({
        targets: this.settingsButton,
        scale: 1.0,
        angle: 0,
        duration: 150,
        ease: "Power2.easeOut"
      });
    });

    this.settingsButton.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        if (event) {
          event.stopPropagation();
        }
        this.openSettingsMenu();
      }
    );

    const resizeHandler = (gameSize: Phaser.Structs.Size) => {
      if (this.settingsButton) {
        this.settingsButton.setPosition(gameSize.width - margin, margin);
      }
    };

    this.scale.on("resize", resizeHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", resizeHandler);
    });
  }

  private openSettingsMenu(): void {
    const mainScene = this.scene.get("MainScene") as unknown as {
      openSettings?: () => void;
    };
    if (mainScene && typeof mainScene.openSettings === "function") {
      this.audioSystem?.play("sfx_tablet", 0.4);
      mainScene.openSettings();
    }
  }
}
