import { type LevelDefinition, type LevelLayout } from "./types";

export const trademeetLevel: LevelDefinition = {
  id: "trademeet",
  name: "Trademeet",
  columns: 48,
  rows: 48,
  fogOfWarEnabled: true,
  doors: [], // No doors in an open arena
  obstacles: [
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
  torches: [
    // One torch standing beside each NPC, offset so the flame does not overlap the speaker.
    { tileX: 21.8, tileY: 15.5, radius: 150 }, // Priest Bono-bono
    { tileX: 15.5, tileY: 21.8, radius: 150 }, // Watcher Vael
    { tileX: 25.2, tileY: 21.5, radius: 150 } // Trader Olar
  ],
  npcs: [
    {
      tileX: 23.5,
      tileY: 15.5,
      bodyColor: 0x3b3a6d,
      eyeColor: 0xffd700,
      eyeSize: 4.5,
      eyeSpread: 4,
      name: "Priest Bono-bono",
      dialogue: [
        "When asking God - do you actually need to say Please? Think of it",
        "Do you actually need to ask HIM anything? He knows what you want before you do. And if he knows but didn't give you it yet, what does that mean?",
        "Do not trust the light. It only profiles what the shadows want to target."
      ]
    },
    {
      tileX: 15.5,
      tileY: 23.5,
      bodyColor: 0x555c65,
      eyeColor: 0x00f0ff,
      eyeSize: 4.0,
      eyeSpread: 5,
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
      bodyColor: 0x111111,
      eyeColor: 0xff2222,
      eyeSize: 3.5,
      eyeSpread: 3,
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
      bodyColor: 0x8c5d31,
      eyeColor: 0x7cfc00,
      eyeSize: 4.5,
      eyeSpread: 4,
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
