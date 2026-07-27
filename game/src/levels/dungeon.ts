import { type LevelDefinition, type LevelLayout } from "./types";

export const dungeonLevel: LevelDefinition = {
  id: "dungeon",
  name: "Dungeon",
  columns: 96,
  rows: 64,
  doorPlacements: [{ column: 16, row: 18, textureKey: "door_1" }],
  obstaclePlacements: [
    { tileX: 13.5, tileY: 16.5, width: 32, height: 32 },
    { tileX: 24.5, tileY: 16.5, width: 32, height: 32 },
    { tileX: 27.5, tileY: 6.5, width: 32, height: 32 },
    { tileX: 36.5, tileY: 13.5, width: 32, height: 32 },
    { tileX: 10.5, tileY: 27.5, width: 32, height: 32 },
    { tileX: 39.5, tileY: 26.5, width: 32, height: 32 },
    { tileX: 6.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 31.5, tileY: 21.5, width: 32, height: 32 }
  ],
  generateLayout(tileSize: number): LevelLayout {
    const walkable = Array.from({ length: 64 }, () => Array(96).fill(false));

    const carveRoom = (left: number, top: number, width: number, height: number) => {
      for (let row = top; row < top + height; row++) {
        for (let column = left; column < left + width; column++) {
          if (row >= 0 && row < 64 && column >= 0 && column < 96) {
            walkable[row][column] = true;
          }
        }
      }
    };

    const carveHorizontalPassage = (left: number, right: number, row: number, height = 3) => {
      const top = row - Math.floor(height / 2);
      for (let passageRow = top; passageRow < top + height; passageRow++) {
        for (let column = left; column <= right; column++) {
          if (passageRow >= 0 && passageRow < 64 && column >= 0 && column < 96) {
            walkable[passageRow][column] = true;
          }
        }
      }
    };

    const carveVerticalPassage = (column: number, top: number, bottom: number, width = 3) => {
      const left = column - Math.floor(width / 2);
      for (let passageColumn = left; passageColumn < left + width; passageColumn++) {
        for (let row = top; row <= bottom; row++) {
          if (row >= 0 && row < 64 && passageColumn >= 0 && passageColumn < 96) {
            walkable[row][passageColumn] = true;
          }
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
      spawnX: 23 * tileSize + tileSize / 2,
      spawnY: 16 * tileSize + tileSize / 2
    };
  }
};

