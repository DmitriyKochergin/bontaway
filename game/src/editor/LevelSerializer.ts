import { type LevelDocument, type MatrixLevelDocument, type TsLevelDocument } from "./LevelDocument";

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}

function formatObjects<T extends object>(items: T[] | undefined): string {
  if (!items || items.length === 0) {
    return "[]";
  }

  return `[\n${items.map(item => `    ${formatObjectLiteral(item)}`).join(",\n")}\n  ]`;
}

function formatObjectLiteral(value: object): string {
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
${fogLine}${spawnLine}  doors: ${formatObjects(document.doors)},
  obstacles: ${formatObjects(document.obstacles)},
  torches: ${formatObjects(document.torches)},
  npcs: ${formatObjects(document.npcs)},
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


