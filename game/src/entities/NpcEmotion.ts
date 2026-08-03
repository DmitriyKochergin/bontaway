/**
 * All valid emotional states an NPC can express.
 *
 * Emotions are *separate* from NpcStyle — they modify eye shape and add
 * extra face elements (eyebrows, tears, blush, spirals…) on top of the
 * base style, without altering body color or eye color.
 */
export type NpcEmotion =
  | "neutral"
  | "angry"
  | "sad"
  | "happy"
  | "surprised"
  | "fear"
  | "disgusted"
  | "suspicious"
  | "sleepy"
  | "bored"
  | "excited"
  | "confused"
  | "proud"
  | "devastated"
  | "manic"
  | "smug"
  | "determined"
  | "shy"
  | "pleading"
  | "soulless"
  | "hypnotized";

/** Ordered list of all emotions — used for texture pre-generation loops. */
export const NPC_EMOTIONS: NpcEmotion[] = [
  "neutral",
  "angry",
  "sad",
  "happy",
  "surprised",
  "fear",
  "disgusted",
  "suspicious",
  "sleepy",
  "bored",
  "excited",
  "confused",
  "proud",
  "devastated",
  "manic",
  "smug",
  "determined",
  "shy",
  "pleading",
  "soulless",
  "hypnotized",
];
