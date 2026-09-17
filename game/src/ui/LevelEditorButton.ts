import Phaser from "phaser";
import { SettingsManager } from "../systems/SettingsManager";

const MARGIN_Y = 30;

/**
 * Level Editor button in the top-right HUD, positioned immediately left of the Message button.
 * Styled to match SettingsButton and MessageButton (carved stone / flat frame with hover animations).
 */
export class LevelEditorButton {
  private button: Phaser.GameObjects.Container | null = null;
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;
  private readonly buttonSize = 46;

  constructor(
    private scene: Phaser.Scene,
    private getMarginRight: () => number,
    private onClick: () => void,
    private isEditorActive: () => boolean = () => false
  ) {}

  create(): void {
    this.destroy();

    const marginRight = this.getMarginRight();
    const x = this.scene.scale.width - marginRight;
    const isStoneStyle = SettingsManager.getHudStyle() === "stone";
    const isActive = this.isEditorActive();

    this.button = this.scene.add.container(x, MARGIN_Y);
    this.button.setScrollFactor(0);
    this.button.setDepth(300);

    const background = this.scene.add.graphics();
    if (isStoneStyle) {
      this.drawStoneButtonFrame(background, false, isActive);
    } else {
      this.drawFlatButtonFrame(background, isActive);
    }

    const icon = this.scene.add.graphics();
    this.drawEditorIcon(icon, isActive);

    const hitArea = this.scene.add.zone(0, 0, this.buttonSize, this.buttonSize).setInteractive({ useHandCursor: true });
    this.button.add([background, icon, hitArea]);

    hitArea.on("pointerover", () => {
      if (isStoneStyle) {
        this.drawStoneButtonFrame(background, true, this.isEditorActive());
      } else {
        this.scene.tweens.add({
          targets: this.button,
          scale: 1.25,
          duration: 150,
          ease: "Back.easeOut"
        });
      }
    });

    hitArea.on("pointerout", () => {
      if (isStoneStyle) {
        this.drawStoneButtonFrame(background, false, this.isEditorActive());
      } else {
        this.scene.tweens.add({
          targets: this.button,
          scale: 1.0,
          duration: 150,
          ease: "Power2.easeOut"
        });
      }
    });

    hitArea.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.onClick();
        this.updateState();
      }
    );

    this.resizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.button?.setPosition(gameSize.width - this.getMarginRight(), MARGIN_Y);
    };

    this.scene.scale.on("resize", this.resizeHandler);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  public updatePosition(): void {
    if (this.button) {
      this.button.setPosition(this.scene.scale.width - this.getMarginRight(), MARGIN_Y);
    }
  }

  public updateState(): void {
    if (!this.button) {
      return;
    }

    const isStoneStyle = SettingsManager.getHudStyle() === "stone";
    const isActive = this.isEditorActive();

    const background = this.button.list[0] as Phaser.GameObjects.Graphics;
    const icon = this.button.list[1] as Phaser.GameObjects.Graphics;

    if (background) {
      if (isStoneStyle) {
        this.drawStoneButtonFrame(background, false, isActive);
      } else {
        this.drawFlatButtonFrame(background, isActive);
      }
    }

    if (icon) {
      this.drawEditorIcon(icon, isActive);
    }
  }

  destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    this.button?.destroy();
    this.button = null;
  }

  /**
   * Draws a pencil / grid blueprint icon representing level editing.
   */
  private drawEditorIcon(g: Phaser.GameObjects.Graphics, isActive: boolean): void {
    g.clear();

    const baseColor = isActive ? 0xffbb33 : 0xe0e0e0;
    const accentColor = isActive ? 0xff6600 : 0x8f959d;

    // Grid blueprint box (2x2 grid)
    g.lineStyle(1.5, accentColor, 0.85);
    g.strokeRoundedRect(-10, -10, 20, 20, 3);
    g.lineBetween(0, -10, 0, 10);
    g.lineBetween(-10, 0, 10, 0);

    // Diagonal edit stylus / pencil across the grid
    g.fillStyle(baseColor, 1);
    g.lineStyle(1.5, baseColor, 1);

    // Pencil tip at bottom-left, eraser/top at top-right
    g.beginPath();
    g.moveTo(-7, 7);
    g.lineTo(-3, 8);
    g.lineTo(-8, 3);
    g.closePath();
    g.fillPath();

    g.lineStyle(3, baseColor, 1);
    g.lineBetween(-5, 5, 6, -6);

    // Small highlight node on top right
    g.fillStyle(accentColor, 1);
    g.fillCircle(7, -7, 2);
  }

  private drawFlatButtonFrame(background: Phaser.GameObjects.Graphics, isActive: boolean): void {
    const half = this.buttonSize / 2;
    background.clear();
    background.fillStyle(isActive ? 0x221a08 : 0x0a0a0a, 0.92);
    background.fillRoundedRect(-half, -half, this.buttonSize, this.buttonSize, 6);
    background.lineStyle(1, isActive ? 0xffa500 : 0x444444, 0.9);
    background.strokeRoundedRect(-half, -half, this.buttonSize, this.buttonSize, 6);
    background.lineStyle(2, 0xff6600, isActive ? 1 : 0.8);
    background.lineBetween(-half, -10, -half, -half);
    background.lineBetween(-half, -half, -10, -half);
  }

  private drawStoneButtonFrame(background: Phaser.GameObjects.Graphics, isHighlighted: boolean, isActive: boolean): void {
    const half = this.buttonSize / 2;
    background.clear();
    background.fillStyle(isActive ? 0x2b2214 : 0x1c1d1f, 0.96);
    background.fillRoundedRect(-half, -half, this.buttonSize, this.buttonSize, 4);
    background.lineStyle(2, isActive ? 0x9e7930 : 0x73787c, 0.85);
    background.lineBetween(-half + 1, -half + 1, half - 1, -half + 1);
    background.lineBetween(-half + 1, -half + 1, -half + 1, half - 1);
    background.lineStyle(2, 0x0c0d0e, 0.95);
    background.lineBetween(-half + 1, half - 1, half - 1, half - 1);
    background.lineBetween(half - 1, -half + 1, half - 1, half - 1);

    if (isHighlighted || isActive) {
      background.lineStyle(1, 0xffbb33, isHighlighted ? 0.95 : 0.6);
      background.strokeRoundedRect(-half + 1, -half + 1, this.buttonSize - 2, this.buttonSize - 2, 4);
    }
  }
}
