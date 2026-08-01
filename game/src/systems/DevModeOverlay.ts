import Phaser from "phaser";
import { DungeonSystem } from "./DungeonSystem";

export class DevModeOverlay {
  private scene: Phaser.Scene;
  private dungeonSystem: DungeonSystem;
  private container?: Phaser.GameObjects.Container;
  private fpsLabel?: Phaser.GameObjects.Text;
  private coordinateLabel?: Phaser.GameObjects.Text;
  private controlKey?: Phaser.Input.Keyboard.Key;
  private visible = false;
  private readonly hudInset = 16;

  constructor(scene: Phaser.Scene, dungeonSystem: DungeonSystem) {
    this.scene = scene;
    this.dungeonSystem = dungeonSystem;

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
    this.updateCoordinateLabel();
  }

  public destroy(): void {
    this.visible = false;
    this.container?.destroy(true);
    this.container = undefined;
    this.fpsLabel = undefined;
    this.coordinateLabel = undefined;
    this.controlKey = undefined;
  }

  private ensureCreated(): void {
    if (this.container) {
      return;
    }

    this.container = this.scene.add.container(0, 0);
    this.container.setDepth(1000);
    this.container.setScrollFactor(0);

    this.fpsLabel = this.createLabel("FPS: 0");
    this.coordinateLabel = this.createLabel();
    this.coordinateLabel.setOrigin(0, 0);
    this.coordinateLabel.setVisible(false);

    for (const label of [this.fpsLabel, this.coordinateLabel]) {
      label.setScrollFactor(0);
      this.container.add(label);
    }

    this.fpsLabel.setOrigin(0, 0);
    this.fpsLabel.setPosition(this.hudInset, this.hudInset);
  }

  private createLabel(value = ""): Phaser.GameObjects.Text {
    const label = this.scene.add.text(0, 0, value, {
      fontSize: "13px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: "#9efc9e",
      stroke: "#000000",
      strokeThickness: 2
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

  private updateCoordinateLabel(): void {
    if (!this.coordinateLabel) {
      return;
    }

    const pointer = this.scene.input.activePointer;
    this.controlKey ??= this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);

    if (!this.controlKey?.isDown || !pointer.active) {
      this.coordinateLabel.setVisible(false);
      return;
    }

    const camera = this.scene.cameras.main;

    if (pointer.x < 0 || pointer.x > camera.width || pointer.y < 0 || pointer.y > camera.height) {
      this.coordinateLabel.setVisible(false);
      return;
    }

    const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
    const tileSize = this.dungeonSystem.getTileSize();
    const totalColumns = this.dungeonSystem.getDungeonColumns();
    const totalRows = this.dungeonSystem.getDungeonRows();
    const column = Math.floor(worldPoint.x / tileSize);
    const row = Math.floor(worldPoint.y / tileSize);

    if (column < 0 || column >= totalColumns || row < 0 || row >= totalRows) {
      this.coordinateLabel.setVisible(false);
      return;
    }

    this.coordinateLabel.setText(`(${column}, ${row})`);
    this.coordinateLabel.setPosition(
      Phaser.Math.Clamp(pointer.x + 12, 8, camera.width - this.coordinateLabel.width - 8),
      Phaser.Math.Clamp(pointer.y + 12, 8, camera.height - this.coordinateLabel.height - 8)
    );
    this.coordinateLabel.setVisible(true);
  }
}
