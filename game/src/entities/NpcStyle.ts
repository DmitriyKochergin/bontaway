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
  /**
   * When false, eyebrow and extra face detail overlays (tears, blush, spirals…)
   * are skipped entirely. Useful for stripped-down "eyes only" looks.
   * Defaults to true.
   */
  showBrows?: boolean;
}

export const DEFAULT_NPC_STYLE: NpcStyle = {
  bodyColor: 0x777777,
  eyeColor: 0x111111,
  eyeSize: 4.5,
  eyeSpread: 5,
  showBrows: true
};

export function resolveNpcStyle(styleInput?: Partial<NpcStyle>): NpcStyle {
  return {
    bodyColor: styleInput?.bodyColor ?? DEFAULT_NPC_STYLE.bodyColor,
    eyeColor: styleInput?.eyeColor ?? DEFAULT_NPC_STYLE.eyeColor,
    eyeSize: styleInput?.eyeSize ?? DEFAULT_NPC_STYLE.eyeSize,
    eyeSpread: styleInput?.eyeSpread ?? DEFAULT_NPC_STYLE.eyeSpread,
    showBrows: styleInput?.showBrows ?? DEFAULT_NPC_STYLE.showBrows
  };
}
