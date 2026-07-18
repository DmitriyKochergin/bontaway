import Phaser from "phaser";
import { Player } from "../entities/Player";
import { type PhaserRaycasterPlugin, type Raycaster, type RaycasterRay } from "../phaser-raycaster";

export default class GameScene extends Phaser.Scene {
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

  constructor() {
    super("MainScene");

    void this.preload;
    void this.create;
  }

  preload() {
    // 1. Floor Tile
    const floor = this.add.graphics();
    floor.fillStyle(0x1a1a1a);
    floor.fillRect(0, 0, 32, 32);
    floor.lineStyle(1, 0x121212);
    floor.strokeRect(0, 0, 32, 32);
    for (let i = 0; i < 5; i++) {
      floor.fillStyle(0x222222, 0.5);
      floor.fillRect(Phaser.Math.Between(2, 25), Phaser.Math.Between(2, 25), 4, 4);
    }
    floor.generateTexture("floor", 32, 32);
    floor.destroy();

    // 2. Wall
    const wall = this.add.graphics();
    wall.fillStyle(0x333333);
    wall.fillRect(0, 0, 32, 32);
    wall.lineStyle(2, 0x111111);
    wall.strokeRect(0, 0, 32, 32);
    wall.lineStyle(1, 0x444444);
    wall.moveTo(0, 0);
    wall.lineTo(32, 0);
    wall.moveTo(0, 0);
    wall.lineTo(0, 32);
    wall.strokePath();
    wall.generateTexture("wall", 32, 32);
    wall.destroy();

    // 3. Player (32x32 texture with eyes for direction)
    const player = this.add.graphics();

    // Cloak (main body)
    player.fillStyle(0x777777);
    player.fillCircle(16, 16, 14);

    // Two eyes to show direction (facing "up" by default)
    player.fillStyle(0x111111, 0.9);
    player.fillRoundedRect(9, 8, 5, 9, 3); // Left eye
    player.fillRoundedRect(18, 8, 5, 9, 3); // Right eye

    player.generateTexture("player", 32, 32);
    player.destroy();

    // 4. Obstacle tile
    const obstacle = this.add.graphics();
    obstacle.fillStyle(0x4a4a4a);
    obstacle.fillRoundedRect(0, 0, 48, 48, 8);
    obstacle.lineStyle(2, 0x1b1b1b);
    obstacle.strokeRoundedRect(0, 0, 48, 48, 8);
    obstacle.fillStyle(0x2f2f2f, 0.45);
    obstacle.fillCircle(16, 16, 5);
    obstacle.fillCircle(34, 31, 4);
    obstacle.generateTexture("obstacle", 48, 48);
    obstacle.destroy();

    // 5. Fireball texture
    const fireball = this.add.graphics();
    fireball.fillStyle(0xff5500);
    fireball.fillCircle(8, 8, 8);
    fireball.generateTexture("fireball", 16, 16);
    fireball.destroy();
  }

  create() {
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

    // Cast fireball on click/pointerdown
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.castFireball(pointer.worldX, pointer.worldY);
    });

    const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
    this.fovRay = this.raycaster.createRay({
      origin: { x: this.player.x, y: this.player.y },
      range: outerRadius,
      collisionRange: outerRadius,
      detectionRange: outerRadius,
      ignoreNotIntersectedRays: false
    });

    this.createFovOverlay();
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
      particles.destroy();
      projectile.destroy();
      this.events.off("update", updateListener);
    };

    // Destroy fireball and trigger explosion when it hits a wall/obstacle
    this.physics.add.collider(projectile, this.physicsWalls, () => {
      this.createExplosion(projectile.x, projectile.y);
      cleanUp();
    });

    // Destroy and cleanup after 10 seconds (or upon wall/obstacle collision)
    this.time.delayedCall(10000, () => {
      cleanUp();
    });

    // Update light position every frame
    const updateListener = () => {
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
}
