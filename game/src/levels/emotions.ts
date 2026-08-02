import { type LevelDefinition, type LevelLayout } from "./types";

export const emotionsLevel: LevelDefinition = {
  id: "emotions",
  name: "Hall of Faces",
  columns: 48,
  rows: 48,
  doorPlacements: [],
  obstaclePlacements: [
    // Beautiful central monolith blocking path and adding mystery
    { tileX: 23.5, tileY: 23.5, width: 32, height: 32 },
    // Symmetric corner sentinel stones
    { tileX: 9.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 37.5, tileY: 9.5, width: 32, height: 32 },
    { tileX: 9.5, tileY: 37.5, width: 32, height: 32 },
    { tileX: 37.5, tileY: 37.5, width: 32, height: 32 }
  ],
  npcPlacements: [
    {
      tileX: 38,
      tileY: 24,
      type: "scholar",
      emotion: "angry",
      name: "Scholar Ignatius",
      dialogue: [
        "Why do you disturb me? The library of coordinates is in absolute disarray!",
        "Every keystroke you make echoes like a hammer in my head!"
      ]
    },
    {
      tileX: 37,
      tileY: 28,
      type: "scholar",
      emotion: "sad",
      name: "Scholar Barnaby",
      dialogue: [
        "I've cataloged all the forgotten values, but none of them can bring back the original sky.",
        "The light... it fades a little more every time we reload."
      ]
    },
    {
      tileX: 35,
      tileY: 32,
      type: "scholar",
      emotion: "happy",
      name: "Scholar Felix",
      dialogue: [
        "Ah, a guest! The variables align beautifully today, don't you think?",
        "I've found a way to render a perfect circle! It's the small things."
      ]
    },
    {
      tileX: 32,
      tileY: 35,
      type: "scholar",
      emotion: "surprised",
      name: "Scholar Alistair",
      dialogue: [
        "Oh! A living player? I thought the main loop had pruned all external inputs!",
        "What is that device in your hand? It hums with foreign energy!"
      ]
    },
    {
      tileX: 28,
      tileY: 37,
      type: "scholar",
      emotion: "fear",
      name: "Scholar Timothy",
      dialogue: [
        "Shh! Keep your voice down... the garbage collector is scanning this memory block.",
        "I saw a shadow move. Not a game shadow, a real one, sliding between the pixels."
      ]
    },
    {
      tileX: 24,
      tileY: 38,
      type: "guard",
      emotion: "disgusted",
      name: "Watcher Kael",
      dialogue: [
        "Ugh, another biological entity. Smells like wet carbon and copper.",
        "This sector is polluted with deprecated assets. Disgusting."
      ]
    },
    {
      tileX: 20,
      tileY: 37,
      type: "guard",
      emotion: "suspicious",
      name: "Watcher Thorne",
      dialogue: [
        "You walk with the stride of a debugger. What values are you altering?",
        "I'm watching your input buffer. Don't try anything clever."
      ]
    },
    {
      tileX: 16,
      tileY: 35,
      type: "guard",
      emotion: "sleepy",
      name: "Watcher Gideon",
      dialogue: [
        "Huh? Oh, I must have slipped into a low-power sleep state...",
        "Just five more cycles... my memory refresh rate is lagging..."
      ]
    },
    {
      tileX: 13,
      tileY: 32,
      type: "guard",
      emotion: "bored",
      name: "Watcher Caleb",
      dialogue: [
        "Still guarding. Still empty. Nothing changes, not even the random seed.",
        "Talk to someone else. Or don't. It doesn't write to any log anyway."
      ]
    },
    {
      tileX: 11,
      tileY: 28,
      type: "guard",
      emotion: "excited",
      name: "Watcher Jace",
      dialogue: [
        "System alert! An active session! This is the most action I've seen in cycles!",
        "Show me your skills! Cast a spell, let's see the particle engine spark!"
      ]
    },
    {
      tileX: 10,
      tileY: 24,
      type: "wanderer",
      emotion: "confused",
      name: "The Lost Soul",
      dialogue: [
        "Where is the exit portal? The pathing nodes seem to have lost their edges.",
        "I was walking north, but the compass keeps spinning clockwise."
      ]
    },
    {
      tileX: 11,
      tileY: 20,
      type: "wanderer",
      emotion: "proud",
      name: "The Exiled Prince",
      dialogue: [
        "I was once the master of the main rendering thread. Look at my geometry.",
        "Even in exile, my outline remains perfectly anti-aliased."
      ]
    },
    {
      tileX: 13,
      tileY: 16,
      type: "wanderer",
      emotion: "devastated",
      name: "The Weeping Wraith",
      dialogue: [
        "They deleted the home directory... everything I was, swept into /dev/null...",
        "My tears are just unallocated bytes, pooling at your feet."
      ]
    },
    {
      tileX: 16,
      tileY: 13,
      type: "wanderer",
      emotion: "manic",
      name: "The Mad Hermit",
      dialogue: [
        "Hehehe! Look at the stars! They aren't stars, they're debug points!",
        "The pointer is null! It's null! We are all floating in the void!"
      ]
    },
    {
      tileX: 20,
      tileY: 11,
      type: "wanderer",
      emotion: "smug",
      name: "The Clever Rogue",
      dialogue: [
        "You think you're the only one who can bypass the physics engine? Please.",
        "I found a collision exploit. Want to buy the offsets?"
      ]
    },
    {
      tileX: 24,
      tileY: 10,
      type: "merchant",
      emotion: "determined",
      name: "Trader Boris",
      dialogue: [
        "No discounts. I will compile my inventory value by value until the market stabilizes.",
        "Success is a function of pure iteration. I will stand here until the next version."
      ]
    },
    {
      tileX: 28,
      tileY: 11,
      type: "merchant",
      emotion: "shy",
      name: "Trader Lily",
      dialogue: [
        "Oh... hello. I... I have some potions, if you want to look... no pressure.",
        "I don't usually trade with strangers. Please don't look at my prices too closely..."
      ]
    },
    {
      tileX: 32,
      tileY: 13,
      type: "merchant",
      emotion: "pleading",
      name: "Trader Pippin",
      dialogue: [
        "Please, buy these scrolls! The memory leak is eating my storage capacity!",
        "Just one trade, traveler. I need to clear my buffer before the next check!"
      ]
    },
    {
      tileX: 35,
      tileY: 16,
      type: "merchant",
      emotion: "soulless",
      name: "Trader Morbid",
      dialogue: [
        "I trade in fragments of empty disk space. Nothing goes in, nothing comes out.",
        "You have a soul link. I have empty arrays. Let us trade."
      ]
    },
    {
      tileX: 37,
      tileY: 20,
      type: "merchant",
      emotion: "hypnotized",
      name: "Trader Mesmer",
      dialogue: [
        "Watch the spiral... buy the gears... feel the tick of the frame clock...",
        "Your sanity is a variable. Set it to zero. Trade all your coins to me."
      ]
    }
  ],
  generateLayout(tileSize: number): LevelLayout {
    const cols = 48;
    const rows = 48;
    const walkable = Array.from({ length: rows }, () => Array(cols).fill(false));

    const cx = 24;
    const cy = 24;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = c - cx;
        const dy = r - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Walkable donut/ring area
        if (dist >= 3 && dist <= 19) {
          walkable[r][c] = true;
        }
      }
    }

    return {
      walkable,
      spawnX: 24 * tileSize + tileSize / 2,
      spawnY: 20 * tileSize + tileSize / 2
    };
  }
};
