import { type LevelDefinition, type LevelLayout } from "./types";

export const arenaLevel: LevelDefinition = {
  id: "arena",
  name: "Arena",
  columns: 48,
  rows: 48,
  doorPlacements: [], // No doors in an open arena
  obstaclePlacements: [
    // Surrounding center pillars
    { tileX: 18.5, tileY: 18.5, width: 32, height: 32 },
    { tileX: 28.5, tileY: 18.5, width: 32, height: 32 },
    { tileX: 18.5, tileY: 28.5, width: 32, height: 32 },
    { tileX: 28.5, tileY: 28.5, width: 32, height: 32 },

    // Middle core monoliths
    { tileX: 23.5, tileY: 13.5, width: 32, height: 32 },
    { tileX: 23.5, tileY: 33.5, width: 32, height: 32 },
    { tileX: 13.5, tileY: 23.5, width: 32, height: 32 },
    { tileX: 33.5, tileY: 23.5, width: 32, height: 32 },

    // Outer sentinel stones
    { tileX: 9.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 37.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 9.5, tileY: 37.5, width: 32, height: 32 },
    { tileX: 37.5, tileY: 37.5, width: 32, height: 32 }
  ],
  generateLayout(tileSize: number): LevelLayout {
    const cols = 48;
    const rows = 48;
    const walkable = Array.from({ length: rows }, () => Array(cols).fill(false));

    // Carve one big open room with a nice border
    const border = 4;
    for (let r = border; r < rows - border; r++) {
      for (let c = border; c < cols - border; c++) {
        walkable[r][c] = true;
      }
    }

    return {
      walkable,
      // Spawn player in the lower-middle section
      spawnX: 23 * tileSize + tileSize / 2,
      spawnY: 30 * tileSize + tileSize / 2
    };
  }
};

