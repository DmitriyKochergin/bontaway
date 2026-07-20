import Phaser from "phaser";

export class SettingsButton {
  private button: Phaser.GameObjects.Image | null = null;
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onClick: () => void
  ) {}

  create(): void {
    this.destroy();

    const margin = 30;
    const x = this.scene.scale.width - margin;

    this.button = this.scene.add.image(x, margin, "gear");
    this.button.setScrollFactor(0);
    this.button.setDepth(300);
    this.button.setInteractive({ useHandCursor: true });

    this.button.on("pointerover", () => {
      this.scene.tweens.add({
        targets: this.button,
        scale: 1.25,
        angle: 45,
        duration: 150,
        ease: "Back.easeOut"
      });
    });

    this.button.on("pointerout", () => {
      this.scene.tweens.add({
        targets: this.button,
        scale: 1.0,
        angle: 0,
        duration: 150,
        ease: "Power2.easeOut"
      });
    });

    this.button.on(
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

