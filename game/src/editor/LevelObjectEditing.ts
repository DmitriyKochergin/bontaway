import { type GridPoint, type LevelDocument, type NpcPlacement, type TorchPlacement } from "./LevelDocument";

export type PlacementKind = "torch" | "npc";

export interface SelectedPlacement {
  kind: PlacementKind;
  index: number;
}

export interface PlacementHit {
  kind: PlacementKind;
  index: number;
  distance: number;
}

export function createDefaultTorchPlacement(world: GridPoint): TorchPlacement {
  return {
    tileX: world.column,
    tileY: world.row,
    radius: 150
  };
}

export function createDefaultNpcPlacement(world: GridPoint): NpcPlacement {
  return {
    tileX: world.column,
    tileY: world.row,
    type: "human",
    name: "Unnamed",
    dialogue: ["..."],
    restTarget: { x: world.column, y: world.row }
  };
}

export function getPlacements(document: LevelDocument, kind: PlacementKind): Array<TorchPlacement | NpcPlacement> {
  return kind === "torch" ? document.torchPlacements ?? [] : document.npcPlacements ?? [];
}

export function ensurePlacements(document: LevelDocument, kind: PlacementKind): Array<TorchPlacement | NpcPlacement> {
  if (kind === "torch") {
    document.torchPlacements ??= [];
    return document.torchPlacements;
  }

  document.npcPlacements ??= [];
  return document.npcPlacements;
}

export function hitTestPlacements(
  document: LevelDocument,
  world: GridPoint,
  hitRadius = 0.55
): PlacementHit | undefined {
  const torchHit = findNearestPlacement(document.torchPlacements ?? [], world, hitRadius, "torch");
  const npcHit = findNearestPlacement(document.npcPlacements ?? [], world, hitRadius, "npc");

  if (!torchHit) {
    return npcHit;
  }

  if (!npcHit) {
    return torchHit;
  }

  return torchHit.distance <= npcHit.distance ? torchHit : npcHit;
}

export function movePlacement(document: LevelDocument, hit: PlacementHit, world: GridPoint): void {
  if (hit.kind === "torch") {
    const placement = document.torchPlacements?.[hit.index];
    if (placement) {
      placement.tileX = world.column;
      placement.tileY = world.row;
    }
    return;
  }

  const placement = document.npcPlacements?.[hit.index];
  if (placement) {
    placement.tileX = world.column;
    placement.tileY = world.row;
    placement.restTarget = { x: world.column, y: world.row };
  }
}

export function deletePlacement(document: LevelDocument, hit: PlacementHit): void {
  const placements = hit.kind === "torch" ? document.torchPlacements : document.npcPlacements;
  if (!placements || hit.index < 0 || hit.index >= placements.length) {
    return;
  }

  placements.splice(hit.index, 1);
}

export function addPlacement(document: LevelDocument, kind: PlacementKind, world: GridPoint): PlacementHit {
  const placements = ensurePlacements(document, kind);
  const placement = kind === "torch" ? createDefaultTorchPlacement(world) : createDefaultNpcPlacement(world);
  placements.push(placement as TorchPlacement | NpcPlacement);
  return { kind, index: placements.length - 1, distance: 0 };
}

function findNearestPlacement<TPlacement extends { tileX: number; tileY: number }>(
  placements: TPlacement[],
  world: GridPoint,
  hitRadius: number,
  kind: PlacementKind
): PlacementHit | undefined {
  let nearest: PlacementHit | undefined;
  const hitRadiusSquared = hitRadius * hitRadius;

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const deltaX = placement.tileX - world.column;
    const deltaY = placement.tileY - world.row;
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

