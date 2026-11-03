import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, resolve } from "node:path";
import type { MatrixLevelDocument } from "./src/editor/LevelDocument";
import { deserializeMatrixLevelDocument } from "./src/editor/LevelSerializer";
import { validateLevelDocument } from "./src/editor/MapValidator";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const LEVEL_PATH_PATTERN = /^src\/levels\/([^/]+)\.(json|ts)$/;

class SaveRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}

interface SavePayload {
  sourcePath: string;
  content: string;
}

export function createEditorSaveMiddleware(projectRoot: string) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    if (request.method !== "POST") {
      next();
      return;
    }

    void handleSaveRequest(request, response, projectRoot);
  };
}

async function handleSaveRequest(request: IncomingMessage, response: ServerResponse, projectRoot: string): Promise<void> {
  try {
    const payload = parseSavePayload(await readRequestBody(request));
    const targetPath = resolveLevelPath(projectRoot, payload.sourcePath);
    const extension = extname(targetPath);

    if (extension === ".json") {
      validateMatrixContent(payload.content, basename(targetPath, extension));
    } else {
      validateTypeScriptContent(payload.content, basename(targetPath, extension));
    }

    await writeAtomically(targetPath, payload.content);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    if (error instanceof SaveRequestError) {
      sendJson(response, error.statusCode, { ok: false, error: error.message });
      return;
    }

    const message = error instanceof Error ? error.message : "Unable to write level file.";
    sendJson(response, 500, { ok: false, error: message });
  }
}

function parseSavePayload(body: string): SavePayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SaveRequestError("Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SaveRequestError("Request body must be a JSON object.");
  }

  const sourcePath = (parsed as Record<string, unknown>).sourcePath;
  const content = (parsed as Record<string, unknown>).content;
  if (typeof sourcePath !== "string" || typeof content !== "string") {
    throw new SaveRequestError("Request requires string sourcePath and content fields.");
  }

  return { sourcePath, content };
}

function resolveLevelPath(projectRoot: string, sourcePath: string): string {
  if (sourcePath.includes("\\") || sourcePath !== sourcePath.trim()) {
    throw new SaveRequestError("sourcePath must be a normalized relative path.");
  }

  const match = LEVEL_PATH_PATTERN.exec(sourcePath);
  if (!match) {
    throw new SaveRequestError("sourcePath must directly target src/levels/<name>.json or <name>.ts.");
  }

  const levelsRoot = resolve(projectRoot, "src/levels");
  const targetPath = resolve(projectRoot, sourcePath);
  if (dirname(targetPath) !== levelsRoot) {
    throw new SaveRequestError("sourcePath must stay directly under src/levels.");
  }

  return targetPath;
}

function validateMatrixContent(content: string, expectedId: string): void {
  let document: MatrixLevelDocument;

  try {
    document = deserializeMatrixLevelDocument(content);
  } catch (error) {
    throw new SaveRequestError(error instanceof Error ? error.message : "Invalid matrix level content.");
  }

  if (document.id !== expectedId) {
    throw new SaveRequestError(`Matrix level id "${document.id}" does not match source filename "${expectedId}".`);
  }

  const validation = validateLevelDocument(document);
  if (!validation.valid) {
    throw new SaveRequestError(formatValidationIssues(validation.issues));
  }
}

function validateTypeScriptContent(content: string, expectedId: string): void {
  if (content.trimStart().startsWith("{")) {
    throw new SaveRequestError("Matrix JSON content cannot be written to a TypeScript level path.");
  }

  if (!content.includes(`export const ${expectedId}Level`)) {
    throw new SaveRequestError(`TypeScript content must export ${expectedId}Level.`);
  }
}

function formatValidationIssues(issues: Array<{ path: string; message: string }>): string {
  return issues.map(issue => `${issue.path}: ${issue.message}`).join("\n");
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let rejected = false;

    request.on("data", chunk => {
      if (rejected) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > MAX_REQUEST_BYTES) {
        rejected = true;
        rejectBody(new SaveRequestError("Request body is too large.", 413));
        request.resume();
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", () => {
      if (!rejected) {
        resolveBody(Buffer.concat(chunks).toString("utf8"));
      }
    });
    request.on("error", error => {
      if (!rejected) {
        rejectBody(error);
      }
    });
  });
}

async function writeAtomically(targetPath: string, content: string): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  let fileHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    fileHandle = await open(temporaryPath, "wx", 0o600);
    await fileHandle.writeFile(content, "utf8");
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;
    await rename(temporaryPath, targetPath);
  } finally {
    await fileHandle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
