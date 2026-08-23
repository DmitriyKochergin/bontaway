import Phaser from "phaser";
import {
  type GridPoint,
  type GridRect,
  type GridSelection,
  type MatrixLevelDocument
} from "./LevelDocument";
import {
  type MatrixClipboard,
  DEFAULT_MATRIX_EMPTY_TILE,
  DEFAULT_MATRIX_PALETTE,
  copySelection,
  createMatrixSelection,
  duplicateSelection,
  eraseSelection,
  isCellInsideSelection,
  moveSelection,
  normalizeGridRect,
  paintSelection,
  pasteClipboard
} from "./MatrixEditing";
import { LevelEditorOverlay } from "./LevelEditorOverlay";
import { DungeonSystem } from "../systems/DungeonSystem";

export type LevelEditorTool = "select" | "move" | "paint" | "erase" | "place" | "duplicate";

export interface LevelEditorSnapshot {
  enabled: boolean;
  tool: LevelEditorTool;
  paletteTile: number;
  hasClipboard: boolean;
  matrixReady: boolean;
  hoveredCell?: GridPoint;
  selection?: GridSelection<number>;
}

interface PointerCell {
  column: number;
  row: number;
}

type DragMode = "select" | "move" | "paint" | "erase" | "duplicate";

export class LevelEditorController {
  private overlay: LevelEditorOverlay;
  private selectionGraphics: Phaser.GameObjects.Graphics;
  private enabled = false;
  private activeTool: LevelEditorTool = "select";
  private hoveredCell?: PointerCell;
  private selection?: GridSelection<number>;
  private matrixDocument?: MatrixLevelDocument;
  private matrixClipboard?: MatrixClipboard;
  private paletteTile = DEFAULT_MATRIX_PALETTE[1] ?? 1;
  private dragStartCell?: PointerCell;
  private dragCurrentCell?: PointerCell;
  private dragMode?: DragMode;
  private dragSelectionSnapshot?: GridSelection<number>;
  private matrixChangeHandler?: (document: MatrixLevelDocument) => void;
  private keyDownHandler?: (event: KeyboardEvent) => void;
  private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerUpHandler?: (pointer: Phaser.Input.Pointer) => void;
  private destroyed = false;

  constructor(
    private scene: Phaser.Scene,
    private dungeonSystem: DungeonSystem,
    private isPointerOverHud: (pointer: Phaser.Input.Pointer) => boolean
  ) {
    this.overlay = new LevelEditorOverlay(scene, () => this.toggleEnabled(), tool => this.setTool(tool), tile => this.setPaletteTile(tile));
    this.selectionGraphics = this.scene.add.graphics();
    this.selectionGraphics.setDepth(1100);
    this.selectionGraphics.setVisible(false);

    this.bindInput();
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getTool(): LevelEditorTool {
    return this.activeTool;
  }

  public attachMatrixDocument(document: MatrixLevelDocument, onChange?: (document: MatrixLevelDocument) => void): void {
    this.matrixDocument = document;
    this.matrixChangeHandler = onChange;
    this.selection = undefined;
    this.matrixClipboard = undefined;
    this.overlay.update(this.getSnapshot());
  }

  public setTool(tool: LevelEditorTool): void {
    this.activeTool = tool;
    this.overlay.update(this.getSnapshot());
  }

  public setPaletteTile(tileValue: number): void {
    if (!Number.isInteger(tileValue)) {
      return;
    }

    this.paletteTile = tileValue;

    if (this.matrixDocument && this.selection) {
      paintSelection(this.matrixDocument, this.selection, this.paletteTile);
      this.emitMatrixChange();
    }

    this.overlay.update(this.getSnapshot());
  }

  public getPaletteTile(): number {
    return this.paletteTile;
  }

  public toggleEnabled(): void {
    this.setEnabled(!this.enabled);
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) {
      return;
    }

    this.enabled = enabled;
    this.dragStartCell = undefined;
    this.dragCurrentCell = undefined;
    this.dragMode = undefined;
    this.dragSelectionSnapshot = undefined;

    if (this.enabled) {
      this.overlay.show();
    } else {
      this.overlay.hide();
      this.selectionGraphics.setVisible(false);
    }

    this.overlay.update(this.getSnapshot());
  }

  public clearSelection(): void {
    this.selection = undefined;
    this.dragStartCell = undefined;
    this.dragCurrentCell = undefined;
    this.dragMode = undefined;
    this.dragSelectionSnapshot = undefined;
    this.selectionGraphics.clear();
    this.selectionGraphics.setVisible(this.enabled);
    this.overlay.update(this.getSnapshot());
  }

  public copySelection(): void {
    if (!this.matrixDocument || !this.selection) {
      return;
    }

    this.matrixClipboard = copySelection(this.matrixDocument, this.selection);
    this.overlay.update(this.getSnapshot());
  }

  public pasteClipboard(targetCell?: GridPoint): void {
    if (!this.matrixDocument || !this.matrixClipboard) {
      return;
    }

    const origin = targetCell ?? this.selection?.origin ?? { column: 0, row: 0 };
    this.selection = pasteClipboard(this.matrixDocument, this.matrixClipboard, origin);
    this.emitMatrixChange();
    this.overlay.update(this.getSnapshot());
  }

  public duplicateSelection(targetCell?: GridPoint): void {
    if (!this.matrixDocument || !this.selection) {
      return;
    }

    const destination = targetCell ?? {
      column: this.selection.bounds.left + 1,
      row: this.selection.bounds.top + 1
    };

    const offset = {
      column: destination.column - this.selection.bounds.left,
      row: destination.row - this.selection.bounds.top
    };

    this.selection = duplicateSelection(this.matrixDocument, this.selection, offset);
    this.emitMatrixChange();
    this.overlay.update(this.getSnapshot());
  }

  public deleteSelection(): void {
    if (!this.matrixDocument) {
      return;
    }

    if (!this.selection && this.hoveredCell) {
      this.selection = this.buildSelection({ column: this.hoveredCell.column, row: this.hoveredCell.row }, { column: this.hoveredCell.column, row: this.hoveredCell.row });
    }

    if (!this.selection) {
      return;
    }

    eraseSelection(this.matrixDocument, this.selection, DEFAULT_MATRIX_EMPTY_TILE);
    this.emitMatrixChange();
    this.overlay.update(this.getSnapshot());
  }

  public update(): void {
    this.overlay.update(this.getSnapshot());
    this.drawSelectionState();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    if (this.keyDownHandler) {
      this.scene.input.keyboard?.off("keydown", this.keyDownHandler);
      this.keyDownHandler = undefined;
    }

    if (this.pointerDownHandler) {
      this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
      this.pointerDownHandler = undefined;
    }

    if (this.pointerMoveHandler) {
      this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
      this.pointerMoveHandler = undefined;
    }

    if (this.pointerUpHandler) {
      this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
      this.pointerUpHandler = undefined;
    }

    this.overlay.destroy();
    this.selectionGraphics.destroy();
    this.enabled = false;
  }

  public getSnapshot(): LevelEditorSnapshot {
    return {
      enabled: this.enabled,
      tool: this.activeTool,
      paletteTile: this.paletteTile,
      hasClipboard: Boolean(this.matrixClipboard),
      matrixReady: Boolean(this.matrixDocument),
      hoveredCell: this.hoveredCell ? { ...this.hoveredCell } : undefined,
      selection: this.selection ? this.cloneSelection(this.selection) : undefined
    };
  }

  private bindInput(): void {
    this.keyDownHandler = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyE") {
        event.preventDefault();
        this.toggleEnabled();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyC") {
        event.preventDefault();
        this.copySelection();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyV") {
        event.preventDefault();
        this.pasteClipboard(this.hoveredCell);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyD") {
        event.preventDefault();
        this.duplicateSelection(this.hoveredCell);
        return;
      }

      if (!this.enabled) {
        return;
      }

      switch (event.code) {
        case "Digit1":
          this.setTool("select");
          event.preventDefault();
          return;
        case "Digit2":
          this.setTool("move");
          event.preventDefault();
          return;
        case "Digit3":
          this.setTool("paint");
          event.preventDefault();
          return;
        case "Digit4":
          this.setTool("erase");
          event.preventDefault();
          return;
        case "Digit5":
          this.setTool("place");
          event.preventDefault();
          return;
        case "Digit6":
          this.setTool("duplicate");
          event.preventDefault();
          return;
        case "Escape":
          this.clearSelection();
          event.preventDefault();
          return;
        case "Delete":
          this.deleteSelection();
          event.preventDefault();
          return;
        default:
          return;
      }
    };

    this.pointerDownHandler = pointer => {
      if (!this.enabled || this.scene.input.hitTestPointer(pointer).length > 0 || this.isPointerOverHud(pointer)) {
        return;
      }

      const cell = this.getCellFromPointer(pointer);
      if (!cell) {
        this.clearSelection();
        return;
      }

      this.hoveredCell = { ...cell };

      if (!this.matrixDocument) {
        this.beginDrag(cell, "select");
        return;
      }

      const insideSelection = this.selection ? isCellInsideSelection(cell, this.selection) : false;

      switch (this.activeTool) {
        case "move":
          if (insideSelection && this.selection) {
            this.beginDrag(cell, "move");
            this.dragSelectionSnapshot = this.cloneSelection(this.selection);
            return;
          }
          this.beginDrag(cell, "select");
          return;
        case "paint":
          this.beginDrag(cell, insideSelection ? "paint" : "select");
          return;
        case "erase":
          this.beginDrag(cell, insideSelection ? "erase" : "select");
          return;
        case "duplicate":
          this.beginDrag(cell, insideSelection ? "duplicate" : "select");
          if (insideSelection && this.selection) {
            this.dragSelectionSnapshot = this.cloneSelection(this.selection);
          }
          return;
        case "place":
        case "select":
        default:
          this.beginDrag(cell, "select");
          return;
      }
    };

    this.pointerMoveHandler = pointer => {
      if (!this.enabled) {
        return;
      }

      const cell = this.getCellFromPointer(pointer);
      this.hoveredCell = cell ? { ...cell } : undefined;

      if (!this.dragStartCell || !pointer.isDown || !cell) {
        this.overlay.update(this.getSnapshot());
        return;
      }

      this.dragCurrentCell = { ...cell };
      this.updateDragPreview();
      this.overlay.update(this.getSnapshot());
    };

    this.pointerUpHandler = pointer => {
      if (!this.enabled || !this.dragStartCell) {
        return;
      }

      const cell = this.getCellFromPointer(pointer);
      if (cell) {
        this.dragCurrentCell = { ...cell };
      }

      this.commitDrag();
      this.dragStartCell = undefined;
      this.dragCurrentCell = undefined;
      this.dragMode = undefined;
      this.dragSelectionSnapshot = undefined;
      this.overlay.update(this.getSnapshot());
    };

    this.scene.input.keyboard?.on("keydown", this.keyDownHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
  }

  private beginDrag(cell: PointerCell, mode: DragMode): void {
    this.dragStartCell = { ...cell };
    this.dragCurrentCell = { ...cell };
    this.dragMode = mode;

    if (this.matrixDocument) {
      this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
      this.overlay.update(this.getSnapshot());
    }
  }

  private updateDragPreview(): void {
    if (!this.dragStartCell || !this.dragCurrentCell) {
      return;
    }

    const previewRect = normalizeGridRect(this.dragStartCell, this.dragCurrentCell);

    if (this.dragMode === "move" && this.dragSelectionSnapshot) {
      const deltaColumn = this.dragCurrentCell.column - this.dragStartCell.column;
      const deltaRow = this.dragCurrentCell.row - this.dragStartCell.row;
      this.selection = this.translateSelection(this.dragSelectionSnapshot, deltaColumn, deltaRow);
      return;
    }

    if (this.matrixDocument) {
      this.selection = this.buildSelectionFromRect(previewRect);
    }
  }

  private commitDrag(): void {
    if (!this.dragStartCell || !this.dragCurrentCell || !this.matrixDocument) {
      return;
    }

    const deltaColumn = this.dragCurrentCell.column - this.dragStartCell.column;
    const deltaRow = this.dragCurrentCell.row - this.dragStartCell.row;

    switch (this.dragMode) {
      case "move": {
        if (!this.dragSelectionSnapshot) {
          return;
        }

        this.selection = moveSelection(this.matrixDocument, this.dragSelectionSnapshot, deltaColumn, deltaRow);
        this.emitMatrixChange();
        return;
      }
      case "paint": {
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
        paintSelection(this.matrixDocument, this.selection, this.paletteTile);
        this.emitMatrixChange();
        return;
      }
      case "erase": {
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
        eraseSelection(this.matrixDocument, this.selection, DEFAULT_MATRIX_EMPTY_TILE);
        this.emitMatrixChange();
        return;
      }
      case "duplicate": {
        const baseSelection = this.dragSelectionSnapshot ?? this.selection;
        if (!baseSelection) {
          return;
        }

        this.selection = duplicateSelection(this.matrixDocument, baseSelection, { column: deltaColumn, row: deltaRow });
        this.emitMatrixChange();
        return;
      }
      case "select":
      default: {
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
        if (this.activeTool === "paint") {
          paintSelection(this.matrixDocument, this.selection, this.paletteTile);
          this.emitMatrixChange();
        } else if (this.activeTool === "erase") {
          eraseSelection(this.matrixDocument, this.selection, DEFAULT_MATRIX_EMPTY_TILE);
          this.emitMatrixChange();
        } else if (this.activeTool === "duplicate" && this.selection) {
          this.selection = duplicateSelection(this.matrixDocument, this.selection);
          this.emitMatrixChange();
        }
      }
    }
  }

  private getCellFromPointer(pointer: Phaser.Input.Pointer): PointerCell | undefined {
    const camera = this.scene.cameras.main;
    const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
    const column = Math.floor(worldPoint.x / this.dungeonSystem.getTileSize());
    const row = Math.floor(worldPoint.y / this.dungeonSystem.getTileSize());

    if (
      column < 0 ||
      column >= this.dungeonSystem.getDungeonColumns() ||
      row < 0 ||
      row >= this.dungeonSystem.getDungeonRows()
    ) {
      return undefined;
    }

    return { column, row };
  }

  private buildSelection(startCell: PointerCell, endCell: PointerCell): GridSelection<number> {
    const rect = normalizeGridRect(startCell, endCell);
    return this.buildSelectionFromRect(rect);
  }

  private buildSelectionFromRect(rect: GridRect): GridSelection<number> {
    if (this.matrixDocument) {
      return createMatrixSelection(this.matrixDocument, rect);
    }

    const width = rect.right - rect.left + 1;
    const height = rect.bottom - rect.top + 1;
    const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => DEFAULT_MATRIX_EMPTY_TILE));

    return {
      bounds: rect,
      origin: { column: rect.left, row: rect.top },
      cells
    };
  }

  private translateSelection(selection: GridSelection<number>, deltaColumn: number, deltaRow: number): GridSelection<number> {
    const bounds = {
      left: selection.bounds.left + deltaColumn,
      top: selection.bounds.top + deltaRow,
      right: selection.bounds.right + deltaColumn,
      bottom: selection.bounds.bottom + deltaRow
    };

    return {
      bounds,
      origin: {
        column: selection.origin.column + deltaColumn,
        row: selection.origin.row + deltaRow
      },
      cells: selection.cells.map(row => [...row])
    };
  }

  private cloneSelection(selection: GridSelection<number>): GridSelection<number> {
    return {
      bounds: { ...selection.bounds },
      origin: { ...selection.origin },
      cells: selection.cells.map(row => [...row])
    };
  }

  private emitMatrixChange(): void {
    if (this.matrixDocument && this.matrixChangeHandler) {
      this.matrixChangeHandler(this.matrixDocument);
    }
  }

  private drawSelectionState(): void {
    if (!this.enabled) {
      this.selectionGraphics.clear();
      this.selectionGraphics.setVisible(false);
      return;
    }

    const tileSize = this.dungeonSystem.getTileSize();
    this.selectionGraphics.clear();
    this.selectionGraphics.setVisible(true);

    if (this.selection) {
      const { left, top, right, bottom } = this.selection.bounds;
      const x = left * tileSize;
      const y = top * tileSize;
      const width = (right - left + 1) * tileSize;
      const height = (bottom - top + 1) * tileSize;
      this.selectionGraphics.fillStyle(0x4e79ff, 0.12);
      this.selectionGraphics.fillRect(x, y, width, height);
      this.selectionGraphics.lineStyle(2, 0x8fb4ff, 0.95);
      this.selectionGraphics.strokeRect(x + 1, y + 1, width - 2, height - 2);
      return;
    }

    if (this.hoveredCell) {
      const x = this.hoveredCell.column * tileSize;
      const y = this.hoveredCell.row * tileSize;
      this.selectionGraphics.lineStyle(1, 0xffb648, 0.85);
      this.selectionGraphics.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
    }
  }
}


