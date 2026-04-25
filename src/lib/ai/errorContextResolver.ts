import { readFile } from "fs/promises";
import path from "path";
import type { ErrorData, ResolvedCodeContext } from "./types.js";

const MAX_SNIPPET_LINES = 80;
const DEFAULT_RADIUS = 12;

function safeRelativePath(fileName: string): string | null {
  const trimmed = String(fileName || "").trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  if (trimmed.includes("..")) return null;
  if (path.isAbsolute(trimmed)) return null;
  return trimmed.replace(/^\.?\//, "");
}

export async function resolveErrorCodeContext(
  errorData: ErrorData,
): Promise<ResolvedCodeContext | null> {
  const relativePath = safeRelativePath(errorData.fileName || "");
  if (!relativePath) return null;

  const absolutePath = path.join(process.cwd(), relativePath);
  let raw = "";
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    return null;
  }

  const lines = raw.split(/\r?\n/);
  const requestedLine = Number(errorData.lineNumber);
  const hasLine = Number.isFinite(requestedLine) && requestedLine > 0;
  const center = hasLine ? requestedLine : 1;
  const radius = Math.max(1, Math.min(DEFAULT_RADIUS, Math.floor(MAX_SNIPPET_LINES / 2)));

  const startLine = Math.max(1, center - radius);
  const endLine = Math.min(lines.length, center + radius);
  const snippet = lines
    .slice(startLine - 1, endLine)
    .map((line, idx) => `${startLine + idx}|${line}`)
    .join("\n");

  return {
    fileName: relativePath,
    requestedLineNumber: hasLine ? requestedLine : undefined,
    startLine,
    endLine,
    snippet,
  };
}
