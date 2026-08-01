import Phaser from "phaser";

export class SettingsButton {
  private button: Phaser.GameObjects.Container | null = null;
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onClick: () => void
  ) {}

  create(): void {
    this.destroy();

    const margin = 30;
    const x = this.scene.scale.width - margin;

    this.button = this.scene.add.container(x, margin);
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

    const gear = this.scene.add.image(0, 0, "gear").setScale(0.85);
    const hitArea = this.scene.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
    this.button.add([background, gear, hitArea]);

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
      this.button?.setPosition(gameSize.width - margin, margin);
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
}
