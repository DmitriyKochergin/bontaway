import { type NpcEmotion } from "../entities/NpcEmotion";

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
  /** Optional emotional state — modifies eye shape and face decorations. */
  emotion?: NpcEmotion;
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

