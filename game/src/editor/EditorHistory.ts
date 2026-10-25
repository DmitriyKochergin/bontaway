import { cloneLevelDocument, type LevelDocument } from "./LevelDocument";

export class EditorHistory {
  private pastSnapshots: LevelDocument[] = [];
  private futureSnapshots: LevelDocument[] = [];

  public clear(): void {
    this.pastSnapshots = [];
    this.futureSnapshots = [];
  }

  public push(document: LevelDocument): void {
    this.pastSnapshots.push(cloneLevelDocument(document));
    this.futureSnapshots = [];
  }

  public canUndo(): boolean {
    return this.pastSnapshots.length > 0;
  }

  public canRedo(): boolean {
    return this.futureSnapshots.length > 0;
  }

  public undo(currentDocument: LevelDocument): LevelDocument | undefined {
    const snapshot = this.pastSnapshots.pop();
    if (!snapshot) {
      return undefined;
    }

    this.futureSnapshots.push(cloneLevelDocument(currentDocument));
    return cloneLevelDocument(snapshot);
  }

  public redo(currentDocument: LevelDocument): LevelDocument | undefined {
    const snapshot = this.futureSnapshots.pop();
    if (!snapshot) {
      return undefined;
    }

    this.pastSnapshots.push(cloneLevelDocument(currentDocument));
    return cloneLevelDocument(snapshot);
  }
}
