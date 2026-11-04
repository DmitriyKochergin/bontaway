import matrixSource from "./three-chambers.json";
import { isMatrixWalkableTile, type LevelDefinition, type LevelLayout } from "./types";

const rows = matrixSource.tiles.length;
const columns = matrixSource.tiles[0]?.length ?? 0;

export const threeChambersLevel: LevelDefinition = {
  id: matrixSource.id,
  name: matrixSource.name,
  columns,
  rows,
  spawnX: matrixSource.spawnX,
  spawnY: matrixSource.spawnY,
  fogOfWarEnabled: matrixSource.fogOfWarEnabled,
  doors: matrixSource.doors,
  obstacles: matrixSource.obstacles,
  torches: matrixSource.torches,
  tiles: matrixSource.tiles,
  generateLayout(tileSize: number): LevelLayout {
    return {
      walkable: matrixSource.tiles.map(row => row.map(isMatrixWalkableTile)),
      spawnX: matrixSource.spawnX ?? 12 * tileSize + tileSize / 2,
      spawnY: matrixSource.spawnY ?? 14 * tileSize + tileSize / 2
    };
  }
};
