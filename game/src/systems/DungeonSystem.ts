import Phaser from "phaser";
import { getLevelDefinition, type LevelDefinition, type DoorPlacement } from "../levels";

export class DungeonSystem {
  private scene: Phaser.Scene;
  private readonly tileSize = 32;
  private dungeonColumns = 96;
  private dungeonRows = 64;
  private doorPlacements: readonly DoorPlacement[] = [];

  private walkable!: boolean[][];
  private physicsWalls!: Phaser.Physics.Arcade.StaticGroup;
  private occluders: Phaser.GameObjects.GameObject[] = [];

  private spawnX!: number;
  private spawnY!: number;
  private currentLevel!: LevelDefinition;

  constructor(scene: Phaser.Scene, levelId = "dungeon") {
    this.scene = scene;
    const selectedLevel = getLevelDefinition(levelId);
    if (!selectedLevel) {
      throw new Error(`Level with ID "${levelId}" not found.`);
    }
    this.currentLevel = selectedLevel;
    this.dungeonColumns = selectedLevel.columns;
    this.dungeonRows = selectedLevel.rows;
    this.doorPlacements = selectedLevel.doorPlacements;

    this.buildDungeon();
  }

  public getTileSize(): number {
    return this.tileSize;
  }

  public getDungeonColumns(): number {
    return this.dungeonColumns;
  }

  public getDungeonRows(): number {
    return this.dungeonRows;
  }

  public getPhysicsWalls(): Phaser.Physics.Arcade.StaticGroup {
    return this.physicsWalls;
  }

  public getOccluders(): Phaser.GameObjects.GameObject[] {
    return this.occluders;
  }

  public getSpawnX(): number {
    return this.spawnX;
  }

  public getSpawnY(): number {
    return this.spawnY;
  }

  public getMapWidth(): number {
    return this.dungeonColumns * this.tileSize;
  }

  public getMapHeight(): number {
    return this.dungeonRows * this.tileSize;
  }

  public isWalkable(column: number, row: number): boolean {
    return (
      row >= 0 && row < this.dungeonRows && column >= 0 && column < this.dungeonColumns && this.walkable[row][column]
    );
  }

  private buildDungeon() {
    const layout = this.currentLevel.generateLayout(this.tileSize);
    this.walkable = layout.walkable;
    this.spawnX = layout.spawnX;
    this.spawnY = layout.spawnY;

    const tileSize = this.tileSize;

    // Render floor images
    for (let row = 0; row < this.dungeonRows; row++) {
      for (let column = 0; column < this.dungeonColumns; column++) {
        if (!this.walkable[row][column]) {
          continue;
        }

        const floorImage = this.scene.add
          .image(column * tileSize + tileSize / 2, row * tileSize + tileSize / 2, "floor")
          .setDepth(0);
        floorImage.setPipeline("Light2D");
      }
    }

    // Render walls
    this.physicsWalls = this.scene.physics.add.staticGroup();
    const wallCells = this.buildWallCells(this.walkable);
    const doorTexturesByCell = new Map(
      this.doorPlacements.map(placement => [`${placement.column},${placement.row}`, placement.textureKey])
    );

    for (const wallCell of wallCells) {
      const [column, row] = wallCell.split(",").map(Number);
      const doorTextureKey = doorTexturesByCell.get(wallCell);

      if (doorTextureKey) {
        this.addDoorBlock(column * tileSize + tileSize / 2, row * tileSize + tileSize / 2, column, row, doorTextureKey);
        continue;
      }

      this.addWallBlock(column * tileSize + tileSize / 2, row * tileSize + tileSize / 2, column, row);
    }

    // Render obstacles
    const obstaclePlacements = this.currentLevel.obstaclePlacements.map(o => ({
      x: o.tileX * tileSize,
      y: o.tileY * tileSize,
      width: o.width,
      height: o.height
    }));

    for (const obstaclePlacement of obstaclePlacements) {
      this.addObstacle(obstaclePlacement.x, obstaclePlacement.y, obstaclePlacement.width, obstaclePlacement.height);
    }
  }

  private addWallBlock(x: number, y: number, column: number, row: number) {
    const wallBlock = this.scene.physics.add.staticImage(x, y, "wall");
    wallBlock.setPipeline("Light2D");
    wallBlock.setDepth(200);
    wallBlock.refreshBody();

    const body = wallBlock.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.left = this.isWalkable(column - 1, row);
    body.checkCollision.right = this.isWalkable(column + 1, row);
    body.checkCollision.up = this.isWalkable(column, row - 1);
    body.checkCollision.down = this.isWalkable(column, row + 1);

    this.physicsWalls.add(wallBlock);
    this.occluders.push(wallBlock);
  }

  private addDoorBlock(x: number, y: number, column: number, row: number, textureKey: string) {
    const doorBlock = this.scene.physics.add.staticImage(x, y, textureKey);
    doorBlock.setPipeline("Light2D");
    doorBlock.setDepth(200);
    doorBlock.refreshBody();

    const body = doorBlock.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.left = this.isWalkable(column - 1, row);
    body.checkCollision.right = this.isWalkable(column + 1, row);
    body.checkCollision.up = this.isWalkable(column, row - 1);
    body.checkCollision.down = this.isWalkable(column, row + 1);

    this.physicsWalls.add(doorBlock);
    this.occluders.push(doorBlock);
  }

  private addObstacle(x: number, y: number, width: number, height: number) {
    const obstacle = this.scene.physics.add.staticImage(x, y, "obstacle");
    obstacle.setPipeline("Light2D");
    obstacle.setDisplaySize(width, height);
    obstacle.refreshBody();
    obstacle.setDepth(200);
    this.physicsWalls.add(obstacle);
    this.occluders.push(obstacle);
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
}
