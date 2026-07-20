import Phaser from "phaser";

export class DungeonSystem {
  private scene: Phaser.Scene;
  private readonly tileSize = 32;
  private readonly dungeonColumns = 96;
  private readonly dungeonRows = 64;

  private walkable!: boolean[][];
  private physicsWalls!: Phaser.Physics.Arcade.StaticGroup;
  private occluders: Phaser.GameObjects.GameObject[] = [];

  private spawnX!: number;
  private spawnY!: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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

  public getWalkable(): boolean[][] {
    return this.walkable;
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
    const layout = this.buildDungeonLayout();
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

    for (const wallCell of wallCells) {
      const [column, row] = wallCell.split(",").map(Number);
      this.addWallBlock(column * tileSize + tileSize / 2, row * tileSize + tileSize / 2, column, row);
    }

    // Render obstacles
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

  private addObstacle(x: number, y: number, width: number, height: number) {
    const obstacle = this.scene.physics.add.staticImage(x, y, "obstacle");
    obstacle.setPipeline("Light2D");
    obstacle.setDisplaySize(width, height);
    obstacle.refreshBody();
    obstacle.setDepth(200);
    this.physicsWalls.add(obstacle);
    this.occluders.push(obstacle);
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
      /*
      DO NOT add corner tiles as this makes dungeon less creepy and safer, which is not the way.
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]*/
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
