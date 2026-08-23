import Phaser from "phaser";
import { DEFAULT_MATRIX_PALETTE } from "./MatrixEditing";
import type { LevelEditorSnapshot, LevelEditorTool } from "./LevelEditorController";

interface OverlayButtonConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  onClick: () => void;
}

class OverlayButton {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hitArea: Phaser.GameObjects.Zone;
  private active = false;
  private hovered = false;
  private destroyed = false;

  constructor(private scene: Phaser.Scene, private config: OverlayButtonConfig) {
    this.container = this.scene.add.container(config.x, config.y);
    this.container.setScrollFactor(0);
    this.container.setDepth(1201);

    this.background = this.scene.add.graphics();
    this.label = this.scene.add.text(0, 0, config.label, {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "14px",
      color: "#e7e7e7"
    });
    this.label.setOrigin(0.5, 0.5);

    this.hitArea = this.scene.add.zone(0, 0, config.width, config.height).setInteractive({ useHandCursor: true });
    this.container.add([this.background, this.label, this.hitArea]);
    this.redraw();

    this.hitArea.on("pointerover", () => {
      this.hovered = true;
      this.redraw();
    });

    this.hitArea.on("pointerout", () => {
      this.hovered = false;
      this.redraw();
    });

    this.hitArea.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.config.onClick();
      }
    );
  }

  public setActive(active: boolean): void {
    this.active = active;
    this.redraw();
  }

  public setLabel(label: string): void {
    this.label.setText(label);
  }

  public setEnabled(enabled: boolean): void {
    if (enabled) {
      this.hitArea.setInteractive({ useHandCursor: true });
      return;
    }

    this.hitArea.disableInteractive();
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.container.destroy(true);
  }

  private redraw(): void {
    const { width, height } = this.config;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.background.clear();
    this.background.fillStyle(this.active ? 0x3b2b08 : this.hovered ? 0x202327 : 0x0d0f11, this.active ? 0.95 : 0.9);
    this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
    this.background.lineStyle(1, this.active ? 0xffb648 : 0x4d5359, this.active ? 1 : 0.8);
    this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
  }
}

export class LevelEditorOverlay {
  private container?: Phaser.GameObjects.Container;
  private titleLabel?: Phaser.GameObjects.Text;
  private stateLabel?: Phaser.GameObjects.Text;
  private paletteLabel?: Phaser.GameObjects.Text;
  private selectionLabel?: Phaser.GameObjects.Text;
  private hintLabel?: Phaser.GameObjects.Text;
  private activateButton?: OverlayButton;
  private toolButtons = new Map<LevelEditorTool, OverlayButton>();
  private paletteButtons = new Map<number, OverlayButton>();
  private visible = false;
  private destroyed = false;

  constructor(
    private scene: Phaser.Scene,
    private onToggleActive: () => void,
    private onToolSelected: (tool: LevelEditorTool) => void,
    private onPaletteSelected: (tileValue: number) => void
  ) {
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public show(): void {
    this.ensureCreated();
    this.visible = true;
    this.container?.setVisible(true);
    this.setInteractiveState(true);
  }

  public hide(): void {
    this.visible = false;
    this.container?.setVisible(false);
    this.setInteractiveState(false);
  }

  public update(snapshot: LevelEditorSnapshot): void {
    this.ensureCreated();

    this.activateButton?.setLabel(snapshot.enabled ? "Disable editor" : "Enable editor");
    this.activateButton?.setActive(snapshot.enabled);

    for (const [tool, button] of this.toolButtons) {
      button.setActive(snapshot.enabled && snapshot.tool === tool);
    }

    for (const [tileValue, button] of this.paletteButtons) {
      button.setActive(snapshot.paletteTile === tileValue);
      button.setLabel(String(tileValue));
    }

    this.stateLabel?.setText(
      snapshot.enabled
        ? `State: active  |  Tool: ${snapshot.tool}`
        : `State: idle  |  Toggle with Ctrl+E`
    );

    this.paletteLabel?.setText(
      snapshot.matrixReady
        ? `Palette: tile ${snapshot.paletteTile}  |  Clipboard: ${snapshot.hasClipboard ? "ready" : "empty"}`
        : `Palette: tile ${snapshot.paletteTile}  |  No matrix document attached`
    );

    const selectionText = snapshot.selection
      ? `Selection: ${snapshot.selection.bounds.left},${snapshot.selection.bounds.top} → ${snapshot.selection.bounds.right},${snapshot.selection.bounds.bottom}`
      : "Selection: none";

    const hoverText = snapshot.hoveredCell
      ? `Hover: ${snapshot.hoveredCell.column},${snapshot.hoveredCell.row}`
      : "Hover: none";

    this.selectionLabel?.setText(`${selectionText}\n${hoverText}`);
    this.hintLabel?.setText(
      "Shortcuts: Ctrl+E toggle | 1-6 tools | Ctrl+C/V/D copy paste duplicate | Delete clear selection | Click palette to paint"
    );

    if (this.visible) {
      this.container?.setVisible(true);
      this.setInteractiveState(true);
    }
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.toolButtons.forEach(button => button.destroy());
    this.toolButtons.clear();
    this.paletteButtons.forEach(button => button.destroy());
    this.paletteButtons.clear();
    this.activateButton?.destroy();
    this.activateButton = undefined;
    this.container?.destroy(true);
    this.container = undefined;
    this.titleLabel = undefined;
    this.stateLabel = undefined;
    this.paletteLabel = undefined;
    this.selectionLabel = undefined;
    this.hintLabel = undefined;
    this.visible = false;
  }

  private ensureCreated(): void {
    if (this.container) {
      return;
    }

    this.container = this.scene.add.container(16, 16);
    this.container.setScrollFactor(0);
    this.container.setDepth(1200);

    const background = this.scene.add.graphics();
    background.fillStyle(0x0f1115, 0.95);
    background.fillRoundedRect(0, 0, 340, 286, 10);
    background.lineStyle(1, 0x454b53, 0.95);
    background.strokeRoundedRect(0, 0, 340, 286, 10);

    this.titleLabel = this.scene.add.text(16, 12, "Level Editor", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#ffb648"
    });

    this.stateLabel = this.scene.add.text(16, 40, "State: idle", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "13px",
      color: "#d7d7d7"
    });

    this.selectionLabel = this.scene.add.text(16, 234, "Selection: none", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "12px",
      color: "#c7c7c7",
      lineSpacing: 4
    });

    this.paletteLabel = this.scene.add.text(16, 138, "Palette: tile 1", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "12px",
      color: "#c7c7c7"
    });

    this.hintLabel = this.scene.add.text(16, 256, "Shortcuts: Ctrl+E toggle | 1-6 tools | Ctrl+C/V/D copy paste duplicate | Delete clear selection | Click palette to paint", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "11px",
      color: "#8f959d",
      wordWrap: { width: 308 }
    });

    this.container.add([background, this.titleLabel, this.stateLabel, this.paletteLabel, this.selectionLabel, this.hintLabel]);

    this.activateButton = new OverlayButton(this.scene, {
      x: 274,
      y: 28,
      width: 92,
      height: 28,
      label: "Enable editor",
      onClick: this.onToggleActive
    });

    const toolButtons: Array<{ tool: LevelEditorTool; label: string; x: number; y: number }> = [
      { tool: "select", label: "Select", x: 16, y: 68 },
      { tool: "move", label: "Move", x: 122, y: 68 },
      { tool: "paint", label: "Paint", x: 228, y: 68 },
      { tool: "erase", label: "Erase", x: 16, y: 104 },
      { tool: "place", label: "Place", x: 122, y: 104 },
      { tool: "duplicate", label: "Duplicate", x: 228, y: 104 }
    ];

    for (const entry of toolButtons) {
      this.toolButtons.set(
        entry.tool,
        new OverlayButton(this.scene, {
          x: entry.x + 48,
          y: entry.y + 13,
          width: 96,
          height: 26,
          label: entry.label,
          onClick: () => this.onToolSelected(entry.tool)
        })
      );
    }

    const paletteTiles = [...DEFAULT_MATRIX_PALETTE];
    paletteTiles.forEach((tileValue, index) => {
      const columnIndex = index % 4;
      const rowIndex = Math.floor(index / 4);
      this.paletteButtons.set(
        tileValue,
        new OverlayButton(this.scene, {
          x: 16 + columnIndex * 76 + 28,
          y: 160 + rowIndex * 34 + 13,
          width: 56,
          height: 24,
          label: String(tileValue),
          onClick: () => this.onPaletteSelected(tileValue)
        })
      );
    });

    this.hide();
  }

  private setInteractiveState(enabled: boolean): void {
    this.activateButton?.setEnabled(enabled);
    this.activateButton?.setVisible(this.visible);

    for (const button of this.toolButtons.values()) {
      button.setEnabled(enabled);
      button.setVisible(this.visible);
    }

    for (const button of this.paletteButtons.values()) {
      button.setEnabled(enabled);
      button.setVisible(this.visible);
    }
  }
}
