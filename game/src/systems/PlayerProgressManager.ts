export interface PlayerProgressState {
  levelId: string;
  x: number;
  y: number;
  rotation: number;
}

const STORAGE_KEY = "bontaway_player_progress";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlayerProgressState(value: unknown): value is PlayerProgressState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlayerProgressState>;
  return (
    typeof candidate.levelId === "string" && candidate.levelId.length > 0 &&
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.rotation)
  );
}

export function loadPlayerProgress(): PlayerProgressState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as unknown;
    if (!isPlayerProgressState(parsed)) {
      return null;
    }

    return { ...parsed };
  } catch (error) {
    console.warn("Failed to load player progress:", error);
    return null;
  }
}

export function savePlayerProgress(progress: PlayerProgressState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn("Failed to save player progress:", error);
  }
}

