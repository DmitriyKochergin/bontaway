import { type LevelDocument, type MatrixLevelDocument, type TsLevelDocument } from "./LevelDocument";

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}

function formatPlacements<T extends Record<string, unknown>>(placements: T[] | undefined): string {
  if (!placements || placements.length === 0) {
    return "[]";
  }

  return `[\n${placements.map(placement => `    ${formatObjectLiteral(placement)}`).join(",\n")}\n  ]`;
}

function formatObjectLiteral(value: Record<string, unknown>): string {
  const entries = Object.entries(value).map(([key, entryValue]) => `${key}: ${formatValue(entryValue)}`);
  return `{ ${entries.join(", ")} }`;
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => formatValue(item)).join(", ")}]`;
  }

  if (value && typeof value === "object") {
    return formatObjectLiteral(value as Record<string, unknown>);
  }

  return "undefined";
}

export function serializeLevelDocument(document: LevelDocument): string {
  if (document.type === "matrix") {
    return serializeMatrixLevelDocument(document);
  }

  return serializeTsLevelDocument(document);
}

export function serializeTsLevelDocument(document: TsLevelDocument): string {
  const fogLine = document.fogOfWarEnabled === false ? "  fogOfWarEnabled: false,\n" : "";
  const spawnLine = document.spawnX !== undefined && document.spawnY !== undefined ? `  spawnX: ${formatNumber(document.spawnX)},\n  spawnY: ${formatNumber(document.spawnY)},\n` : "";
  const walkable = `[\n${document.layout.walkable
    .map(row => `    [${row.map(cell => (cell ? "true" : "false")).join(", ")}]`)
    .join(",\n")}\n  ]`;

  return `import { type LevelDefinition, type LevelLayout } from "./types";

export const ${document.id}Level: LevelDefinition = {
  id: ${JSON.stringify(document.id)},
  name: ${JSON.stringify(document.name)},
  columns: ${document.columns},
  rows: ${document.rows},
${fogLine}${spawnLine}  doorPlacements: ${formatPlacements(document.doorPlacements)},
  obstaclePlacements: ${formatPlacements(document.obstaclePlacements)},
  torchPlacements: ${formatPlacements(document.torchPlacements)},
  npcPlacements: ${formatPlacements(document.npcPlacements)},
  generateLayout(tileSize: number): LevelLayout {
    return {
      walkable: ${walkable},
      spawnX: ${formatNumber(document.spawnX ?? 0)},
      spawnY: ${formatNumber(document.spawnY ?? 0)}
    };
  }
};
`;
}

export function serializeMatrixLevelDocument(document: MatrixLevelDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}


