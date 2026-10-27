import type Phaser from "phaser";
import { BaseGameHUD } from "./BaseGameHUD";

export type { GameHudController } from "./BaseGameHUD";

/**
 * Game HUD for Bontaway.
 * Displays available weapon options (slots/tiles) at the bottom.
 * Styled to look hand-carved, ancient stone (3D slate bevels, chiseled cracks, lava glow).
 */
export class StoneGameHUD extends BaseGameHUD {
  protected drawFrame(
    frame: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    isHighlighted: boolean
  ): void {
    this.drawStoneFrame(frame, x, y, width, height, isHighlighted, false);
  }

  protected getSlotKeyColor(isSelected: boolean): string {
    return isSelected ? "#ff7700" : "#888888";
  }

  /**
   * Helper to draw high-fidelity, hand-crafted beveled stone slate surfaces.
   * Leverages multi-layered border lighting, inner insets, and rough chisel markings.
   */
  private drawStoneFrame(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    isSelected: boolean,
    isCarvedInOut: boolean
  ): void {
    if (isCarvedInOut) {
      // Inset frame (deep carved stone pit)
      // 1. Dark hollow fill
      g.fillStyle(0x101113, 1);
      g.fillRect(x, y, w, h);

      // 2. Organic chiseled texture inside the carving
      let s = 101;
      const r = () => {
        const v = Math.sin(s++) * 10000;
        return v - Math.floor(v);
      };
      for (let i = 0; i < 15; i++) {
        const cx = x + 3 + Math.floor(r() * (w - 6));
        const cy = y + 3 + Math.floor(r() * (h - 6));
        g.fillStyle(0x050607, 0.6);
        g.fillRect(cx, cy, 3, 2);
      }

      // 3. Crisp inner shadows: deep cut pit bevels
      g.lineStyle(3, 0x050607, 1); // Dark bevel shadow
      g.lineBetween(x, y + 1, x + w, y + 1);
      g.lineBetween(x + 1, y, x + 1, y + h);

      g.lineStyle(1.5, 0x090a0c, 0.8);
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);

      // Top-left shadow bleed
      g.fillStyle(0x000000, 0.4);
      g.fillRect(x, y, w, 4);
      g.fillRect(x, y, 4, h);

      // Bottom-right inner highlights (the light catching the bottom wall of the carven pit)
      g.lineStyle(1.5, 0x3d4144, 0.7);
      g.lineBetween(x + 2, y + h - 1, x + w - 2, y + h - 1);
      g.lineBetween(x + w - 1, y + 2, x + w - 1, y + h - 2);
    } else {
      // Raised slate brick
      // 1. Base stone brick fill
      g.fillStyle(0x2d3134, 1);
      g.fillRect(x, y, w, h);

      // 2. Chiseled lines (horizontal fractured texture)
      g.fillStyle(0x232527, 0.6);
      g.fillRect(x + 2, y + h / 2 - 3, w - 4, 3);
      g.fillStyle(0x3e4245, 0.3);
      g.fillRect(x + 2, y + h / 2, w - 4, 1);

      // Deterministic texture noise inside raised brick
      let s = 202;
      const r = () => {
        const v = Math.sin(s++) * 10000;
        return v - Math.floor(v);
      };
      for (let i = 0; i < 18; i++) {
        const cx = x + 3 + Math.floor(r() * (w - 6));
        const cy = y + 3 + Math.floor(r() * (h - 6));
        const c = r() > 0.5 ? 0x1c1d1f : 0x555c60;
        g.fillStyle(c, r() > 0.5 ? 0.4 : 0.2);
        g.fillRect(cx, cy, r() > 0.5 ? 3 : 2, 2);
      }

      // 3. Thick 3D stone bevels
      // Raised/凸 tablet (highlights top/left, pitch-black shadow bottom/right)
      g.lineStyle(2, 0x73787c, 0.9); // Top lighting highlight
      g.lineBetween(x + 1, y + 1, x + w - 1, y + 1);
      g.lineBetween(x + 1, y + 1, x + 1, y + h - 1);

      g.lineStyle(2.5, 0x0c0d0e, 1.0); // Bottom deep drop shadow
      g.lineBetween(x + 1, y + h - 1, x + w - 1, y + h - 1);
      g.lineBetween(x + w - 1, y + 1, x + w - 1, y + h - 1);

      // Weathered notches inside borders (damaged brick details)
      g.lineStyle(1.5, 0x0f1011, 0.95);
      g.lineBetween(x + w - 12, y + 1, x + w - 10, y + 6); // notch crack
      g.lineStyle(1, 0x73787c, 0.4);
      g.lineBetween(x + w - 11, y + 1, x + w - 9, y + 6);
    }

    // 3. Selection border indicator (weathered iron border with gold/amber/bronze accent)
    if (isSelected) {
      g.lineStyle(2.5, 0xffbb33, 1);
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
      g.lineStyle(1, 0x995500, 0.8);
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  /**
   * Redraw the core stone backing panel frame that holds the list of hotbar slots.
   */
  protected drawMainPanel(): void {
    const g = this.backgroundGraphics;
    g.clear();

    const w = this.panelWidth;
    const h = this.panelHeight;

    // 1. Fill base dark obsidian / slate texture
    g.fillStyle(0x1c1d1f, 0.95);
    g.fillRoundedRect(0, 0, w, h, 6);

    // 2. Slate horizontal fracture layered textures (simulating split rock slabs)
    const slateLayers = 5;
    for (let i = 1; i < slateLayers; i++) {
      const yPos = (h / slateLayers) * i;
      g.fillStyle(0x121314, 0.35);
      g.fillRect(3, yPos, w - 6, 2);
      g.fillStyle(0x313437, 0.08);
      g.fillRect(3, yPos + 2, w - 6, 1);
    }

    // 3. Procedural chiseled fleck noise (completely deterministic via constant seed)
    let seed = 777;
    const pseudoRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 45; i++) {
      const fx = Math.floor(pseudoRandom() * (w - 12)) + 6;
      const fy = Math.floor(pseudoRandom() * (h - 12)) + 6;
      const fw = Math.floor(pseudoRandom() * 4) + 2;
      const fh = Math.floor(pseudoRandom() * 2) + 1;
      const isDark = pseudoRandom() > 0.45;
      g.fillStyle(isDark ? 0x0a0b0c : 0x5a5f64, isDark ? 0.3 : 0.12);
      g.fillRect(fx, fy, fw, fh);
    }

    // 4. Chipped edge notches directly on the stone plate borders
    g.fillStyle(0x0e0f10, 0.9); // dark cutout shadow
    g.fillRect(w - 18, 0, 5, 2);
    g.fillRect(24, h - 3, 6, 3);
    g.fillRect(0, 32, 2, 6);

    g.fillStyle(0x6e7275, 0.5); // highlighted rock corner catch
    g.fillRect(w - 18, 2, 5, 1);
    g.fillRect(24, h - 4, 6, 1);
    g.fillRect(2, 32, 1, 6);

    // 5. Chiseled beveled stone edge structure (Raised outline)
    g.lineStyle(2, 0x6e7275, 0.85); // Raised edge highlight (top and sides)
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 3);
    g.lineTo(3, 0);
    g.lineTo(w - 3, 0);
    g.lineTo(w, 3);
    g.lineTo(w, h);
    g.strokePath();

    g.lineStyle(2, 0x0c0d0e, 0.95); // Base shadow bottom
    g.lineBetween(0, h, w, h);

    // 6. Carved inner line track
    g.lineStyle(1.5, 0x111213, 0.7);
    g.strokeRoundedRect(5, 5, w - 10, h - 10, 4);

    // 7. Weathered/chipped stone cracks for the rustic SCP/liminal dark dungeon aesthetic
    g.lineStyle(1, 0x0a0b0c, 0.9);
    g.beginPath();
    g.moveTo(12, 5);
    g.lineTo(16, 22);
    g.lineTo(24, 25);
    g.strokePath();

    g.lineStyle(1, 0x6e7275, 0.35); // offset parallel highlights
    g.beginPath();
    g.moveTo(13, 5);
    g.lineTo(17, 22);
    g.lineTo(25, 25);
    g.strokePath();

    g.lineStyle(1, 0x0a0b0c, 0.9);
    g.beginPath();
    g.moveTo(w - 18, h - 5);
    g.lineTo(w - 22, h - 18);
    g.strokePath();

    g.lineStyle(1, 0x6e7275, 0.35);
    g.beginPath();
    g.moveTo(w - 17, h - 5);
    g.lineTo(w - 21, h - 18);
    g.strokePath();
  }

  protected drawLevelSelectionPanel(): void {
    const g = this.levelBackgroundRect;
    g.clear();

    const w = this.getLocationPanelWidth();
    const h = this.getLocationPanelHeight();

    // 1. Fill base dark obsidian / slate texture
    g.fillStyle(0x1c1d1f, 0.95);
    g.fillRoundedRect(0, 0, w, h, 6);

    // 2. Slate horizontal fracture layered textures (simulating split rock slabs)
    const slateLayers = 4;
    for (let i = 1; i < slateLayers; i++) {
      const yPos = (h / slateLayers) * i;
      g.fillStyle(0x121314, 0.35);
      g.fillRect(3, yPos, w - 6, 2);
      g.fillStyle(0x313437, 0.08);
      g.fillRect(3, yPos + 2, w - 6, 1);
    }

    // 3. Procedural chiseled fleck noise (completely deterministic via constant seed)
    let seed = 888;
    const pseudoRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 20; i++) {
      const fx = Math.floor(pseudoRandom() * (w - 12)) + 6;
      const fy = Math.floor(pseudoRandom() * (h - 12)) + 6;
      const fw = Math.floor(pseudoRandom() * 4) + 2;
      const fh = Math.floor(pseudoRandom() * 2) + 1;
      const isDark = pseudoRandom() > 0.45;
      g.fillStyle(isDark ? 0x0a0b0c : 0x5a5f64, isDark ? 0.3 : 0.12);
      g.fillRect(fx, fy, fw, fh);
    }

    // 5. Chiseled beveled stone edge structure (Raised outline)
    g.lineStyle(2, 0x6e7275, 0.85); // Raised edge highlight (top and sides)
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 3);
    g.lineTo(3, 0);
    g.lineTo(w - 3, 0);
    g.lineTo(w, 3);
    g.lineTo(w, h);
    g.strokePath();

    g.lineStyle(2, 0x0c0d0e, 0.95); // Base shadow bottom
    g.lineBetween(0, h, w, h);

    // 6. Carved inner line track
    g.lineStyle(1.5, 0x111213, 0.7);
    g.strokeRoundedRect(5, 5, w - 10, h - 10, 4);
  }
}
