import { type GridPoint, type LevelDocument, type Npc, type Torch } from "./LevelDocument";

export type ObjectKind = "torch" | "npc";

export interface SelectedObject {
  kind: ObjectKind;
  index: number;
}

export interface ObjectHit {
  kind: ObjectKind;
  index: number;
  distance: number;
}

export function createDefaultTorch(world: GridPoint): Torch {
  return {
    tileX: world.column,
    tileY: world.row,
    radius: 12,
    lightRadius: 150
  };
}

export function createDefaultNpc(world: GridPoint): Npc {
  return {
    tileX: world.column,
    tileY: world.row,
    name: "Unnamed",
    dialogue: ["..."],
    restTarget: { x: world.column, y: world.row }
  };
}

export function ensureObjects(document: LevelDocument, kind: ObjectKind): Array<Torch | Npc> {
  if (kind === "torch") {
    document.torches ??= [];
    return document.torches;
  }

  document.npcs ??= [];
  return document.npcs;
}

export function hitTestObjects(document: LevelDocument, world: GridPoint, hitRadius = 0.55): ObjectHit | undefined {
  const torchHit = findNearestObject(document.torches ?? [], world, hitRadius, "torch");
  const npcHit = findNearestObject(document.npcs ?? [], world, hitRadius, "npc");

  if (!torchHit) {
    return npcHit;
  }

  if (!npcHit) {
    return torchHit;
  }

  return torchHit.distance <= npcHit.distance ? torchHit : npcHit;
}

export function moveObject(document: LevelDocument, hit: ObjectHit, world: GridPoint): void {
  if (hit.kind === "torch") {
    const torch = document.torches?.[hit.index];
    if (torch) {
      torch.tileX = world.column;
      torch.tileY = world.row;
    }
    return;
  }

  const npc = document.npcs?.[hit.index];
  if (npc) {
    npc.tileX = world.column;
    npc.tileY = world.row;
    npc.restTarget = { x: world.column, y: world.row };
  }
}

export function deleteObject(document: LevelDocument, hit: ObjectHit): void {
  const objects = hit.kind === "torch" ? document.torches : document.npcs;
  if (!objects || hit.index < 0 || hit.index >= objects.length) {
    return;
  }

  objects.splice(hit.index, 1);
}

export function addObject(document: LevelDocument, kind: ObjectKind, world: GridPoint): ObjectHit {
  const objects = ensureObjects(document, kind);
  const item = kind === "torch" ? createDefaultTorch(world) : createDefaultNpc(world);
  objects.push(item as Torch | Npc);
  return { kind, index: objects.length - 1, distance: 0 };
}

function findNearestObject<TItem extends { tileX: number; tileY: number }>(
  items: TItem[],
  world: GridPoint,
  hitRadius: number,
  kind: ObjectKind
): ObjectHit | undefined {
  let nearest: ObjectHit | undefined;
  const hitRadiusSquared = hitRadius * hitRadius;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const deltaX = item.tileX - world.column;
    const deltaY = item.tileY - world.row;
    const distance = deltaX * deltaX + deltaY * deltaY;

    if (distance > hitRadiusSquared) {
      continue;
    }

    if (!nearest || distance < nearest.distance) {
      nearest = { kind, index, distance };
    }
  }

  return nearest;
}
