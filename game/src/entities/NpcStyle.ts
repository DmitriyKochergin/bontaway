import { type NpcType } from "./NPC";

/**
 * Visual identity of an NPC — everything that belongs to the character's
 * *appearance*, independent of how it currently feels.
 *
 * body color ─── who they are
 * eye color  ─┐
 * eye size   ─┤ how their eyes naturally look
 * eye spread ─┘
 */
export interface NpcStyle {
  /** Fill color of the circular body. */
  bodyColor: number;
  /** Color used to render the iris/pupil of each eye. */
  eyeColor: number;
  /**
   * Vertical extent of the eye shape at rest (open).
   * Used as the `h` parameter for rounded-rect eyes or as a radius reference
   * for circular/arc eyes.
   */
  eyeSize: number;
  /**
   * Half-distance between the centres of the two eyes.
   * A higher value places eyes wider apart on the face.
   */
  eyeSpread: number;
}

/** Canonical style for each built-in NPC archetype. */
export const NPC_STYLES: Record<NpcType, NpcStyle> = {
  scholar:  { bodyColor: 0x3b3a6d, eyeColor: 0xffd700, eyeSize: 4.5, eyeSpread: 4 },
  guard:    { bodyColor: 0x555c65, eyeColor: 0x00f0ff, eyeSize: 4.0, eyeSpread: 5 },
  wanderer: { bodyColor: 0x111111, eyeColor: 0xff2222, eyeSize: 3.5, eyeSpread: 3 },
  merchant: { bodyColor: 0x8c5d31, eyeColor: 0x7cfc00, eyeSize: 4.5, eyeSpread: 4 },
};
