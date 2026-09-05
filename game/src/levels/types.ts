import { type NpcEmotion } from "../entities/NpcEmotion";

export interface Door {
  column: number;
  row: number;
  textureKey: string;
}

export interface Obstacle {
  tileX: number;
  tileY: number;
  width: number;
  height: number;
}

export interface Torch {
  tileX: number;
  tileY: number;
  /** Radius of the torch fire flame in pixels. */
  radius?: number;
  /** Light reach in pixels. The fog reveal is raycast to this radius, so walls still cast shadows. */
  lightRadius?: number;
}

export interface Npc {
  tileX: number;
  tileY: number;
  name: string;
  dialogue: string[];
  /** Optional emotional state — modifies eye shape and face decorations. */
  emotion?: NpcEmotion;
  /** World-space rest-look target. Defaults to the level's centre when omitted. */
  restTarget?: { x: number; y: number };
  /** Fill color of the circular body. */
  bodyColor?: number;
  /** Color used to render the iris/pupil of each eye. */
  eyeColor?: number;
  /** Vertical extent of the eye shape at rest (open). */
  eyeSize?: number;
  /** Half-distance between the centres of the two eyes. */
  eyeSpread?: number;
  /** Whether eyebrows/details are shown. */
  showBrows?: boolean;
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
  spawnX?: number;
  spawnY?: number;
  fogOfWarEnabled?: boolean;
  doors: Door[];
  obstacles: Obstacle[];
  torches?: Torch[];
  npcs?: Npc[];
  /**
   * Present on matrix levels only. The 2-D tile grid where 0 = solid wall and any
   * other integer = walkable floor. When set, `GameScene.buildLevelDocument` returns a
   * `MatrixLevelDocument` instead of a `TsLevelDocument`.
   */
  tiles?: number[][];
  generateLayout: (tileSize: number) => LevelLayout;
}
