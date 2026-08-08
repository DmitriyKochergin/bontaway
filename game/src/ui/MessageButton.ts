import Phaser from "phaser";

const MARGIN_Y = 30;
// Sits one 44px button + a 12px gap to the left of the settings gear (which uses a 30px margin).
const MARGIN_RIGHT = 86;

/**
 * Chat button in the top-right, immediately left of the settings gear. Styled to match
 * SettingsButton (same carved backing + amber corner) with a drawn speech-bubble glyph, so no
 * new texture asset is required.
 */
export class MessageButton {
  private button: Phaser.GameObjects.Container | null = null;
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onClick: () => void
  ) {}

  create(): void {
    this.destroy();

    const x = this.scene.scale.width - MARGIN_RIGHT;

    this.button = this.scene.add.container(x, MARGIN_Y);
    this.button.setScrollFactor(0);
    this.button.setDepth(300);

    const background = this.scene.add.graphics();
    background.fillStyle(0x0a0a0a, 0.92);
    background.fillRoundedRect(-22, -22, 44, 44, 6);
    background.lineStyle(1, 0x444444, 0.9);
    background.strokeRoundedRect(-22, -22, 44, 44, 6);
    background.lineStyle(2, 0xff6600, 0.8);
    background.lineBetween(-22, -10, -22, -22);
    background.lineBetween(-22, -22, -10, -22);

    const icon = this.scene.add.graphics();
    this.drawSpeechBubble(icon);

    const hitArea = this.scene.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
    this.button.add([background, icon, hitArea]);

    hitArea.on("pointerover", () => {
      this.scene.tweens.add({
        targets: this.button,
        scale: 1.25,
        duration: 150,
        ease: "Back.easeOut"
      });
    });

    hitArea.on("pointerout", () => {
      this.scene.tweens.add({
        targets: this.button,
        scale: 1.0,
        duration: 150,
        ease: "Power2.easeOut"
      });
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
}
