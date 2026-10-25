import type { Door, Npc, Obstacle, Torch } from "../levels/types";

export type { Door, Npc, Obstacle, Torch };

export type LevelSourceType = "ts" | "matrix";

export interface GridPoint {
  column: number;
  row: number;
}

export interface GridRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GridSelection<TCell = number> {
  bounds: GridRect;
  origin: GridPoint;
  cells: TCell[][];
}

export interface TsRoomBlueprint {
  kind: "room";
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TsCorridorBlueprint {
  kind: "corridor";
  orientation: "horizontal" | "vertical";
  center: number;
  start: number;
  end: number;
  thickness: number;
}

export type TsLayoutBlueprint = TsRoomBlueprint | TsCorridorBlueprint;

export interface TsLevelLayout {
  walkable: boolean[][];
  blueprints: TsLayoutBlueprint[];
}

export interface LevelDocumentBase {
  type: LevelSourceType;
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
}

export interface TsLevelDocument extends LevelDocumentBase {
  type: "ts";
  layout: TsLevelLayout;
}

export interface MatrixLevelDocument extends LevelDocumentBase {
  type: "matrix";
  tiles: number[][];
}

export type LevelDocument = TsLevelDocument | MatrixLevelDocument;

export function cloneGridSelection<TCell>(selection: GridSelection<TCell>): GridSelection<TCell> {
  return {
    bounds: { ...selection.bounds },
    origin: { ...selection.origin },
    cells: selection.cells.map(row => [...row])
  };
}

export function cloneTsLevelLayout(layout: TsLevelLayout): TsLevelLayout {
  return {
    walkable: layout.walkable.map(row => [...row]),
    blueprints: layout.blueprints.map(blueprint => ({ ...blueprint }))
  };
}

export function cloneLevelDocument(document: LevelDocument): LevelDocument {
  if (document.type === "matrix") {
    return {
      ...document,
      tiles: document.tiles.map(row => [...row])
    };
  }

  return {
    ...document,
    layout: cloneTsLevelLayout(document.layout)
  };
}
