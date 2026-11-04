import { MATRIX_EMPTY_TILE, MATRIX_FLOOR_TILE, MATRIX_ROOM_TILE, MATRIX_WALL_TILE } from "../levels/types";
import type { GridPoint, GridRect, GridSelection, MatrixLevelDocument } from "./LevelDocument";

export const DEFAULT_MATRIX_EMPTY_TILE = MATRIX_EMPTY_TILE;
export const DEFAULT_MATRIX_PALETTE = [
  MATRIX_EMPTY_TILE,
  MATRIX_WALL_TILE,
  MATRIX_FLOOR_TILE,
  MATRIX_ROOM_TILE
] as const;

export function normalizeGridRect(start: GridPoint, end: GridPoint): GridRect {
  return {
    left: Math.min(start.column, end.column),
    top: Math.min(start.row, end.row),
    right: Math.max(start.column, end.column),
    bottom: Math.max(start.row, end.row)
  };
}

export function createMatrixSelection(document: MatrixLevelDocument, rect: GridRect): GridSelection<number> {
  return {
    bounds: rect,
    origin: { column: rect.left, row: rect.top },
    cells: extractCells(document, rect)
  };
}

export function extractCells(document: MatrixLevelDocument, rect: GridRect): number[][] {
  const cells: number[][] = [];

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    const extractedRow: number[] = [];
    for (let column = rect.left; column <= rect.right; column += 1) {
      extractedRow.push(getTileValue(document, column, row));
    }
    cells.push(extractedRow);
  }

  return cells;
}

export function paintSelection(
  document: MatrixLevelDocument,
  selection: GridSelection<number>,
  tileValue: number
): void {
  for (let rowOffset = 0; rowOffset < selection.cells.length; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < selection.cells[rowOffset].length; columnOffset += 1) {
      setTileValue(document, selection.bounds.left + columnOffset, selection.bounds.top + rowOffset, tileValue);
    }
  }
}

export function getTileValue(document: MatrixLevelDocument, column: number, row: number): number {
  if (row < 0 || row >= document.rows || column < 0 || column >= document.columns) {
    return DEFAULT_MATRIX_EMPTY_TILE;
  }

  return document.tiles[row]?.[column] ?? DEFAULT_MATRIX_EMPTY_TILE;
}

export function setTileValue(document: MatrixLevelDocument, column: number, row: number, value: number): void {
  if (row < 0 || row >= document.rows || column < 0 || column >= document.columns) {
    return;
  }

  document.tiles[row][column] = value;
}

export function clampRectToDocument(document: MatrixLevelDocument, rect: GridRect): GridRect {
  const width = rect.right - rect.left + 1;
  const height = rect.bottom - rect.top + 1;

  let left = rect.left;
  let top = rect.top;

  if (width >= document.columns) {
    left = 0;
  } else {
    left = Math.min(Math.max(left, 0), document.columns - width);
  }

  if (height >= document.rows) {
    top = 0;
  } else {
    top = Math.min(Math.max(top, 0), document.rows - height);
  }

  return {
    left,
    top,
    right: left + width - 1,
    bottom: top + height - 1
  };
}
