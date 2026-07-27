export interface DoorPlacement {
  column: number;
  row: number;
  textureKey: string;
}

export interface ObstaclePlacement {
  tileX: number;
  tileY: number;
  width: number;
  height: number;
}

export interface LevelLayout {
  walkable: boolean[][];
  spawnX: number;
  spawnY: number;
}

export interface LevelDefinition {
  id: string;
  name: string;
  columns: number;
  rows: number;
  doorPlacements: DoorPlacement[];
  obstaclePlacements: ObstaclePlacement[];
  generateLayout: (tileSize: number) => LevelLayout;
}

