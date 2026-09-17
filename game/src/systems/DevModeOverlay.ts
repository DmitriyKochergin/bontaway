import Phaser from "phaser";
import { DungeonSystem } from "./DungeonSystem";

export class DevModeOverlay {
  private scene: Phaser.Scene;
  private container?: Phaser.GameObjects.Container;
  private fpsLabel?: Phaser.GameObjects.Text;
  private visible = false;
  private readonly hudInset = 16;

  constructor(scene: Phaser.Scene, _dungeonSystem: DungeonSystem) {
    this.scene = scene;

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public toggle(): void {
    if (this.visible) {
      this.hide();
      return;
    }

    this.show();
  }

  public show(): void {
    this.ensureCreated();
    this.visible = true;
    this.container?.setVisible(true);
    this.update();
  }

  public hide(): void {
    this.visible = false;
    this.container?.setVisible(false);
  }

  public update(): void {
    if (!this.visible || !this.container) {
      return;
    }

    this.updateFpsLabel();
  }

  public destroy(): void {
    this.visible = false;
    this.container?.destroy(true);
    this.container = undefined;
    this.fpsLabel = undefined;
  }

  private ensureCreated(): void {
    if (this.container) {
      return;
    }

    this.container = this.scene.add.container(0, 0);
    this.container.setDepth(1000);
    this.container.setScrollFactor(0);

    this.fpsLabel = this.createLabel("FPS: 0");
    this.fpsLabel.setScrollFactor(0);
    this.fpsLabel.setOrigin(0, 0);
    this.fpsLabel.setPosition(this.hudInset, this.hudInset);
    this.container.add(this.fpsLabel);
  }

  private createLabel(value = ""): Phaser.GameObjects.Text {
    const label = this.scene.add.text(0, 0, value, {
      fontSize: "20px",
      fontStyle: "bold",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: "#ff6600",
      stroke: "#000000",
      strokeThickness: 3
    });

    label.setOrigin(0.5, 0.5);
    return label;
  }

  private updateFpsLabel(): void {
    if (!this.fpsLabel) {
      return;
    }

    this.fpsLabel.setText(`FPS: ${Math.round(this.scene.game.loop.actualFps)}`);
  }
}
