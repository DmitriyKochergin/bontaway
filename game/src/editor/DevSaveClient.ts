import { serializeLevelDocument } from "./LevelSerializer";
import type { LevelDocument } from "./LevelDocument";

export interface DevSaveRequest {
  sourcePath: string;
  document: LevelDocument;
}

export interface DevSaveResponse {
  ok: boolean;
  error?: string;
}

export async function saveLevelDocument(request: DevSaveRequest): Promise<DevSaveResponse> {
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
}

