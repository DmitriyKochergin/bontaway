import { type GridSelection, type LevelDocument, type MatrixLevelDocument, type TsLevelDocument } from "./LevelDocument";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

type ValidationIssueList = ValidationIssue[];



function validateLevelDocument(document: LevelDocument): ValidationResult {
  const issues: ValidationIssueList = [];

  validateBaseLevel(document, issues);

  if (document.type === "matrix") {
    validateMatrixLevel(document, issues);
  } else {
    validateTsLevel(document, issues);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function validateSelection<TCell>(selection: GridSelection<TCell>, columns: number, rows: number): ValidationResult {
  const issues: ValidationIssueList = [];

  validatePositiveInteger(columns, "columns", issues);
  validatePositiveInteger(rows, "rows", issues);

  const { bounds, origin, cells } = selection;

  validateInteger(bounds.left, "selection.bounds.left", issues);
  validateInteger(bounds.top, "selection.bounds.top", issues);
  validateInteger(bounds.right, "selection.bounds.right", issues);
  validateInteger(bounds.bottom, "selection.bounds.bottom", issues);
  validateInteger(origin.column, "selection.origin.column", issues);
  validateInteger(origin.row, "selection.origin.row", issues);

  if (bounds.left > bounds.right) {
    issues.push({ path: "selection.bounds", message: "Selection left cannot exceed right." });
  }

  if (bounds.top > bounds.bottom) {
    issues.push({ path: "selection.bounds", message: "Selection top cannot exceed bottom." });
  }

  if (bounds.left < 0 || bounds.top < 0 || bounds.right >= columns || bounds.bottom >= rows) {
    issues.push({ path: "selection.bounds", message: "Selection must stay within level bounds." });
  }

  const expectedWidth = bounds.right - bounds.left + 1;
  const expectedHeight = bounds.bottom - bounds.top + 1;

  if (cells.length !== expectedHeight) {
    issues.push({ path: "selection.cells", message: "Selection row count does not match bounds height." });
  }

  for (let rowIndex = 0; rowIndex < cells.length; rowIndex += 1) {
    const rowCells = cells[rowIndex];
    if (!Array.isArray(rowCells)) {
      issues.push({ path: `selection.cells[${rowIndex}]`, message: "Selection row must be an array." });
      continue;
    }

    if (rowCells.length !== expectedWidth) {
      issues.push({ path: `selection.cells[${rowIndex}]`, message: "Selection column count does not match bounds width." });
    }
  }

  if (origin.column < 0 || origin.column >= columns || origin.row < 0 || origin.row >= rows) {
    issues.push({ path: "selection.origin", message: "Selection origin must stay within level bounds." });
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function validateBaseLevel(document: LevelDocument, issues: ValidationIssueList): void {
  validateNonEmptyText(document.id, "id", issues);
  validateNonEmptyText(document.name, "name", issues);
  validatePositiveInteger(document.columns, "columns", issues);
  validatePositiveInteger(document.rows, "rows", issues);

  if (document.fogOfWarEnabled !== undefined && typeof document.fogOfWarEnabled !== "boolean") {
    issues.push({ path: "fogOfWarEnabled", message: "Fog of war flag must be a boolean when provided." });
  }

  validateDoors(document.doors, document.columns, document.rows, issues);
  validateObstacles(document.obstacles, document.columns, document.rows, issues);
  validateTorches(document.torches, document.columns, document.rows, issues);
  validateNpcs(document.npcs, document.columns, document.rows, issues);
}

function validateMatrixLevel(document: MatrixLevelDocument, issues: ValidationIssueList): void {
  if (!Array.isArray(document.tiles)) {
    issues.push({ path: "tiles", message: "Matrix levels require a 2D tile array." });
    return;
  }

  if (document.tiles.length !== document.rows) {
    issues.push({ path: "tiles", message: "Matrix tile row count must match level rows." });
  }

  for (let rowIndex = 0; rowIndex < document.tiles.length; rowIndex += 1) {
    const row = document.tiles[rowIndex];
    if (!Array.isArray(row)) {
      issues.push({ path: `tiles[${rowIndex}]`, message: "Matrix tile row must be an array." });
      continue;
    }

    if (row.length !== document.columns) {
      issues.push({ path: `tiles[${rowIndex}]`, message: "Matrix tile column count must match level columns." });
    }

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (!Number.isInteger(row[columnIndex])) {
        issues.push({ path: `tiles[${rowIndex}][${columnIndex}]`, message: "Matrix tile values must be integers." });
      }
    }
  }
}

function validateTsLevel(document: TsLevelDocument, issues: ValidationIssueList): void {
  if (!document.layout || typeof document.layout !== "object") {
    issues.push({ path: "layout", message: "TS levels require a layout object." });
    return;
  }

  const { walkable, blueprints } = document.layout;

  if (!Array.isArray(walkable) || walkable.length !== document.rows) {
    issues.push({ path: "layout.walkable", message: "Walkable row count must match level rows." });
  }

  if (Array.isArray(walkable)) {
    for (let rowIndex = 0; rowIndex < walkable.length; rowIndex += 1) {
      const walkableRow = walkable[rowIndex];
      if (!Array.isArray(walkableRow)) {
        issues.push({ path: `layout.walkable[${rowIndex}]`, message: "Walkable row must be an array." });
        continue;
      }

      if (walkableRow.length !== document.columns) {
        issues.push({ path: `layout.walkable[${rowIndex}]`, message: "Walkable column count must match level columns." });
      }

      for (let columnIndex = 0; columnIndex < walkableRow.length; columnIndex += 1) {
        if (typeof walkableRow[columnIndex] !== "boolean") {
          issues.push({
            path: `layout.walkable[${rowIndex}][${columnIndex}]`,
            message: "Walkable cells must be booleans."
          });
        }
      }
    }
  }

  if (!Array.isArray(blueprints)) {
    issues.push({ path: "layout.blueprints", message: "TS levels require a blueprints array." });
    return;
  }

  for (let blueprintIndex = 0; blueprintIndex < blueprints.length; blueprintIndex += 1) {
    const blueprint = blueprints[blueprintIndex];
    if (!blueprint || typeof blueprint !== "object") {
      issues.push({ path: `layout.blueprints[${blueprintIndex}]`, message: "Blueprint must be an object." });
      continue;
    }

    if (blueprint.kind === "room") {
      validatePositiveInteger(blueprint.width, `layout.blueprints[${blueprintIndex}].width`, issues);
      validatePositiveInteger(blueprint.height, `layout.blueprints[${blueprintIndex}].height`, issues);
      validateInteger(blueprint.left, `layout.blueprints[${blueprintIndex}].left`, issues);
      validateInteger(blueprint.top, `layout.blueprints[${blueprintIndex}].top`, issues);

      if (
        blueprint.left < 0 ||
        blueprint.top < 0 ||
        blueprint.left + blueprint.width > document.columns ||
        blueprint.top + blueprint.height > document.rows
      ) {
        issues.push({
          path: `layout.blueprints[${blueprintIndex}]`,
          message: "Room blueprint must stay within level bounds."
        });
      }
      continue;
    }

    if (blueprint.kind === "corridor") {
      if (blueprint.orientation !== "horizontal" && blueprint.orientation !== "vertical") {
        issues.push({
          path: `layout.blueprints[${blueprintIndex}].orientation`,
          message: "Corridor orientation must be horizontal or vertical."
        });
      }

      validateInteger(blueprint.center, `layout.blueprints[${blueprintIndex}].center`, issues);
      validateInteger(blueprint.start, `layout.blueprints[${blueprintIndex}].start`, issues);
      validateInteger(blueprint.end, `layout.blueprints[${blueprintIndex}].end`, issues);
      validatePositiveInteger(blueprint.thickness, `layout.blueprints[${blueprintIndex}].thickness`, issues);

      if (blueprint.start > blueprint.end) {
        issues.push({
          path: `layout.blueprints[${blueprintIndex}]`,
          message: "Corridor blueprint start cannot exceed end."
        });
      }
      continue;
    }

    issues.push({
      path: `layout.blueprints[${blueprintIndex}].kind`,
      message: "Unknown TS layout blueprint kind."
    });
  }
}

function validateDoors(
  doors: LevelDocument["doors"],
  columns: number,
  rows: number,
  issues: ValidationIssueList
): void {
  if (!Array.isArray(doors)) {
    issues.push({ path: "doors", message: "Doors must be an array." });
    return;
  }

  for (let index = 0; index < doors.length; index += 1) {
    const door = doors[index];
    validateInteger(door.column, `doors[${index}].column`, issues);
    validateInteger(door.row, `doors[${index}].row`, issues);
    validateNonEmptyText(door.textureKey, `doors[${index}].textureKey`, issues);

    if (door.column < 0 || door.column >= columns || door.row < 0 || door.row >= rows) {
      issues.push({ path: `doors[${index}]`, message: "Door must stay within level bounds." });
    }
  }
}

function validateObstacles(
  obstacles: LevelDocument["obstacles"],
  columns: number,
  rows: number,
  issues: ValidationIssueList
): void {
  if (!Array.isArray(obstacles)) {
    issues.push({ path: "obstacles", message: "Obstacles must be an array." });
    return;
  }

  for (let index = 0; index < obstacles.length; index += 1) {
    const obstacle = obstacles[index];
    validateNumber(obstacle.tileX, `obstacles[${index}].tileX`, issues);
    validateNumber(obstacle.tileY, `obstacles[${index}].tileY`, issues);
    validatePositiveNumber(obstacle.width, `obstacles[${index}].width`, issues);
    validatePositiveNumber(obstacle.height, `obstacles[${index}].height`, issues);

    if (obstacle.tileX < 0 || obstacle.tileX >= columns || obstacle.tileY < 0 || obstacle.tileY >= rows) {
      issues.push({ path: `obstacles[${index}]`, message: "Obstacle must stay within level bounds." });
    }
  }
}

function validateTorches(
  torches: LevelDocument["torches"],
  columns: number,
  rows: number,
  issues: ValidationIssueList
): void {
  if (torches === undefined) {
    return;
  }

  if (!Array.isArray(torches)) {
    issues.push({ path: "torches", message: "Torches must be an array when provided." });
    return;
  }

  for (let index = 0; index < torches.length; index += 1) {
    const torch = torches[index];
    validateNumber(torch.tileX, `torches[${index}].tileX`, issues);
    validateNumber(torch.tileY, `torches[${index}].tileY`, issues);
    if (torch.radius !== undefined) {
      validatePositiveNumber(torch.radius, `torches[${index}].radius`, issues);
    }

    if (torch.tileX < 0 || torch.tileX >= columns || torch.tileY < 0 || torch.tileY >= rows) {
      issues.push({ path: `torches[${index}]`, message: "Torch must stay within level bounds." });
    }
  }
}

function validateNpcs(
  npcs: LevelDocument["npcs"],
  columns: number,
  rows: number,
  issues: ValidationIssueList
): void {
  if (npcs === undefined) {
    return;
  }

  if (!Array.isArray(npcs)) {
    issues.push({ path: "npcs", message: "NPCs must be an array when provided." });
    return;
  }

  for (let index = 0; index < npcs.length; index += 1) {
    const npc = npcs[index];
    validateNumber(npc.tileX, `npcs[${index}].tileX`, issues);
    validateNumber(npc.tileY, `npcs[${index}].tileY`, issues);
    validateNonEmptyText(npc.name, `npcs[${index}].name`, issues);
    validateDialogue(npc.dialogue, `npcs[${index}].dialogue`, issues);

    if (npc.emotion !== undefined && typeof npc.emotion !== "string") {
      issues.push({ path: `npcs[${index}].emotion`, message: "NPC emotion must be a string when provided." });
    }

    if (npc.restTarget !== undefined) {
      validateNumber(npc.restTarget.x, `npcs[${index}].restTarget.x`, issues);
      validateNumber(npc.restTarget.y, `npcs[${index}].restTarget.y`, issues);
    }

    if (npc.tileX < 0 || npc.tileX >= columns || npc.tileY < 0 || npc.tileY >= rows) {
      issues.push({ path: `npcs[${index}]`, message: "NPC must stay within level bounds." });
    }
  }
}

function validateNonEmptyText(value: unknown, path: string, issues: ValidationIssueList): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "Value must be a non-empty string." });
  }
}

function validateDialogue(value: unknown, path: string, issues: ValidationIssueList): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "Dialogue must be a non-empty string array." });
    return;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || value[index].trim().length === 0) {
      issues.push({ path: `${path}[${index}]`, message: "Dialogue entries must be non-empty strings." });
    }
  }
}

function validateInteger(value: unknown, path: string, issues: ValidationIssueList): void {
  if (!Number.isInteger(value)) {
    issues.push({ path, message: "Value must be an integer." });
  }
}

function validatePositiveInteger(value: unknown, path: string, issues: ValidationIssueList): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    issues.push({ path, message: "Value must be a positive integer." });
  }
}

function validateNumber(value: unknown, path: string, issues: ValidationIssueList): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: "Value must be a finite number." });
  }
}

function validatePositiveNumber(value: unknown, path: string, issues: ValidationIssueList): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push({ path, message: "Value must be a positive finite number." });
  }
}

export const MapValidator = {
  validateLevelDocument,
  validateSelection
};

void MapValidator;


