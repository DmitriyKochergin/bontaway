import type Phaser from "phaser";
import type { GridPoint, LevelDocument } from "./LevelDocument";

export interface LevelSceneAdapter {
  getLevelDocument(): LevelDocument;
  applyLevelDocument(document: LevelDocument): void;
  refreshRuntimeObjects(): void;
  reloadLevel(): void;
  getTileSize(): number;
  getDungeonColumns(): number;
  getDungeonRows(): number;
  getLevelSourcePath(): string;
  getWorldPoint(pointer: Phaser.Input.Pointer): GridPoint;
}
