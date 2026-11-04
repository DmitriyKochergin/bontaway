import { arenaLevel } from "./arena";
import { bellwetherLevel } from "./bellwether";
import { dungeonLevel } from "./dungeon";
import { emotionsLevel } from "./emotions";
import { emotions2Level } from "./emotions2";
import { threeChambersLevel } from "./three-chambers";
import { trademeetLevel } from "./trademeet";
import type { LevelDefinition } from "./types";

export * from "./types";

export const levels: LevelDefinition[] = [
  dungeonLevel,
  arenaLevel,
  bellwetherLevel,
  trademeetLevel,
  emotionsLevel,
  emotions2Level,
  threeChambersLevel
];

export function getLevels(): LevelDefinition[] {
  return levels;
}

export function getLevelDefinition(id: string): LevelDefinition | undefined {
  return levels.find(lvl => lvl.id === id);
}
