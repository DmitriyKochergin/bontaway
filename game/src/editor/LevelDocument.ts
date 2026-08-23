import { type DoorPlacement, type NpcPlacement, type ObstaclePlacement, type TorchPlacement } from "../levels/types";

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
  fogOfWarEnabled?: boolean;
  doorPlacements: DoorPlacement[];
  obstaclePlacements: ObstaclePlacement[];
  torchPlacements?: TorchPlacement[];
  npcPlacements?: NpcPlacement[];
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

