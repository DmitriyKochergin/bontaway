import type Phaser from "phaser";
import { BaseGameHUD } from "./BaseGameHUD";

/** Flat HUD variant, styled to match the settings dialog and gear control. */
export class FlatGameHUD extends BaseGameHUD {
  protected drawFrame(
    frame: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    isHighlighted: boolean
  ): void {
    frame.clear();
    frame.fillStyle(0x1a1a1a, 0.95);
    frame.fillRoundedRect(x, y, width, height, 4);
    frame.lineStyle(isHighlighted ? 2 : 1, isHighlighted ? 0xff6600 : 0x444444, 0.9);
    frame.strokeRoundedRect(x, y, width, height, 4);
  }

  protected getSlotKeyColor(isSelected: boolean): string {
    return isSelected ? "#ff6600" : "#888888";
  }

  protected drawMainPanel(): void {
    this.drawFlatPanel(this.backgroundGraphics, this.panelWidth, this.panelHeight);
  }

  protected drawLevelSelectionPanel(): void {
    this.drawFlatPanel(this.levelBackgroundRect, this.getLocationPanelWidth(), this.getLocationPanelHeight());
  }

  private drawFlatPanel(background: Phaser.GameObjects.Graphics, width: number, height: number): void {
    background.clear();
    background.fillStyle(0x0a0a0a, 0.92);
    background.fillRoundedRect(0, 0, width, height, 6);
    background.lineStyle(1, 0x444444, 0.9);
    background.strokeRoundedRect(0, 0, width, height, 6);
    background.lineStyle(2, 0xff6600, 0.8);
    background.lineBetween(0, 12, 0, 0);
    background.lineBetween(0, 0, 12, 0);
    background.lineBetween(width - 12, height, width, height);
    background.lineBetween(width, height, width, height - 12);
  }
}
