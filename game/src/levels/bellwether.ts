import type { LevelDefinition, LevelLayout } from "./types";

export const bellwetherLevel: LevelDefinition = {
  id: "bellwether",
  name: "The Bellwether",
  columns: 48,
  rows: 48,
  fogOfWarEnabled: true,
  doors: [],
  hostileSpawnConfig: {
    initialDelayMs: 3500,
    baseIntervalMs: 5000,
    minimumIntervalMs: 900,
    intervalRampMs: 10000,
    intervalDecreaseMs: 800,
    initialMaxHostiles: 12,
    maximumHostiles: 40
  },
  hostileSpawnPoints: [
    { tileX: 6.5, tileY: 6.5 },
    { tileX: 18.5, tileY: 6.5 },
    { tileX: 30.5, tileY: 6.5 },
    { tileX: 41.5, tileY: 6.5 },
    { tileX: 6.5, tileY: 18.5 },
    { tileX: 41.5, tileY: 18.5 },
    { tileX: 6.5, tileY: 29.5 },
    { tileX: 41.5, tileY: 29.5 },
    { tileX: 6.5, tileY: 41.5 },
    { tileX: 18.5, tileY: 41.5 },
    { tileX: 30.5, tileY: 41.5 },
    { tileX: 41.5, tileY: 41.5 }
  ],
  obstacles: [
    { tileX: 20.5, tileY: 20.5, width: 32, height: 32 },
    { tileX: 27.5, tileY: 20.5, width: 32, height: 32 },
    { tileX: 20.5, tileY: 27.5, width: 32, height: 32 },
    { tileX: 27.5, tileY: 27.5, width: 32, height: 32 },
    { tileX: 24, tileY: 15, width: 32, height: 32 },
    { tileX: 24, tileY: 33, width: 32, height: 32 },
    { tileX: 15, tileY: 24, width: 32, height: 32 },
    { tileX: 33, tileY: 24, width: 32, height: 32 }
  ],
  torches: [
    { tileX: 8, tileY: 8, lightRadius: 180 },
    { tileX: 40, tileY: 8, lightRadius: 180 },
    { tileX: 8, tileY: 40, lightRadius: 180 },
    { tileX: 40, tileY: 40, lightRadius: 180 },
    { tileX: 24, tileY: 24, radius: 11, lightRadius: 220 }
  ],
  npcs: [
    {
      tileX: 12.5,
      tileY: 12.5,
      name: "The Bellwether",
      dialogue: ["The bell rings when the last warm thing stops moving."],
      emotion: "manic",
      bodyColor: 0x4e1f3a,
      eyeColor: 0xffb000,
      eyeSize: 4.5,
      eyeSpread: 4,
      hostile: true,
      maxHealth: 110,
      movementSpeed: 30,
      contactDamage: 18,
      attackCooldownMs: 1100
    },
    {
      tileX: 36.5,
      tileY: 12.5,
      name: "Ash Scout",
      dialogue: ["Keep running. The dark is faster when you look at it."],
      emotion: "angry",
      bodyColor: 0x6d2d36,
      eyeColor: 0xff5d6c,
      eyeSize: 4,
      eyeSpread: 4,
      hostile: true,
      maxHealth: 52,
      movementSpeed: 72,
      contactDamage: 9,
      attackCooldownMs: 700
    },
    {
      tileX: 11.5,
      tileY: 32.5,
      name: "The Listener",
      dialogue: ["Your footsteps are already inside my ribs."],
      emotion: "suspicious",
      bodyColor: 0x233d57,
      eyeColor: 0x75d8ff,
      eyeSize: 3.5,
      eyeSpread: 4,
      hostile: true,
      maxHealth: 72,
      movementSpeed: 48,
      contactDamage: 12,
      attackCooldownMs: 850
    },
    {
      tileX: 37.5,
      tileY: 32.5,
      name: "Red Choir",
      dialogue: ["One voice is a warning. Six voices are a door."],
      emotion: "determined",
      bodyColor: 0x572a2a,
      eyeColor: 0xffd5a3,
      eyeSize: 4,
      eyeSpread: 4,
      hostile: true,
      maxHealth: 66,
      movementSpeed: 54,
      contactDamage: 11,
      attackCooldownMs: 800
    },
    {
      tileX: 24.5,
      tileY: 9.5,
      name: "The Quiet One",
      dialogue: ["Do not wake the room beneath the room."],
      emotion: "soulless",
      bodyColor: 0x15151c,
      eyeColor: 0xff2222,
      eyeSize: 3.5,
      eyeSpread: 3,
      hostile: true,
      maxHealth: 88,
      movementSpeed: 38,
      contactDamage: 15,
      attackCooldownMs: 1000
    },
    {
      tileX: 24.5,
      tileY: 39.5,
      name: "The Door-Keeper",
      dialogue: ["You brought a key made of light. I will take it from your hands."],
      emotion: "proud",
      bodyColor: 0x6b4b28,
      eyeColor: 0x7cfc00,
      eyeSize: 4,
      eyeSpread: 4,
      hostile: true,
      maxHealth: 78,
      movementSpeed: 44,
      contactDamage: 13,
      attackCooldownMs: 900
    },
    {
      tileX: 8.5,
      tileY: 24.5,
      name: "Graveweight",
      dialogue: ["The floor remembers every body it has carried."],
      emotion: "soulless",
      bodyColor: 0x292d35,
      eyeColor: 0xff8a66,
      eyeSize: 5,
      eyeSpread: 5,
      hostile: true,
      maxHealth: 1100,
      movementSpeed: 18,
      contactDamage: 28,
      attackCooldownMs: 1300,
      bodyScale: 1.8
    },
    {
      tileX: 39.5,
      tileY: 24.5,
      name: "Coffin Saint",
      dialogue: ["Kneel. The weight is almost kind."],
      emotion: "proud",
      bodyColor: 0x3e3130,
      eyeColor: 0xffc857,
      eyeSize: 5,
      eyeSpread: 5,
      hostile: true,
      maxHealth: 780,
      movementSpeed: 22,
      contactDamage: 24,
      attackCooldownMs: 1150,
      bodyScale: 1.65
    },
    {
      tileX: 8.5,
      tileY: 12.5,
      name: "The Fuse",
      dialogue: ["Closer. Closer. Closer."],
      emotion: "manic",
      bodyColor: 0x7d2634,
      eyeColor: 0xfff0a3,
      eyeSize: 3,
      eyeSpread: 3,
      hostile: true,
      maxHealth: 36,
      movementSpeed: 176,
      contactDamage: 0,
      attackCooldownMs: 500,
      bodyScale: 0.8,
      explodesOnContact: true,
      explosionDamage: 36
    },
    {
      tileX: 39.5,
      tileY: 39.5,
      name: "The Red Sprint",
      dialogue: ["Do not let me touch you."],
      emotion: "angry",
      bodyColor: 0xa53b3b,
      eyeColor: 0xffffff,
      eyeSize: 3,
      eyeSpread: 3,
      hostile: true,
      maxHealth: 44,
      movementSpeed: 158,
      contactDamage: 0,
      attackCooldownMs: 500,
      bodyScale: 0.86,
      explodesOnContact: true,
      explosionDamage: 44
    }
  ],
  generateLayout(tileSize: number): LevelLayout {
    const walkable = Array.from({ length: 48 }, () => Array(48).fill(false));
    const border = 4;

    for (let row = border; row < 48 - border; row++) {
      for (let column = border; column < 48 - border; column++) {
        walkable[row][column] = true;
      }
    }

    return {
      walkable,
      spawnX: 24 * tileSize + tileSize / 2,
      spawnY: 35 * tileSize + tileSize / 2
    };
  }
};
