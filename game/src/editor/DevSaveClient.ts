import type { LevelDocument } from "./LevelDocument";
import { serializeLevelDocument } from "./LevelSerializer";
import { validateLevelDocument } from "./MapValidator";

export interface DevSaveRequest {
  sourcePath: string;
  document: LevelDocument;
}

export interface DevSaveResponse {
  ok: boolean;
  error?: string;
}

export async function saveLevelDocument(request: DevSaveRequest): Promise<DevSaveResponse> {
  const validation = validateLevelDocument(request.document);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.issues.map(issue => `${issue.path}: ${issue.message}`).join("\n")
    };
  }

  try {
    const response = await fetch("/api/editor/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sourcePath: request.sourcePath,
        content: serializeLevelDocument(request.document)
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: errorText || `Save failed with HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to reach the development save endpoint."
    };
  }
}
