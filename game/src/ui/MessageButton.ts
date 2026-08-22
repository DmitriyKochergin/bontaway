import Phaser from "phaser";
import { SettingsManager } from "../systems/SettingsManager";

const MARGIN_Y = 30;
const MARGIN_RIGHT = 88;

/**
 * Chat button in the top-right, immediately left of the settings gear. Styled to match
 * SettingsButton (same carved backing + amber corner) with a drawn speech-bubble glyph, so no
 * new texture asset is required.
 */
export class MessageButton {
  private button: Phaser.GameObjects.Container | null = null;
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;
  private readonly buttonSize = 46;

  constructor(
    private scene: Phaser.Scene,
    private onClick: () => void
  ) {}

  create(): void {
    this.destroy();

    const x = this.scene.scale.width - MARGIN_RIGHT;
    const isStoneStyle = SettingsManager.getHudStyle() === "stone";

    this.button = this.scene.add.container(x, MARGIN_Y);
    this.button.setScrollFactor(0);
    this.button.setDepth(300);

    const background = this.scene.add.graphics();
    if (isStoneStyle) {
      this.drawStoneButtonFrame(background, false);
    } else {
      this.drawFlatButtonFrame(background);
    }

    const icon = this.scene.add.graphics();
    this.drawSpeechBubble(icon);

    const hitArea = this.scene.add.zone(0, 0, this.buttonSize, this.buttonSize).setInteractive({ useHandCursor: true });
    this.button.add([background, icon, hitArea]);

    hitArea.on("pointerover", () => {
      if (isStoneStyle) {
        this.drawStoneButtonFrame(background, true);
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
        this.drawStoneButtonFrame(background, false);
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
      }
    );

    this.resizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.button?.setPosition(gameSize.width - MARGIN_RIGHT, MARGIN_Y);
    };

    this.scene.scale.on("resize", this.resizeHandler);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    this.button?.destroy();
    this.button = null;
  }

  private drawSpeechBubble(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xe0e0e0, 1);
    g.fillRoundedRect(-11, -10, 22, 15, 4); // Bubble body.
    g.fillTriangle(-6, 4, -6, 12, 3, 4); // Tail.
    g.fillStyle(0x0a0a0a, 1); // Three "typing" dots punched out of the body.
    g.fillCircle(-5, -3, 1.7);
    g.fillCircle(0, -3, 1.7);
    g.fillCircle(5, -3, 1.7);
  }

  private drawFlatButtonFrame(background: Phaser.GameObjects.Graphics): void {
    const half = this.buttonSize / 2;
    background.clear();
    background.fillStyle(0x0a0a0a, 0.92);
    background.fillRoundedRect(-half, -half, this.buttonSize, this.buttonSize, 6);
    background.lineStyle(1, 0x444444, 0.9);
    background.strokeRoundedRect(-half, -half, this.buttonSize, this.buttonSize, 6);
    background.lineStyle(2, 0xff6600, 0.8);
    background.lineBetween(-half, -10, -half, -half);
    background.lineBetween(-half, -half, -10, -half);
  }

  private drawStoneButtonFrame(background: Phaser.GameObjects.Graphics, isHighlighted: boolean): void {
    const half = this.buttonSize / 2;
    background.clear();
    background.fillStyle(0x1c1d1f, 0.96);
    background.fillRoundedRect(-half, -half, this.buttonSize, this.buttonSize, 4);
    background.lineStyle(2, 0x73787c, 0.85);
    background.lineBetween(-half + 1, -half + 1, half - 1, -half + 1);
    background.lineBetween(-half + 1, -half + 1, -half + 1, half - 1);
    background.lineStyle(2, 0x0c0d0e, 0.95);
    background.lineBetween(-half + 1, half - 1, half - 1, half - 1);
    background.lineBetween(half - 1, -half + 1, half - 1, half - 1);

    if (isHighlighted) {
      background.lineStyle(1, 0xffbb33, 0.85);
      background.strokeRoundedRect(-half + 1, -half + 1, this.buttonSize - 2, this.buttonSize - 2, 4);
    }
  }
}
