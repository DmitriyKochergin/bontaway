import { type GridPoint, type GridRect, type GridSelection, type MatrixLevelDocument } from "./LevelDocument";

export const DEFAULT_MATRIX_EMPTY_TILE = 0;
export const DEFAULT_MATRIX_PALETTE = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export interface MatrixClipboard {
  width: number;
  height: number;
  cells: number[][];
}

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

export function isCellInsideSelection(cell: GridPoint, selection: GridSelection<number>): boolean {
  const { left, right, top, bottom } = selection.bounds;
  return cell.column >= left && cell.column <= right && cell.row >= top && cell.row <= bottom;
}

export function copySelection(document: MatrixLevelDocument, selection: GridSelection<number>): MatrixClipboard {
  return {
    width: selection.bounds.right - selection.bounds.left + 1,
    height: selection.bounds.bottom - selection.bounds.top + 1,
    cells: extractCells(document, selection.bounds)
  };
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

export function eraseSelection(
  document: MatrixLevelDocument,
  selection: GridSelection<number>,
  emptyTileValue = DEFAULT_MATRIX_EMPTY_TILE
): void {
  paintSelection(document, selection, emptyTileValue);
}

export function moveSelection(
  document: MatrixLevelDocument,
  selection: GridSelection<number>,
  deltaColumn: number,
  deltaRow: number,
  emptyTileValue = DEFAULT_MATRIX_EMPTY_TILE
): GridSelection<number> {
  const width = selection.bounds.right - selection.bounds.left + 1;
  const height = selection.bounds.bottom - selection.bounds.top + 1;
  const sourceRect = selection.bounds;
  const targetRect = clampRectToDocument(document, {
    left: sourceRect.left + deltaColumn,
    top: sourceRect.top + deltaRow,
    right: sourceRect.right + deltaColumn,
    bottom: sourceRect.bottom + deltaRow
  });
  const targetCells = extractCells(document, sourceRect);

  eraseSelection(document, selection, emptyTileValue);

  for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      const targetColumn = targetRect.left + columnOffset;
      const targetRow = targetRect.top + rowOffset;
      setTileValue(document, targetColumn, targetRow, targetCells[rowOffset][columnOffset]);
    }
  }

  return createSelectionFromCells(document, targetRect, targetCells);
}

export function pasteClipboard(
  document: MatrixLevelDocument,
  clipboard: MatrixClipboard,
  origin: GridPoint,
  emptyTileValue = DEFAULT_MATRIX_EMPTY_TILE
): GridSelection<number> {
  const targetRect = clampRectToDocument(document, {
    left: origin.column,
    top: origin.row,
    right: origin.column + clipboard.width - 1,
    bottom: origin.row + clipboard.height - 1
  });

  for (let rowOffset = 0; rowOffset < clipboard.height; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < clipboard.width; columnOffset += 1) {
      const targetColumn = targetRect.left + columnOffset;
      const targetRow = targetRect.top + rowOffset;
      const cellValue = clipboard.cells[rowOffset][columnOffset] ?? emptyTileValue;
      setTileValue(document, targetColumn, targetRow, cellValue);
    }
  }

  return createSelectionFromCells(document, targetRect, clipboard.cells);
}

export function duplicateSelection(
  document: MatrixLevelDocument,
  selection: GridSelection<number>,
  offset: GridPoint = { column: 1, row: 1 }
): GridSelection<number> {
  const clipboard = copySelection(document, selection);
  const origin = {
    column: selection.bounds.left + offset.column,
    row: selection.bounds.top + offset.row
  };

  return pasteClipboard(document, clipboard, origin);
}

export function createSelectionFromCells(
  document: MatrixLevelDocument,
  rect: GridRect,
  cells: number[][]
): GridSelection<number> {
  const selectionCells = cells.map(row => [...row]);
  const normalizedRect = clampRectToDocument(document, rect);

  return {
    bounds: normalizedRect,
    origin: { column: normalizedRect.left, row: normalizedRect.top },
    cells: selectionCells
  };
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
