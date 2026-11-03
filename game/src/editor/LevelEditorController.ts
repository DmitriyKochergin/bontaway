import Phaser from "phaser";
import { MATRIX_FLOOR_TILE } from "../levels/types";
import { DepthLayer } from "../types/depth-layer";
import { saveLevelDocument } from "./DevSaveClient";
import { EditorHistory } from "./EditorHistory";
import {
  cloneGridSelection,
  cloneLevelDocument,
  type GridPoint,
  type GridSelection,
  type LevelDocument
} from "./LevelDocument";
import { LevelEditorOverlay } from "./LevelEditorOverlay";
import type { LevelSceneAdapter } from "./LevelSceneAdapter";
import {
  clampRectToDocument,
  createMatrixSelection,
  DEFAULT_MATRIX_EMPTY_TILE,
  normalizeGridRect,
  paintSelection
} from "./MatrixEditing";

export interface LevelEditorSnapshot {
  enabled: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  saveError?: string;
  paletteTile: number;
  matrixReady: boolean;
  hoveredCell?: GridPoint;
  selection?: GridSelection<number>;
}

function documentsEqual(left: LevelDocument, right: LevelDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface PointerCell {
  column: number;
  row: number;
}

interface SelectionGraphics {
  clear(): void;
  setVisible(visible: boolean): void;
  fillStyle(color: number, alpha?: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  lineStyle(lineWidth: number, color: number, alpha?: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  setDepth(depth: number): void;
  destroy(): void;
}

export class LevelEditorController {
  private overlay: LevelEditorOverlay;
  private selectionGraphics: SelectionGraphics;
  private history = new EditorHistory();
  private enabled = false;
  private hoveredCell?: PointerCell;
  private selection?: GridSelection<number>;
  private paletteTile: number = MATRIX_FLOOR_TILE;
  private dragStartCell?: PointerCell;
  private dragCurrentCell?: PointerCell;
  private document?: LevelDocument;
  private pendingEditSnapshot?: LevelDocument;
  private dirty = false;
  private saving = false;
  private saveError?: string;
  private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerUpHandler?: (pointer: Phaser.Input.Pointer) => void;
  private destroyed = false;

  constructor(
    private scene: Phaser.Scene,
    private adapter: LevelSceneAdapter,
    private isPointerOverHud: (pointer: Phaser.Input.Pointer) => boolean
  ) {
    this.document = cloneLevelDocument(this.adapter.getLevelDocument());
    this.overlay = new LevelEditorOverlay(
      scene,
      () => this.toggleEnabled(),
      tile => this.setPaletteTile(tile),
      () => this.save()
    );
    this.selectionGraphics = this.scene.add.graphics() as unknown as SelectionGraphics;
    this.selectionGraphics.setDepth(DepthLayer.EditorSelection);
    this.selectionGraphics.setVisible(false);

    this.bindInput();
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public attachDocument(document: LevelDocument): void {
    this.document = cloneLevelDocument(document);
    this.history.clear();
    this.dirty = false;
    this.pendingEditSnapshot = undefined;
    this.selection = undefined;
    this.overlay.update(this.getSnapshot());
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setPaletteTile(tileValue: number): void {
    if (!Number.isInteger(tileValue)) {
      return;
    }

    this.paletteTile = tileValue;
    if (this.document?.type === "matrix" && this.selection) {
      this.beginEdit();
      paintSelection(this.document, this.selection, this.paletteTile);
      this.refreshMatrixSelection();
      this.commitDocumentChange();
    }

    this.overlay.update(this.getSnapshot());
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
    this.selectionGraphics.clear();
    this.selectionGraphics.setVisible(this.enabled);
    this.overlay.update(this.getSnapshot());
  }

  public undo(): void {
    if (!this.document) {
      return;
    }

    const snapshot = this.history.undo(this.document);
    if (!snapshot) {
      return;
    }

    this.document = snapshot;
    this.pendingEditSnapshot = undefined;
    this.adapter.applyLevelDocument(this.document);
    this.adapter.refreshRuntimeObjects();
    this.refreshMatrixSelection();
    this.dirty = true;
    this.overlay.update(this.getSnapshot());
  }

  public redo(): void {
    if (!this.document) {
      return;
    }

    const snapshot = this.history.redo(this.document);
    if (!snapshot) {
      return;
    }

    this.document = snapshot;
    this.pendingEditSnapshot = undefined;
    this.adapter.applyLevelDocument(this.document);
    this.adapter.refreshRuntimeObjects();
    this.refreshMatrixSelection();
    this.dirty = true;
    this.overlay.update(this.getSnapshot());
  }

  public async save(): Promise<void> {
    if (!this.document || this.saving) {
      return;
    }

    this.saving = true;
    this.saveError = undefined;
    this.overlay.update(this.getSnapshot());

    const result = await saveLevelDocument({
      sourcePath: this.adapter.getLevelSourcePath(),
      document: cloneLevelDocument(this.document)
    });

    this.saving = false;

    if (!result.ok) {
      this.saveError = result.error ?? "Unable to save level.";
      this.overlay.update(this.getSnapshot());
      return;
    }

    this.dirty = false;
    this.overlay.update(this.getSnapshot());
    this.adapter.reloadLevel();
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
      dirty: this.dirty,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      saving: this.saving,
      saveError: this.saveError,
      paletteTile: this.paletteTile,
      matrixReady: this.document?.type === "matrix",
      hoveredCell: this.hoveredCell ? { ...this.hoveredCell } : undefined,
      selection: this.selection ? cloneGridSelection(this.selection) : undefined
    };
  }

  private bindInput(): void {
    this.pointerDownHandler = pointer => {
      if (!this.enabled || this.scene.input.hitTestPointer(pointer).length > 0 || this.isPointerOverHud(pointer)) {
        return;
      }

      const worldPoint = this.adapter.getWorldPoint(pointer);
      const cell = this.getCellFromWorld(worldPoint);

      if (!cell || !this.document) {
        return;
      }

      this.hoveredCell = { ...cell };

      this.beginDrag(cell);
    };

    this.pointerMoveHandler = pointer => {
      if (!this.enabled) {
        return;
      }

      const cell = this.getCellFromWorld(this.adapter.getWorldPoint(pointer));
      this.hoveredCell = cell ? { ...cell } : undefined;

      if (!this.dragStartCell || !pointer.isDown || !cell || !this.document) {
        this.overlay.update(this.getSnapshot());
        return;
      }

      this.selection = this.buildSelection(this.dragStartCell, cell);
      this.overlay.update(this.getSnapshot());
    };

    this.pointerUpHandler = pointer => {
      if (!this.enabled || !this.dragStartCell || !this.document) {
        return;
      }

      const cell = this.getCellFromWorld(this.adapter.getWorldPoint(pointer));
      if (cell) {
        this.dragCurrentCell = { ...cell };
      }

      if (this.dragCurrentCell) {
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
      }

      this.dragStartCell = undefined;
      this.dragCurrentCell = undefined;
      this.overlay.update(this.getSnapshot());
    };

    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
  }

  private beginEdit(): void {
    if (!this.document || this.pendingEditSnapshot) {
      return;
    }

    this.pendingEditSnapshot = cloneLevelDocument(this.document);
  }

  private commitDocumentChange(): void {
    if (!this.document) {
      return;
    }

    const previousDocument = this.pendingEditSnapshot;
    this.pendingEditSnapshot = undefined;
    const changed = previousDocument !== undefined && !documentsEqual(previousDocument, this.document);

    if (changed) {
      this.history.push(previousDocument);
      this.dirty = true;
      this.saveError = undefined;
    }

    this.adapter.applyLevelDocument(this.document);
    if (this.document.type !== "matrix") {
      this.adapter.refreshRuntimeObjects();
    }
    this.overlay.update(this.getSnapshot());
  }

  private beginDrag(cell: PointerCell): void {
    this.dragStartCell = { ...cell };
    this.dragCurrentCell = { ...cell };
    this.overlay.update(this.getSnapshot());
  }

  private getCellFromWorld(worldPoint: GridPoint): PointerCell | undefined {
    const column = Math.floor(worldPoint.column);
    const row = Math.floor(worldPoint.row);

    if (column < 0 || column >= this.adapter.getDungeonColumns() || row < 0 || row >= this.adapter.getDungeonRows()) {
      return undefined;
    }

    return { column, row };
  }

  private buildSelection(startCell: PointerCell, endCell: PointerCell): GridSelection<number> {
    const rect = normalizeGridRect(startCell, endCell);
    if (this.document?.type === "matrix") {
      return createMatrixSelection(this.document, clampRectToDocument(this.document, rect));
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

  private refreshMatrixSelection(): void {
    if (this.document?.type !== "matrix" || !this.selection) {
      return;
    }

    this.selection = createMatrixSelection(this.document, this.selection.bounds);
  }

  private drawSelectionState(): void {
    if (!this.enabled) {
      this.selectionGraphics.clear();
      this.selectionGraphics.setVisible(false);
      return;
    }

    const tileSize = this.adapter.getTileSize();
    this.selectionGraphics.clear();
    this.selectionGraphics.setVisible(true);

    // Selection highlight works on any document type — it is purely coordinate-based.
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
