import type { LevelDefinition, LevelLayout } from "./types";

const COLUMNS = 64;
const ROWS = 32;
const WALL_TILE = 0;
const FLOOR_TILE = 1;

function createThreeChambersTiles(): number[][] {
  const tiles = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(WALL_TILE));

  const carveRoom = (left: number, top: number, width: number, height: number) => {
    for (let row = top; row < top + height; row += 1) {
      for (let column = left; column < left + width; column += 1) {
        tiles[row][column] = FLOOR_TILE;
      }
    }
  };

  const carveHorizontalPassage = (left: number, right: number, row: number, thickness: number) => {
    const top = row - Math.floor(thickness / 2);
    for (let passageRow = top; passageRow < top + thickness; passageRow += 1) {
      for (let column = left; column <= right; column += 1) {
        tiles[passageRow][column] = FLOOR_TILE;
      }
    }
  };

  carveRoom(6, 8, 14, 12);
  carveRoom(25, 6, 14, 16);
  carveRoom(45, 8, 14, 12);
  carveHorizontalPassage(19, 25, 14, 3);
  carveHorizontalPassage(38, 45, 14, 3);

  return tiles;
}

const threeChambersTiles = createThreeChambersTiles();

export const threeChambersLevel: LevelDefinition = {
  id: "three-chambers",
  name: "Three Chambers",
  columns: COLUMNS,
  rows: ROWS,
  fogOfWarEnabled: true,
  doors: [],
  obstacles: [
    { tileX: 11.5, tileY: 13.5, width: 32, height: 32 },
    { tileX: 31.5, tileY: 10.5, width: 32, height: 32 },
    { tileX: 51.5, tileY: 15.5, width: 32, height: 32 }
  ],
  torches: [
    { tileX: 9.5, tileY: 11.5, lightRadius: 180 },
    { tileX: 31.5, tileY: 8.5, lightRadius: 200 },
    { tileX: 54.5, tileY: 11.5, lightRadius: 180 }
  ],
  tiles: threeChambersTiles,
  generateLayout(tileSize: number): LevelLayout {
    return {
      walkable: threeChambersTiles.map(row => row.map(tile => tile !== WALL_TILE)),
      spawnX: 12 * tileSize + tileSize / 2,
      spawnY: 14 * tileSize + tileSize / 2
    };
  }
};
