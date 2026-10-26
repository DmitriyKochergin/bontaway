import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
import type { LevelEditorSnapshot, LevelEditorTool } from "./LevelEditorController";
import type { ObjectKind } from "./LevelObjectEditing";
import { DEFAULT_MATRIX_PALETTE } from "./MatrixEditing";

interface OverlayButtonConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  badge?: string;
  onClick: () => void;
}

class OverlayButton {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly badgeLabel?: Phaser.GameObjects.Text;
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
    if (parentContainer) {
      parentContainer.add(this.container);
    } else {
      this.container.setScrollFactor(0);
      this.container.setDepth(DepthLayer.EditorControl);
    }

    this.background = this.scene.add.graphics();
    this.label = this.scene.add.text(config.badge ? -6 : 0, 0, config.label, {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#e7e7e7"
    });
    this.label.setOrigin(0.5, 0.5);

    if (config.badge) {
      this.badgeLabel = this.scene.add.text(config.width / 2 - 12, -config.height / 2 + 7, config.badge, {
        fontFamily: "Roboto Mono, Courier New, monospace",
        fontSize: "9px",
        color: "#8a929a"
      });
      this.badgeLabel.setOrigin(0.5, 0.5);
    }

    this.hitArea = this.scene.add.zone(0, 0, config.width, config.height).setInteractive({ useHandCursor: true });

    const elements: Phaser.GameObjects.GameObject[] = [this.background, this.label, this.hitArea];
    if (this.badgeLabel) {
      elements.push(this.badgeLabel);
    }
    this.container.add(elements);
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
      if (this.badgeLabel) this.badgeLabel.setColor("#4c525a");
      return;
    }

    if (this.active) {
      this.background.fillStyle(0x3d2b0e, 0.95);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1.5, 0xffa500, 1.0);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#ffca6e");
      if (this.badgeLabel) this.badgeLabel.setColor("#ff9900");
    } else if (this.hovered) {
      this.background.fillStyle(0x242830, 0.95);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1, 0x6e7682, 0.9);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#ffffff");
      if (this.badgeLabel) this.badgeLabel.setColor("#abb3bf");
    } else {
      this.background.fillStyle(0x13161a, 0.9);
      this.background.fillRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.background.lineStyle(1, 0x343942, 0.85);
      this.background.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 5);
      this.label.setColor("#d1d5db");
      if (this.badgeLabel) this.badgeLabel.setColor("#727a85");
    }
  }
}

export class LevelEditorOverlay {
  private container?: Phaser.GameObjects.Container;
  private titleLabel?: Phaser.GameObjects.Text;
  private statusDot?: Phaser.GameObjects.Graphics;
  private statusLabel?: Phaser.GameObjects.Text;
  private modeLabel?: Phaser.GameObjects.Text;
  private selectionLabel?: Phaser.GameObjects.Text;
  private hoverLabel?: Phaser.GameObjects.Text;
  private saveStatusLabel?: Phaser.GameObjects.Text;

  private closeButton?: OverlayButton;
  private saveButton?: OverlayButton;
  private undoButton?: OverlayButton;
  private redoButton?: OverlayButton;

  private toolButtons = new Map<LevelEditorTool, OverlayButton>();
  private paletteButtons = new Map<number, OverlayButton>();
  private objectKindButtons = new Map<ObjectKind, OverlayButton>();
  private visible = false;
  private destroyed = false;

  private readonly panelWidth = 400;
  private readonly panelHeight = 356;
  private readonly leftMargin = 20;

  constructor(
    private scene: Phaser.Scene,
    private onToggleActive: () => void,
    private onToolSelected: (tool: LevelEditorTool) => void,
    private onPaletteSelected: (tileValue: number) => void,
    private onObjectKindSelected: (objectKind: ObjectKind) => void,
    private onUndo: () => void,
    private onRedo: () => void,
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

    this.undoButton?.setEnabled(snapshot.canUndo);
    this.redoButton?.setEnabled(snapshot.canRedo);

    // Tools
    for (const [tool, button] of this.toolButtons) {
      button.setActive(snapshot.enabled && snapshot.tool === tool);
      button.setEnabled(snapshot.enabled);
    }

    // Palette / Objects
    const isMatrix = snapshot.matrixReady;
    this.modeLabel?.setText(isMatrix ? "TILE PALETTE" : "OBJECT MODE");

    for (const [tileValue, button] of this.paletteButtons) {
      button.setVisible(this.visible && isMatrix);
      button.setActive(isMatrix && snapshot.paletteTile === tileValue);
      button.setEnabled(snapshot.enabled && isMatrix);
    }

    for (const [objectKind, button] of this.objectKindButtons) {
      button.setVisible(this.visible && !isMatrix);
      button.setActive(!isMatrix && snapshot.objectKind === objectKind);
      button.setEnabled(snapshot.enabled && !isMatrix);
    }

    // Selection Readout
    if (snapshot.selection) {
      const b = snapshot.selection.bounds;
      const w = b.right - b.left + 1;
      const h = b.bottom - b.top + 1;
      this.selectionLabel?.setText(`Selection: Rect (${b.left},${b.top}) → (${b.right},${b.bottom}) [${w}×${h}]`);
    } else if (snapshot.selectedObject) {
      this.selectionLabel?.setText(
        `Selection: Object ${snapshot.selectedObject.kind} #${snapshot.selectedObject.index}`
      );
    } else {
      this.selectionLabel?.setText("Selection: None");
    }

    // Hover & Clipboard Readout
    const hoverStr = snapshot.hoveredCell
      ? `Cell (${snapshot.hoveredCell.column}, ${snapshot.hoveredCell.row})`
      : "None";
    const clipStr = snapshot.hasClipboard ? "Ready" : "Empty";
    this.hoverLabel?.setText(`Hover: ${hoverStr}   |   Clipboard: ${clipStr}`);

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

    this.toolButtons.forEach(button => button.destroy());
    this.toolButtons.clear();
    this.paletteButtons.forEach(button => button.destroy());
    this.paletteButtons.clear();
    this.objectKindButtons.forEach(button => button.destroy());
    this.objectKindButtons.clear();

    this.closeButton?.destroy();
    this.saveButton?.destroy();
    this.undoButton?.destroy();
    this.redoButton?.destroy();

    this.container?.destroy(true);
    this.container = undefined;
    this.visible = false;
  }

  private ensureCreated(): void {
    if (this.container) return;

    this.container = this.scene.add.container(16, 16);
    this.container.setScrollFactor(0);
    this.container.setDepth(DepthLayer.EditorPanel);

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
    background.lineBetween(margin, 172, rightEdge, 172); // Tools divider

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
    const toolsHeader = this.scene.add.text(margin, 90, "EDITING TOOLS", {
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#727a85"
    });

    this.modeLabel = this.scene.add.text(margin, 177, "TILE PALETTE", {
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

    this.hoverLabel = this.scene.add.text(margin + 12, 262, "Hover: None   |   Clipboard: Empty", {
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
    const shortcutsText = this.scene.add.text(
      this.panelWidth / 2,
      330,
      "Ctrl+E Toggle  |  Ctrl+S Save  |  Ctrl+Z/Y Undo/Redo  |  Del Clear",
      {
        fontFamily: "Roboto Mono, Courier New, monospace",
        fontSize: "9px",
        color: "#5b626d"
      }
    );
    shortcutsText.setOrigin(0.5, 0.5);

    this.container.add([
      background,
      this.titleLabel,
      this.statusDot,
      this.statusLabel,
      toolsHeader,
      this.modeLabel,
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

    // Action Bar Buttons (Y: 62) - 3 buttons aligned from x: 20 to x: 380
    // Usable width = 360px. Button width = 114px. Gap = 9px.
    this.saveButton = new OverlayButton(
      this.scene,
      { x: margin + 57, y: 62, width: 114, height: 28, label: "Save", badge: "Ctrl+S", onClick: this.onSave },
      this.container
    );
    this.undoButton = new OverlayButton(
      this.scene,
      { x: margin + 180, y: 62, width: 114, height: 28, label: "Undo", badge: "Ctrl+Z", onClick: this.onUndo },
      this.container
    );
    this.redoButton = new OverlayButton(
      this.scene,
      { x: margin + 303, y: 62, width: 114, height: 28, label: "Redo", badge: "Ctrl+Y", onClick: this.onRedo },
      this.container
    );

    // Tool Selector Grid (2 rows of 3 buttons) aligned from x: 20 to x: 380
    const toolConfigs: Array<{ tool: LevelEditorTool; label: string; badge: string; col: number; row: number }> = [
      { tool: "select", label: "Select", badge: "1", col: 0, row: 0 },
      { tool: "move", label: "Move", badge: "2", col: 1, row: 0 },
      { tool: "paint", label: "Paint", badge: "3", col: 2, row: 0 },
      { tool: "erase", label: "Erase", badge: "4", col: 0, row: 1 },
      { tool: "place", label: "Place", badge: "5", col: 1, row: 1 },
      { tool: "duplicate", label: "Duplicate", badge: "6", col: 2, row: 1 }
    ];

    for (const item of toolConfigs) {
      const bx = margin + 57 + item.col * 123;
      const by = 120 + item.row * 34;
      this.toolButtons.set(
        item.tool,
        new OverlayButton(
          this.scene,
          {
            x: bx,
            y: by,
            width: 114,
            height: 28,
            label: item.label,
            badge: item.badge,
            onClick: () => this.onToolSelected(item.tool)
          },
          this.container
        )
      );
    }

    // Tile Palette Buttons (Matrix Mode) - 4 buttons aligned from x: 20 to x: 380
    // Usable width = 360px. Button width = 84px. Gap = 8px.
    const paletteTiles = [...DEFAULT_MATRIX_PALETTE];
    const tileNames: Record<number, string> = {
      0: "0: Empty",
      1: "1: Wall",
      2: "2: Floor",
      3: "3: Deco"
    };

    paletteTiles.forEach((tileValue, index) => {
      const bx = margin + 42 + index * 92;
      const by = 206;
      this.paletteButtons.set(
        tileValue,
        new OverlayButton(
          this.scene,
          {
            x: bx,
            y: by,
            width: 84,
            height: 28,
            label: tileNames[tileValue] ?? `Tile ${tileValue}`,
            onClick: () => this.onPaletteSelected(tileValue)
          },
          this.container
        )
      );
    });

    // Object Kind Buttons (Object Mode) - 2 buttons aligned from x: 20 to x: 380
    // Usable width = 360px. Button width = 174px. Gap = 12px.
    this.objectKindButtons.set(
      "torch",
      new OverlayButton(
        this.scene,
        {
          x: margin + 87,
          y: 206,
          width: 174,
          height: 28,
          label: "Torch Object",
          badge: "7",
          onClick: () => this.onObjectKindSelected("torch")
        },
        this.container
      )
    );

    this.objectKindButtons.set(
      "npc",
      new OverlayButton(
        this.scene,
        {
          x: margin + 273,
          y: 206,
          width: 174,
          height: 28,
          label: "NPC Object",
          badge: "8",
          onClick: () => this.onObjectKindSelected("npc")
        },
        this.container
      )
    );

    this.hide();
  }

  private setInteractiveState(enabled: boolean): void {
    for (const button of [this.closeButton, this.saveButton, this.undoButton, this.redoButton]) {
      button?.setEnabled(enabled);
      button?.setVisible(this.visible);
    }

    for (const button of this.toolButtons.values()) {
      button.setVisible(this.visible);
    }

    for (const button of this.paletteButtons.values()) {
      button.setVisible(this.visible);
    }

    for (const button of this.objectKindButtons.values()) {
      button.setVisible(this.visible);
    }
  }
}
