import Phaser from "phaser";
import {
  type GridPoint,
  type GridSelection,
  type LevelDocument,
  cloneLevelDocument,
  cloneGridSelection
} from "./LevelDocument";
import {
  DEFAULT_MATRIX_EMPTY_TILE,
  DEFAULT_MATRIX_PALETTE,
  duplicateSelection,
  eraseSelection,
  isCellInsideSelection,
  moveSelection,
  normalizeGridRect,
  paintSelection,
  pasteClipboard,
  type MatrixClipboard
} from "./MatrixEditing";
import { EditorHistory } from "./EditorHistory";
import { LevelEditorOverlay } from "./LevelEditorOverlay";
import { saveLevelDocument } from "./DevSaveClient";
import { type LevelSceneAdapter } from "./LevelSceneAdapter";
import {
  addPlacement,
  deletePlacement,
  hitTestPlacements,
  movePlacement,
  type PlacementHit,
  type PlacementKind,
  type SelectedPlacement
} from "./LevelObjectEditing";

export type LevelEditorTool = "select" | "move" | "paint" | "erase" | "place" | "duplicate";

export interface LevelEditorSnapshot {
  enabled: boolean;
  tool: LevelEditorTool;
  placementKind?: PlacementKind;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  saveError?: string;
  paletteTile: number;
  hasClipboard: boolean;
  matrixReady: boolean;
  hoveredCell?: GridPoint;
  selection?: GridSelection<number>;
  selectedPlacement?: SelectedPlacement;
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
  strokeCircle(x: number, y: number, radius: number): void;
  destroy(): void;
}

type DragMode = "select" | "move" | "paint" | "erase" | "duplicate" | "object";

export class LevelEditorController {
  private overlay: LevelEditorOverlay;
  private selectionGraphics: SelectionGraphics;
  private history = new EditorHistory();
  private enabled = false;
  private activeTool: LevelEditorTool = "select";
  private placementKind: PlacementKind = "torch";
  private hoveredCell?: PointerCell;
  private selection?: GridSelection<number>;
  private selectedPlacement?: { kind: PlacementKind; index: number };
  private matrixClipboard?: MatrixClipboard;
  private paletteTile: number = DEFAULT_MATRIX_PALETTE[1] ?? 1;
  private dragStartCell?: PointerCell;
  private dragCurrentCell?: PointerCell;
  private dragWorldPoint?: GridPoint;
  private dragMode?: DragMode;
  private dragSelectionSnapshot?: GridSelection<number>;
  private dragPlacementSnapshot?: PlacementHit;
  private document?: LevelDocument;
  private dirty = false;
  private saving = false;
  private saveError?: string;
  private keyDownHandler?: (event: KeyboardEvent) => void;
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
    this.history.push(this.document);
    this.overlay = new LevelEditorOverlay(
      scene,
      () => this.toggleEnabled(),
      tool => this.setTool(tool),
      tile => this.setPaletteTile(tile),
      placement => this.setPlacementKind(placement),
      () => this.undo(),
      () => this.redo(),
      () => this.save()
    );
    this.selectionGraphics = this.scene.add.graphics() as unknown as SelectionGraphics;
    this.selectionGraphics.setVisible(false);

    this.bindInput();
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public attachDocument(document: LevelDocument): void {
    this.document = cloneLevelDocument(document);
    this.history.clear();
    this.history.push(this.document);
    this.dirty = false;
    this.matrixClipboard = undefined;
    this.selection = undefined;
    this.selectedPlacement = undefined;
    this.overlay.update(this.getSnapshot());
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setTool(tool: LevelEditorTool): void {
    this.activeTool = tool;
    this.overlay.update(this.getSnapshot());
  }

  public setPlacementKind(kind: PlacementKind): void {
    this.placementKind = kind;
    this.overlay.update(this.getSnapshot());
  }

  public setPaletteTile(tileValue: number): void {
    if (!Number.isInteger(tileValue)) {
      return;
    }

    this.paletteTile = tileValue;
    if (this.document?.type === "matrix" && this.selection) {
      this.beginEdit();
      paintSelection(this.document, this.selection, this.paletteTile);
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
    this.dragWorldPoint = undefined;
    this.dragMode = undefined;
    this.dragSelectionSnapshot = undefined;
    this.dragPlacementSnapshot = undefined;

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
    this.selectedPlacement = undefined;
    this.dragStartCell = undefined;
    this.dragCurrentCell = undefined;
    this.dragWorldPoint = undefined;
    this.dragMode = undefined;
    this.dragSelectionSnapshot = undefined;
    this.dragPlacementSnapshot = undefined;
    this.selectionGraphics.clear();
    this.selectionGraphics.setVisible(this.enabled);
    this.overlay.update(this.getSnapshot());
  }

  public copySelection(): void {
    if (this.document?.type !== "matrix" || !this.selection) {
      return;
    }

    this.matrixClipboard = {
      width: this.selection.bounds.right - this.selection.bounds.left + 1,
      height: this.selection.bounds.bottom - this.selection.bounds.top + 1,
      cells: this.selection.cells.map(row => [...row])
    };
    this.overlay.update(this.getSnapshot());
  }

  public pasteClipboard(targetCell?: GridPoint): void {
    if (this.document?.type !== "matrix" || !this.matrixClipboard) {
      return;
    }

    const origin = targetCell ?? this.selection?.origin ?? { column: 0, row: 0 };
    this.beginEdit();
    this.selection = pasteClipboard(this.document, this.matrixClipboard, origin);
    this.commitDocumentChange();
  }

  public duplicateSelection(targetCell?: GridPoint): void {
    if (this.document?.type !== "matrix" || !this.selection) {
      return;
    }

    const destination = targetCell ?? { column: this.selection.bounds.left + 1, row: this.selection.bounds.top + 1 };
    const offset = { column: destination.column - this.selection.bounds.left, row: destination.row - this.selection.bounds.top };
    this.beginEdit();
    this.selection = duplicateSelection(this.document, this.selection, offset);
    this.commitDocumentChange();
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
    this.adapter.applyLevelDocument(this.document);
    this.adapter.refreshRuntimeObjects();
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
    this.adapter.applyLevelDocument(this.document);
    this.adapter.refreshRuntimeObjects();
    this.dirty = true;
    this.overlay.update(this.getSnapshot());
  }

  public async save(): Promise<void> {
    if (!this.document) {
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
      placementKind: this.placementKind,
      dirty: this.dirty,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      saving: this.saving,
      saveError: this.saveError,
      paletteTile: this.paletteTile,
      hasClipboard: Boolean(this.matrixClipboard),
      matrixReady: this.document?.type === "matrix",
      hoveredCell: this.hoveredCell ? { ...this.hoveredCell } : undefined,
      selection: this.selection ? cloneGridSelection(this.selection) : undefined,
      selectedPlacement: this.selectedPlacement ? { ...this.selectedPlacement } : undefined
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

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
        event.preventDefault();
        void this.save();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
        event.preventDefault();
        this.redo();
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
        case "Digit7":
          this.setPlacementKind("torch");
          event.preventDefault();
          return;
        case "Digit8":
          this.setPlacementKind("npc");
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

      const worldPoint = this.adapter.getWorldPoint(pointer);
      const cell = this.getCellFromWorld(worldPoint);

      if (!cell || !this.document) {
        return;
      }

      this.hoveredCell = { ...cell };

      if (this.document.type === "matrix") {
        this.handleMatrixPointerDown(cell);
        return;
      }

      this.handleObjectPointerDown(worldPoint);
    };

    this.pointerMoveHandler = pointer => {
      if (!this.enabled) {
        return;
      }

      const worldPoint = this.adapter.getWorldPoint(pointer);
      const cell = this.getCellFromWorld(worldPoint);
      this.hoveredCell = cell ? { ...cell } : undefined;

      if (!this.dragStartCell || !pointer.isDown || !cell || !this.document) {
        this.overlay.update(this.getSnapshot());
        return;
      }

      if (this.document.type === "matrix") {
        this.handleMatrixPointerMove(cell);
      } else {
        this.handleObjectPointerMove(worldPoint);
      }

      this.overlay.update(this.getSnapshot());
    };

    this.pointerUpHandler = pointer => {
      if (!this.enabled || !this.dragStartCell || !this.document) {
        return;
      }

      const worldPoint = this.adapter.getWorldPoint(pointer);
      const cell = this.getCellFromWorld(worldPoint);
      if (cell) {
        this.dragCurrentCell = { ...cell };
      }

      if (this.document.type === "matrix") {
        this.commitMatrixDrag();
      } else {
        this.commitObjectDrag();
      }

      this.dragStartCell = undefined;
      this.dragCurrentCell = undefined;
      this.dragWorldPoint = undefined;
      this.dragMode = undefined;
      this.dragSelectionSnapshot = undefined;
      this.dragPlacementSnapshot = undefined;
      this.overlay.update(this.getSnapshot());
    };

    this.scene.input.keyboard?.on("keydown", this.keyDownHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
  }

  public deleteSelection(): void {
    if (!this.document) {
      return;
    }

    if (this.document.type === "matrix") {
      if (!this.selection && this.hoveredCell) {
        this.selection = this.buildSelection(this.hoveredCell, this.hoveredCell);
      }

      if (!this.selection) {
        return;
      }

      this.beginEdit();
      eraseSelection(this.document, this.selection, DEFAULT_MATRIX_EMPTY_TILE);
      this.commitDocumentChange();
      return;
    }

    if (this.selectedPlacement) {
      this.beginEdit();
      deletePlacement(this.document, { ...this.selectedPlacement, distance: 0 });
      this.selectedPlacement = undefined;
      this.commitDocumentChange();
    }
  }

  private beginEdit(): void {
    if (!this.document) {
      return;
    }

    this.history.push(this.document);
  }

  private commitDocumentChange(): void {
    if (!this.document) {
      return;
    }

    this.dirty = true;
    this.adapter.applyLevelDocument(this.document);
    if (this.document.type !== "matrix") {
      this.adapter.refreshRuntimeObjects();
    }
    this.overlay.update(this.getSnapshot());
  }

  private handleMatrixPointerDown(cell: PointerCell): void {
    if (!this.document || this.document.type !== "matrix") {
      return;
    }

    const insideSelection = this.selection ? isCellInsideSelection(cell, this.selection) : false;

    switch (this.activeTool) {
      case "move":
        if (insideSelection && this.selection) {
          this.beginDrag(cell, "move");
          this.dragSelectionSnapshot = cloneGridSelection(this.selection);
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
          this.dragSelectionSnapshot = cloneGridSelection(this.selection);
        }
        return;
      case "select":
      case "place":
      default:
        this.beginDrag(cell, "select");
        return;
    }
  }

  private handleMatrixPointerMove(cell: PointerCell): void {
    if (!this.dragStartCell || !this.dragCurrentCell || !this.document || this.document.type !== "matrix") {
      return;
    }

    if (this.dragMode === "move" && this.dragSelectionSnapshot) {
      const deltaColumn = this.dragCurrentCell.column - this.dragStartCell.column;
      const deltaRow = this.dragCurrentCell.row - this.dragStartCell.row;
      this.selection = this.translateSelection(this.dragSelectionSnapshot, deltaColumn, deltaRow);
      return;
    }

    this.selection = this.buildSelection(this.dragStartCell, cell);
  }

  private commitMatrixDrag(): void {
    if (!this.document || this.document.type !== "matrix" || !this.dragStartCell || !this.dragCurrentCell) {
      return;
    }

    const deltaColumn = this.dragCurrentCell.column - this.dragStartCell.column;
    const deltaRow = this.dragCurrentCell.row - this.dragStartCell.row;

    this.beginEdit();

    switch (this.dragMode) {
      case "move":
        if (this.dragSelectionSnapshot) {
          this.selection = moveSelection(this.document, this.dragSelectionSnapshot, deltaColumn, deltaRow);
        }
        break;
      case "paint":
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
        paintSelection(this.document, this.selection, this.paletteTile);
        break;
      case "erase":
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
        eraseSelection(this.document, this.selection, DEFAULT_MATRIX_EMPTY_TILE);
        break;
      case "duplicate":
        if (this.dragSelectionSnapshot) {
          this.selection = duplicateSelection(this.document, this.dragSelectionSnapshot, { column: deltaColumn, row: deltaRow });
        }
        break;
      case "select":
      default:
        this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
        break;
    }

    this.commitDocumentChange();
  }

  private handleObjectPointerDown(worldPoint: GridPoint): void {
    if (!this.document || this.document.type === "matrix") {
      return;
    }

    const hit = hitTestPlacements(this.document, worldPoint);

    if (hit && this.activeTool !== "place") {
      this.selectedPlacement = { kind: hit.kind, index: hit.index };
      if (this.activeTool === "move") {
        this.beginDrag({ column: worldPoint.column, row: worldPoint.row }, "object");
        this.dragPlacementSnapshot = hit;
        this.beginEdit();
      }
      this.overlay.update(this.getSnapshot());
      return;
    }

    if (this.activeTool === "place") {
      this.beginEdit();
      this.selectedPlacement = addPlacement(this.document, this.placementKind, worldPoint);
      this.commitDocumentChange();
      return;
    }

    this.selectedPlacement = undefined;
    this.overlay.update(this.getSnapshot());
  }

  private handleObjectPointerMove(worldPoint: GridPoint): void {
    if (!this.document || this.document.type === "matrix" || this.dragMode !== "object" || !this.dragPlacementSnapshot) {
      return;
    }

    this.dragWorldPoint = worldPoint;
    movePlacement(this.document, this.dragPlacementSnapshot, worldPoint);
    this.commitDocumentChange();
  }

  private commitObjectDrag(): void {
    if (!this.document || this.document.type === "matrix") {
      return;
    }

    if (this.dragMode !== "object") {
      return;
    }

    if (this.dragPlacementSnapshot && this.dragWorldPoint) {
      movePlacement(this.document, this.dragPlacementSnapshot, this.dragWorldPoint);
      this.commitDocumentChange();
    }
  }

  private beginDrag(cell: PointerCell, mode: DragMode): void {
    this.dragStartCell = { ...cell };
    this.dragCurrentCell = { ...cell };
    this.dragMode = mode;
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
    return {
      bounds: {
        left: selection.bounds.left + deltaColumn,
        top: selection.bounds.top + deltaRow,
        right: selection.bounds.right + deltaColumn,
        bottom: selection.bounds.bottom + deltaRow
      },
      origin: {
        column: selection.origin.column + deltaColumn,
        row: selection.origin.row + deltaRow
      },
      cells: selection.cells.map(row => [...row])
    };
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

    if (this.document?.type === "matrix" && this.selection) {
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

    if (this.selectedPlacement && this.document?.type !== "matrix") {
      const levelDocument = this.document;
      if (!levelDocument) {
        return;
      }

      const placements = this.selectedPlacement.kind === "torch" ? levelDocument.torchPlacements ?? [] : levelDocument.npcs ?? [];
      const placement = placements?.[this.selectedPlacement.index];
      if (placement) {
        this.selectionGraphics.lineStyle(2, 0xffb648, 0.95);
        this.selectionGraphics.strokeCircle(placement.tileX * tileSize, placement.tileY * tileSize, 12);
      }
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


