import Phaser from "phaser";
import { MATRIX_EMPTY_TILE, MATRIX_FLOOR_TILE, MATRIX_ROOM_TILE, MATRIX_WALL_TILE } from "../levels/types";
import { DepthLayer } from "../types/depth-layer";
import type { LevelEditorSnapshot } from "./LevelEditorController";
import { DEFAULT_MATRIX_PALETTE } from "./MatrixEditing";

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
  private enabled = true;
  private destroyed = false;

  constructor(
    private scene: Phaser.Scene,
    private config: OverlayButtonConfig,
    parentContainer?: Phaser.GameObjects.Container
  ) {
    this.container = this.scene.add.container(config.x, config.y);
    this.container.setScrollFactor(0);
    if (parentContainer) {
      parentContainer.add(this.container);
    } else {
      this.container.setDepth(DepthLayer.EditorControl);
    }

    this.background = this.scene.add.graphics();
    this.label = this.scene.add.text(0, 0, config.label, {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#e7e7e7"
    });
    this.label.setOrigin(0.5, 0.5);

    this.hitArea = this.scene.add
      .zone(0, 0, config.width, config.height)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.container.add([this.background, this.label, this.hitArea]);
    this.redraw();

    this.hitArea.on("pointerover", () => {
      if (!this.enabled) return;
      this.hovered = true;
      this.redraw();
    });

    this.hitArea.on("pointerout", () => {
      if (!this.enabled) return;
      this.hovered = false;
      this.redraw();
    });

    this.hitArea.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        if (!this.enabled) return;
        event.stopPropagation();
        this.config.onClick();
      }
    );
  }

  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.redraw();
  }

  public setLabel(label: string): void {
    this.label.setText(label);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.hitArea.setInteractive({ useHandCursor: true });
      this.container.setAlpha(1.0);
    } else {
      this.hitArea.disableInteractive();
      this.container.setAlpha(0.45);
    }
    this.redraw();
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy(true);
  }

  private redraw(): void {
    const { width, height } = this.config;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.background.clear();

    if (!this.enabled) {
      this.background.fillStyle(0x0c0d10, 0.6);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1, 0x272b30, 0.5);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#6c727a");
      return;
    }

    if (this.active) {
      this.background.fillStyle(0x3d2b0e, 0.95);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1.5, 0xffa500, 1.0);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#ffca6e");
    } else if (this.hovered) {
      this.background.fillStyle(0x242830, 0.95);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1, 0x6e7682, 0.9);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#ffffff");
    } else {
      this.background.fillStyle(0x13161a, 0.9);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1, 0x343942, 0.85);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#d1d5db");
    }
  }
}

export class LevelEditorOverlay {
  private container?: Phaser.GameObjects.Container;
  private titleLabel?: Phaser.GameObjects.Text;
  private statusDot?: Phaser.GameObjects.Graphics;
  private statusLabel?: Phaser.GameObjects.Text;
  private paletteLabel?: Phaser.GameObjects.Text;
  private selectionLabel?: Phaser.GameObjects.Text;
  private hoverLabel?: Phaser.GameObjects.Text;
  private saveStatusLabel?: Phaser.GameObjects.Text;
  private resizeHandler?: (gameSize: Phaser.Structs.Size) => void;

  private closeButton?: OverlayButton;
  private saveButton?: OverlayButton;

  private paletteButtons = new Map<number, OverlayButton>();
  private visible = false;
  private destroyed = false;

  private readonly panelWidth = 400;
  private readonly panelHeight = 356;
  private readonly leftMargin = 20;

  constructor(
    private scene: Phaser.Scene,
    private onToggleActive: () => void,
    private onPaletteSelected: (tileValue: number) => void,
    private onSave: () => void
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

    // Active Status Dot & Label
    if (this.statusDot) {
      this.statusDot.clear();
      this.statusDot.fillStyle(snapshot.enabled ? 0x22c55e : 0x6b7280, 1);
      this.statusDot.fillCircle(146, 21, 4);
    }
    this.statusLabel?.setText(snapshot.enabled ? "ACTIVE" : "IDLE");
    this.statusLabel?.setColor(snapshot.enabled ? "#4ade80" : "#9ca3af");

    // Action Buttons
    this.saveButton?.setLabel(snapshot.saving ? "Saving..." : snapshot.dirty ? "Save *" : "Save");
    this.saveButton?.setActive(snapshot.dirty);

    // Palette
    const isMatrix = snapshot.matrixReady;

    for (const button of this.paletteButtons.values()) {
      button.setVisible(this.visible && isMatrix);
      button.setEnabled(snapshot.enabled && isMatrix);
    }

    // Selection Readout
    if (snapshot.selection) {
      const b = snapshot.selection.bounds;
      const w = b.right - b.left + 1;
      const h = b.bottom - b.top + 1;
      this.selectionLabel?.setText(`Selection: Rect (${b.left},${b.top}) → (${b.right},${b.bottom}) [${w}×${h}]`);
    } else {
      this.selectionLabel?.setText("Selection: None");
    }

    // Hover Readout
    const hoverStr = snapshot.hoveredCell
      ? `Cell (${snapshot.hoveredCell.column}, ${snapshot.hoveredCell.row})`
      : "None";
    this.hoverLabel?.setText(`Hover: ${hoverStr}`);

    // Save Status Readout
    if (snapshot.saveError) {
      this.saveStatusLabel?.setText(`Error: ${snapshot.saveError}`);
      this.saveStatusLabel?.setColor("#ef4444");
    } else if (snapshot.saving) {
      this.saveStatusLabel?.setText("Status: Saving to level file...");
      this.saveStatusLabel?.setColor("#f59e0b");
    } else if (snapshot.dirty) {
      this.saveStatusLabel?.setText("Status: Unsaved modifications *");
      this.saveStatusLabel?.setColor("#fbbf24");
    } else {
      this.saveStatusLabel?.setText("Status: All changes saved");
      this.saveStatusLabel?.setColor("#10b981");
    }

    if (this.visible) {
      this.container?.setVisible(true);
      this.setInteractiveState(true);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.paletteButtons.forEach(button => {
      button.destroy();
    });
    this.paletteButtons.clear();

    this.closeButton?.destroy();
    this.saveButton?.destroy();

    this.container?.destroy(true);
    this.container = undefined;
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
      this.resizeHandler = undefined;
    }
    this.visible = false;
  }

  private ensureCreated(): void {
    if (this.container) return;

    this.container = this.scene.add.container(
      this.leftMargin,
      Math.max(this.leftMargin, this.scene.scale.gameSize.height - this.panelHeight - this.leftMargin)
    );
    this.container.setScrollFactor(0);
    this.container.setDepth(DepthLayer.EditorPanel);
    this.resizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.container?.setPosition(
        this.leftMargin,
        Math.max(this.leftMargin, gameSize.height - this.panelHeight - this.leftMargin)
      );
    };
    this.scene.scale.on("resize", this.resizeHandler);

    const margin = this.leftMargin; // 20px uniform left margin
    const rightEdge = this.panelWidth - margin; // 380px uniform right edge

    // Frame panel background with carved dark glassmorphism styling
    const background = this.scene.add.graphics();
    background.fillStyle(0x0a0c0f, 0.94);
    background.fillRoundedRect(0, 0, this.panelWidth, this.panelHeight, 8);
    background.lineStyle(1.5, 0x383e47, 0.9);
    background.strokeRoundedRect(0, 0, this.panelWidth, this.panelHeight, 8);

    // Top amber accent border line
    background.lineStyle(2, 0xff9900, 0.85);
    background.lineBetween(10, 1, this.panelWidth - 10, 1);

    // Section Dividers (aligned with 20px left & right margins)
    background.lineStyle(1, 0x22262c, 0.8);
    background.lineBetween(margin, 42, rightEdge, 42); // Header divider
    background.lineBetween(margin, 84, rightEdge, 84); // Actions divider
    background.lineBetween(margin, 222, rightEdge, 222); // Palette divider

    // Inspector Inset Card Background (aligned with 20px left & right margins)
    background.fillStyle(0x050608, 0.9);
    background.fillRoundedRect(margin, 234, rightEdge - margin, 78, 6);
    background.lineStyle(1, 0x22262c, 0.9);
    background.strokeRoundedRect(margin, 234, rightEdge - margin, 78, 6);

    // Header Title (aligned at left margin: 20px)
    this.titleLabel = this.scene.add.text(margin, 13, "LEVEL EDITOR", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#ffb648"
    });

    // Status Indicator Dot & Text
    this.statusDot = this.scene.add.graphics();
    this.statusLabel = this.scene.add.text(156, 13, "ACTIVE", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#4ade80"
    });

    // Section Headers (aligned at left margin: 20px)
    this.paletteLabel = this.scene.add.text(margin, 90, "TILE PALETTE", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#727a85"
    });

    // Inspector Readouts (aligned padded at 32px inside card)
    this.selectionLabel = this.scene.add.text(margin + 12, 241, "Selection: None", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "11px",
      color: "#e5e7eb"
    });

    this.hoverLabel = this.scene.add.text(margin + 12, 262, "Hover: None", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "11px",
      color: "#9ca3af"
    });

    this.saveStatusLabel = this.scene.add.text(margin + 12, 286, "Status: All changes saved", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#10b981"
    });

    // Shortcuts Footer Bar
    const shortcutsText = this.scene.add.text(this.panelWidth / 2, 330, "Drag to select  |  Click palette to apply", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "9px",
      color: "#5b626d"
    });
    shortcutsText.setOrigin(0.5, 0.5);

    this.container.add([
      background,
      this.titleLabel,
      this.statusDot,
      this.statusLabel,
      this.paletteLabel,
      this.selectionLabel,
      this.hoverLabel,
      this.saveStatusLabel,
      shortcutsText
    ]);

    // Close Button (top-right X)
    this.closeButton = new OverlayButton(
      this.scene,
      {
        x: rightEdge - 13,
        y: 21,
        width: 26,
        height: 24,
        label: "✕",
        onClick: this.onToggleActive
      },
      this.container
    );

    // Save button (Y: 62).
    this.saveButton = new OverlayButton(
      this.scene,
      { x: margin + 57, y: 62, width: 114, height: 28, label: "Save", onClick: this.onSave },
      this.container
    );
    // Tile Palette Buttons (Matrix Mode) - 3 buttons per row.
    const paletteTiles = [...DEFAULT_MATRIX_PALETTE];
    const tileNames: Record<number, string> = {
      [MATRIX_EMPTY_TILE]: "Empty",
      [MATRIX_WALL_TILE]: "Wall",
      [MATRIX_FLOOR_TILE]: "Floor",
      [MATRIX_ROOM_TILE]: "Room"
    };

    paletteTiles.forEach((tileValue, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const bx = margin + 57 + column * 123;
      const by = 120 + row * 34;
      this.paletteButtons.set(
        tileValue,
        new OverlayButton(
          this.scene,
          {
            x: bx,
            y: by,
            width: 114,
            height: 28,
            label: tileNames[tileValue] ?? `Tile ${tileValue}`,
            onClick: () => this.onPaletteSelected(tileValue)
          },
          this.container
        )
      );
    });

    this.hide();
  }

  private setInteractiveState(enabled: boolean): void {
    for (const button of [this.closeButton, this.saveButton]) {
      button?.setEnabled(enabled);
      button?.setVisible(this.visible);
    }
  }
}
