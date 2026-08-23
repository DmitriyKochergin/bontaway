import Phaser from "phaser";
import { type GridPoint, type GridSelection } from "./LevelDocument";
import { LevelEditorOverlay } from "./LevelEditorOverlay";
import { DungeonSystem } from "../systems/DungeonSystem";

export type LevelEditorTool = "select" | "move" | "paint" | "erase" | "place" | "duplicate";

export interface LevelEditorSnapshot {
  enabled: boolean;
  tool: LevelEditorTool;
  hoveredCell?: GridPoint;
  selection?: GridSelection<null>;
}

interface PointerCell {
  column: number;
  row: number;
}

export class LevelEditorController {
  private overlay: LevelEditorOverlay;
  private selectionGraphics: Phaser.GameObjects.Graphics;
  private enabled = false;
  private activeTool: LevelEditorTool = "select";
  private hoveredCell?: PointerCell;
  private selection?: GridSelection<null>;
  private dragStartCell?: PointerCell;
  private dragCurrentCell?: PointerCell;
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
	this.overlay = new LevelEditorOverlay(
	  scene,
	  () => this.toggleEnabled(),
	  tool => this.setTool(tool)
	);
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

  public setTool(tool: LevelEditorTool): void {
	this.activeTool = tool;
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
		case "Delete":
		  this.clearSelection();
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
	  this.dragStartCell = { ...cell };
	  this.dragCurrentCell = { ...cell };
	  this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
	  this.overlay.update(this.getSnapshot());
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
	  this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
	  this.overlay.update(this.getSnapshot());
	};

	this.pointerUpHandler = pointer => {
	  if (!this.enabled || !this.dragStartCell) {
		return;
	  }

	  const cell = this.getCellFromPointer(pointer);
	  if (cell) {
		this.dragCurrentCell = { ...cell };
		this.selection = this.buildSelection(this.dragStartCell, this.dragCurrentCell);
	  }

	  this.dragStartCell = undefined;
	  this.dragCurrentCell = undefined;
	  this.overlay.update(this.getSnapshot());
	};

	this.scene.input.keyboard?.on("keydown", this.keyDownHandler);
	this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
	this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
	this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
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

  private buildSelection(startCell: PointerCell, endCell: PointerCell): GridSelection<null> {
	const left = Math.min(startCell.column, endCell.column);
	const right = Math.max(startCell.column, endCell.column);
	const top = Math.min(startCell.row, endCell.row);
	const bottom = Math.max(startCell.row, endCell.row);
	const width = right - left + 1;
	const height = bottom - top + 1;
	const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => null));

	return {
	  bounds: { left, top, right, bottom },
	  origin: { ...startCell },
	  cells
	};
  }

  private cloneSelection(selection: GridSelection<null>): GridSelection<null> {
	return {
	  bounds: { ...selection.bounds },
	  origin: { ...selection.origin },
	  cells: selection.cells.map(row => [...row])
	};
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


