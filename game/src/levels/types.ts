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

export interface NpcPlacement {
  tileX: number;
  tileY: number;
  type: "scholar" | "guard" | "wanderer" | "merchant";
  name: string;
  dialogue: string[];
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
  npcPlacements?: NpcPlacement[];
  generateLayout: (tileSize: number) => LevelLayout;
}

