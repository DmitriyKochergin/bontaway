import { dungeonLevel } from "./dungeon";
import { arenaLevel } from "./arena";
import { emotionsLevel } from "./emotions";
import { type LevelDefinition } from "./types";

export * from "./types";

export const levels: LevelDefinition[] = [dungeonLevel, arenaLevel, emotionsLevel];

export function getLevels(): LevelDefinition[] {
  return levels;
}

export function getLevelDefinition(id: string): LevelDefinition | undefined {
  return levels.find(lvl => lvl.id === id);
}

