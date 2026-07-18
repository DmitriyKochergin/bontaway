import Phaser from "phaser";

export interface DungeonLayout {
  walkable: boolean[][];
  spawnX: number;
  spawnY: number;
}

export interface DungeonGeometry {
  wallLayer: Phaser.Physics.Arcade.StaticGroup;
  raycasterOccluders: Phaser.Physics.Arcade.Image[];
}

export class DungeonSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tileSize: number,
    private readonly dungeonColumns: number,
    private readonly dungeonRows: number
  ) {}

  createLayout(): DungeonLayout {
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
      spawnY: 16 * this.tileSize + this.tileSize / 2,
    };
  }

  createDungeonGeometry(layout: DungeonLayout): DungeonGeometry {
    const wallLayer = this.scene.physics.add.staticGroup();
    const raycasterOccluders: Phaser.Physics.Arcade.Image[] = [];

    for (let row = 0; row < this.dungeonRows; row++) {
      for (let column = 0; column < this.dungeonColumns; column++) {
        if (!layout.walkable[row][column]) {
          continue;
        }

        this.scene
          .add.image(column * this.tileSize + this.tileSize / 2, row * this.tileSize + this.tileSize / 2, "floor")
          .setDepth(0)
          .setPipeline("Light2D");
      }
    }

    for (const wallCell of this.buildWallCells(layout.walkable)) {
      const [column, row] = wallCell.split(",").map(Number);
      this.addWallBlock(
        wallLayer,
        raycasterOccluders,
        column * this.tileSize + this.tileSize / 2,
        row * this.tileSize + this.tileSize / 2,
        column,
        row,
        layout.walkable
      );
    }

    const obstaclePlacements = [
      { x: 13.5 * this.tileSize, y: 16.5 * this.tileSize, width: 32, height: 32 },
      { x: 24.5 * this.tileSize, y: 16.5 * this.tileSize, width: 32, height: 32 },
      { x: 27.5 * this.tileSize, y: 6.5 * this.tileSize, width: 32, height: 32 },
      { x: 36.5 * this.tileSize, y: 13.5 * this.tileSize, width: 32, height: 32 },
      { x: 10.5 * this.tileSize, y: 27.5 * this.tileSize, width: 32, height: 32 },
      { x: 39.5 * this.tileSize, y: 26.5 * this.tileSize, width: 32, height: 32 },
      { x: 6.5 * this.tileSize, y: 9.5 * this.tileSize, width: 32, height: 32 },
      { x: 31.5 * this.tileSize, y: 21.5 * this.tileSize, width: 32, height: 32 },
    ];

    for (const placement of obstaclePlacements) {
      this.addObstacle(
        wallLayer,
        raycasterOccluders,
        placement.x,
        placement.y,
        placement.width,
        placement.height
      );
    }

    return { wallLayer, raycasterOccluders };
  }

  private addWallBlock(
    wallLayer: Phaser.Physics.Arcade.StaticGroup,
    raycasterOccluders: Phaser.Physics.Arcade.Image[],
    x: number,
    y: number,
    column: number,
    row: number,
    walkable: boolean[][]
  ) {
    const wallBlock = this.scene.physics.add.staticImage(x, y, "wall");
    wallBlock.setPipeline("Light2D");
    wallBlock.setDepth(200);
    wallBlock.refreshBody();

    const body = wallBlock.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.left = this.isWalkable(walkable, column - 1, row);
    body.checkCollision.right = this.isWalkable(walkable, column + 1, row);
    body.checkCollision.up = this.isWalkable(walkable, column, row - 1);
    body.checkCollision.down = this.isWalkable(walkable, column, row + 1);

    wallLayer.add(wallBlock);
    raycasterOccluders.push(wallBlock);
  }

  private isWalkable(walkable: boolean[][], column: number, row: number) {
    return row >= 0 && row < this.dungeonRows && column >= 0 && column < this.dungeonColumns && walkable[row][column];
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
      [0, -1],
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
    wallLayer: Phaser.Physics.Arcade.StaticGroup,
    raycasterOccluders: Phaser.Physics.Arcade.Image[],
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const obstacle = this.scene.physics.add.staticImage(x, y, "obstacle");
    obstacle.setPipeline("Light2D");
    obstacle.setDisplaySize(width, height);
    obstacle.refreshBody();
    obstacle.setDepth(200);
    wallLayer.add(obstacle);
    raycasterOccluders.push(obstacle);
  }
}

