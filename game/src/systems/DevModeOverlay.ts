import Phaser from "phaser";
import { DungeonSystem } from "./DungeonSystem";

export class DevModeOverlay {
  private scene: Phaser.Scene;
  private dungeonSystem: DungeonSystem;
  private container?: Phaser.GameObjects.Container;
  private fpsLabel?: Phaser.GameObjects.Text;
  private topLabels: Phaser.GameObjects.Text[] = [];
  private bottomLabels: Phaser.GameObjects.Text[] = [];
  private leftLabels: Phaser.GameObjects.Text[] = [];
  private rightLabels: Phaser.GameObjects.Text[] = [];
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

    const camera = this.scene.cameras.main;
    const tileSize = this.dungeonSystem.getTileSize();
    const worldView = camera.worldView;
    const startColumn = Math.floor(worldView.left / tileSize);
    const startRow = Math.floor(worldView.top / tileSize);

    this.updateHorizontalAxisLabels(this.topLabels, startColumn, worldView.x, 8, camera.width);
    this.updateHorizontalAxisLabels(this.bottomLabels, startColumn, worldView.x, camera.height - 8, camera.width);
    this.updateVerticalAxisLabels(this.leftLabels, startRow, worldView.y, 8, camera.height);
    this.updateVerticalAxisLabels(this.rightLabels, startRow, worldView.y, camera.width - 8, camera.height);
  }

  public destroy(): void {
    this.visible = false;
    this.container?.destroy(true);
    this.container = undefined;
    this.fpsLabel = undefined;
    this.topLabels = [];
    this.bottomLabels = [];
    this.leftLabels = [];
    this.rightLabels = [];
  }

  private ensureCreated(): void {
    if (this.container) {
      return;
    }

    this.container = this.scene.add.container(0, 0);
    this.container.setDepth(1000);
    this.container.setScrollFactor(0);

    const camera = this.scene.cameras.main;
    const tileSize = this.dungeonSystem.getTileSize();
    const columnsOnScreen = Math.ceil(camera.width / tileSize) + 1;
    const rowsOnScreen = Math.ceil(camera.height / tileSize) + 1;

    this.topLabels = this.createLabelStrip(columnsOnScreen);
    this.bottomLabels = this.createLabelStrip(columnsOnScreen);
    this.leftLabels = this.createLabelStrip(rowsOnScreen);
    this.rightLabels = this.createLabelStrip(rowsOnScreen);
    this.fpsLabel = this.createLabel("FPS: 0");

    for (const label of [this.fpsLabel, ...this.topLabels, ...this.bottomLabels, ...this.leftLabels, ...this.rightLabels]) {
      label.setScrollFactor(0);
      this.container.add(label);
    }

    this.fpsLabel.setOrigin(0, 0);
    this.fpsLabel.setPosition(this.hudInset, this.hudInset);
  }

  private createLabelStrip(count: number): Phaser.GameObjects.Text[] {
    return Array.from({ length: count }, () => this.createLabel());
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

  private updateHorizontalAxisLabels(
    labels: Phaser.GameObjects.Text[],
    startColumn: number,
    worldViewX: number,
    y: number,
    cameraWidth: number
  ): void {
    const tileSize = this.dungeonSystem.getTileSize();
    const totalColumns = this.dungeonSystem.getDungeonColumns();

    for (let index = 0; index < labels.length; index++) {
      const column = startColumn + index;
      const label = labels[index];

      if (column < 0 || column >= totalColumns) {
        label.setVisible(false);
        continue;
      }

      const worldX = column * tileSize + tileSize / 2;
      const screenX = Phaser.Math.Clamp(worldX - worldViewX, 8, cameraWidth - 8);

      label.setText(`${column}`);
      label.setPosition(screenX, y);
      label.setVisible(true);
    }
  }

  private updateVerticalAxisLabels(
    labels: Phaser.GameObjects.Text[],
    startRow: number,
    worldViewY: number,
    x: number,
    cameraHeight: number
  ): void {
    const tileSize = this.dungeonSystem.getTileSize();
    const totalRows = this.dungeonSystem.getDungeonRows();

    for (let index = 0; index < labels.length; index++) {
      const row = startRow + index;
      const label = labels[index];

      if (row < 0 || row >= totalRows) {
        label.setVisible(false);
        continue;
      }

      const worldY = row * tileSize + tileSize / 2;
      const screenY = Phaser.Math.Clamp(worldY - worldViewY, 8, cameraHeight - 8);

      label.setText(`${row}`);
      label.setPosition(x, screenY);
      label.setVisible(true);
    }
  }
}
