import { type LevelDefinition, type LevelLayout } from "./types";

// 10 emotions displayed in a horizontal row above the player
const EMOTIONS_ROW = [
  "shy",
  "determined",
  "bored",
  "suspicious",
  "disgusted",
  "surprised",
  "happy",
  "sad",
  "angry",
  "hypnotized"
] as const;

// Dialogues are intentionally terse — this level is a visual reference, not a story beat
const DIALOGUES: Record<string, string[]> = {
  shy: ["..."],
  determined: ["Forward."],
  bored: ["..."],
  suspicious: ["Hmm."],
  disgusted: ["Ugh."],
  surprised: ["Oh!"],
  happy: ["Hi!"],
  sad: ["Oh..."],
  angry: ["Back off."],
  hypnotized: ["...watch..."]
};

const COLS = 24;
const ROWS = 20;

// Row of NPCs: 10 NPCs spread across columns 2..21, sitting at row 5
// Player spawns at col 12, row 15 (below the NPC row)
const NPC_ROW = 10;
const PLAYER_ROW = 15;
const NPC_START_COL = 2; // first NPC tile column
const NPC_SPACING = 2; // tiles between NPC centres
const REST_LOOK_ROW = NPC_ROW + 1;

export const emotions2Level: LevelDefinition = {
  id: "emotions2",
  name: "Mirror Row",
  columns: COLS,
  rows: ROWS,
  doorPlacements: [],
  obstaclePlacements: [],

  npcPlacements: EMOTIONS_ROW.map((emotion, i) => ({
    tileX: NPC_START_COL + i * NPC_SPACING,
    tileY: NPC_ROW,
    type: "human" as const,
    emotion,
    name: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    dialogue: DIALOGUES[emotion] ?? ["..."],
    // Always rest-look straight down from the NPC position
    restTarget: { x: (NPC_START_COL + i * NPC_SPACING) * 32, y: REST_LOOK_ROW * 32 + 16 }
  })),

  generateLayout(tileSize: number): LevelLayout {
    // Keep the interior open, but leave the outer ring blocked so wall cells spawn around the map.
    const walkable = Array.from({ length: ROWS }, () => Array(COLS).fill(true));

    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLS; column++) {
        const isBorderTile = row === 0 || row === ROWS - 1 || column === 0 || column === COLS - 1;

        if (isBorderTile) {
          walkable[row][column] = false;
        }
      }
    }

    return {
      walkable,
      spawnX: 12 * tileSize + tileSize / 2,
      spawnY: PLAYER_ROW * tileSize + tileSize / 2
    };
  }
};
