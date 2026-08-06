import { type LevelDefinition, type LevelLayout } from "./types";

export const arenaLevel: LevelDefinition = {
  id: "arena",
  name: "Arena",
  columns: 48,
  rows: 48,
  fogOfWarEnabled: false,
  doorPlacements: [], // No doors in an open arena
  obstaclePlacements: [
    // Surrounding center pillars
    { tileX: 18.5, tileY: 18.5, width: 32, height: 32 },
    { tileX: 28.5, tileY: 18.5, width: 32, height: 32 },
    { tileX: 18.5, tileY: 28.5, width: 32, height: 32 },
    { tileX: 28.5, tileY: 28.5, width: 32, height: 32 },

    // Middle core monoliths
    { tileX: 23.5, tileY: 13.5, width: 32, height: 32 },
    { tileX: 23.5, tileY: 33.5, width: 32, height: 32 },
    { tileX: 13.5, tileY: 23.5, width: 32, height: 32 },
    { tileX: 33.5, tileY: 23.5, width: 32, height: 32 },

    // Outer sentinel stones
    { tileX: 9.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 37.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 9.5, tileY: 37.5, width: 32, height: 32 },
    { tileX: 37.5, tileY: 37.5, width: 32, height: 32 }
  ],
  npcPlacements: [
    {
      tileX: 23.5,
      tileY: 15.5,
      type: "scholar",
      name: "Scholar Elion",
      dialogue: [
        "The monoliths... they hum with memories of a deleted sky.",
        "Do not trust the light. It only profiles what the shadows want to target.",
        "This arena was not built for glory. It was a holding pen."
      ]
    },
    {
      tileX: 15.5,
      tileY: 23.5,
      type: "guard",
      name: "Watcher Vael",
      dialogue: [
        "Vigilance is a heavier burden than iron.",
        "State your business, traveler. Or stand silent like the pillars around us.",
        "I have watched this gate for forty cycles. Nothing has walked through. Until you."
      ]
    },
    {
      tileX: 7.5,
      tileY: 7.5,
      type: "wanderer",
      name: "The Nameless Entity",
      dialogue: [
        "We are all files in a system destined for a hard wipe.",
        "Do you feel the damp chill of the memory leak in the air?",
        "A hundred trillion years... and yet, we standing stones remain."
      ]
    },
    {
      tileX: 23.5,
      tileY: 21.5,
      type: "merchant",
      name: "Trader Olar",
      dialogue: [
        "A few thoughts for a coin... or a soul link for your sanity.",
        "These stone cracks tell a story of an old world. Interested?",
        "The dark sells cheap. The light costs your mind."
      ]
    }
  ],
  generateLayout(tileSize: number): LevelLayout {
    const cols = 48;
    const rows = 48;
    const walkable = Array.from({ length: rows }, () => Array(cols).fill(false));

    // Carve one big open room with a nice border
    const border = 4;
    for (let r = border; r < rows - border; r++) {
      for (let c = border; c < cols - border; c++) {
        walkable[r][c] = true;
      }
    }

    return {
      walkable,
      // Spawn player in the lower-middle section
      spawnX: 23 * tileSize + tileSize / 2,
      spawnY: 30 * tileSize + tileSize / 2
    };
  }
};

