import Phaser from "phaser";

const HEAD_OFFSET = 34; // Pixels above the entity's origin where the bubble's tail sits.
const DISPLAY_MS = 10000; // Message lingers this long, unless a newer one replaces it.
const MAX_WIDTH = 200;

/**
 * A short-lived line of text that hovers above a player (local or remote). World-space and
 * unlit, so it stays readable in the dark. Calling show() again resets the 10s timer, so a
 * fresh message simply replaces the old one.
 */
export class ChatBubble {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private hideTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.background = scene.add.graphics();
    this.label = scene.add
      .text(0, -HEAD_OFFSET, "", {
        fontSize: "13px",
        fontFamily: "Roboto Mono, Courier New, monospace",
        color: "#f2f2f2",
        align: "center",
        stroke: "#000000",
        strokeThickness: 3,
        wordWrap: { width: MAX_WIDTH }
      })
      .setOrigin(0.5, 1);

    this.container = scene.add.container(0, 0, [this.background, this.label]);
    this.container.setDepth(350); // Above players (300) and projectiles, below the screen HUD (400).
    this.container.setVisible(false);
  }

  show(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }

    this.label.setText(trimmed);
    this.redrawBackground();
    this.container.setVisible(true);

    this.hideTimer?.remove(false);
    this.hideTimer = this.scene.time.delayedCall(DISPLAY_MS, () => this.container.setVisible(false));
  }

  follow(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  destroy(): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.container.destroy(); // Also destroys the background + label children.
  }

  private redrawBackground(): void {
    const paddingX = 8;
    const paddingY = 5;
    const width = this.label.width + paddingX * 2;
    const height = this.label.height + paddingY * 2;
    const left = -width / 2;
    const top = -HEAD_OFFSET - this.label.height - paddingY;

    this.background.clear();
    this.background.fillStyle(0x0a0a0a, 0.82);
    this.background.fillRoundedRect(left, top, width, height, 5);
    this.background.lineStyle(1, 0x555555, 0.85);
    this.background.strokeRoundedRect(left, top, width, height, 5);
  }
}
