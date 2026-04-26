import { resolveErrorCodeContext } from "./errorContextResolver.js";
import { withFormattedOutput } from "./formatFixSuggestion.js";
import type { ErrorData, FixSuggestionResult } from "./types.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";

function normalizeErrorData(input: ErrorData): ErrorData {
  return {
    message: String(input?.message || "Unknown error"),
    stack: input?.stack ? String(input.stack) : undefined,
    fileName: input?.fileName ? String(input.fileName) : undefined,
    lineNumber:
      Number.isFinite(Number(input?.lineNumber)) && Number(input?.lineNumber) > 0
        ? Number(input.lineNumber)
        : undefined,
    currentUrl: input?.currentUrl ? String(input.currentUrl) : undefined,
    rawLog: input?.rawLog ? String(input.rawLog) : undefined,
  };
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  return "";
}

function extractJsonBlock(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildOpenAIRequestBody(errorData: ErrorData, contextBlock: string): Record<string, unknown> {
  return {
    model: DEFAULT_MODEL,
    input: buildPrompt(errorData, contextBlock),
  };
}

function parseOpenAIError(body: string): { message: string; param?: string } | null {
  try {
    const parsed = JSON.parse(body);
    const error = parsed?.error;
    if (!error || typeof error !== "object") return null;
    const message = typeof error.message === "string" ? error.message.trim() : "";
    const param = typeof error.param === "string" ? error.param.trim() : "";
    if (!message) return null;
    return {
      message,
      param: param || undefined,
    };
  } catch {
    return null;
  }
}

function buildPrompt(errorData: ErrorData, contextBlock: string): string {
  return [
    "You are an expert debugging assistant.",
    "Analyze the error and return ONLY valid JSON with keys:",
    'analysis (string), fixSuggestion (string), patch (string), assumptions (string[]).',
    "If you cannot create a patch, return patch as an empty string.",
    "Do not fabricate certainty; include assumptions when context is missing.",
    "",
    "Error payload:",
    JSON.stringify(errorData, null, 2),
    "",
    "Relevant code context:",
    contextBlock || "No code context available.",
  ].join("\n");
}

export async function generateFixSuggestion(errorDataInput: ErrorData): Promise<FixSuggestionResult> {
  const timestamp = new Date().toISOString();
  const errorData = normalizeErrorData(errorDataInput);
  const context = await resolveErrorCodeContext(errorData);
  const contextBlock = context
    ? `File: ${context.fileName}\nRequested line: ${context.requestedLineNumber || "n/a"}\nSnippet:\n${context.snippet}`
    : "";

  const fallback = withFormattedOutput({
    analysis: "Unable to analyze error with AI right now.",
    fixSuggestion:
      "Check logs, confirm stack trace source, and retry the AI suggestion endpoint once service connectivity is restored.",
    patch: "",
    model: DEFAULT_MODEL,
    timestamp,
    assumptions: ["AI service unavailable or invalid response format."],
    context,
  });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return withFormattedOutput({
      ...fallback,
      analysis: "OPENAI_API_KEY is missing in server environment.",
      fixSuggestion:
        "Set OPENAI_API_KEY (and optionally OPENAI_MODEL) in the backend environment, then retry.",
      assumptions: ["No outbound AI call was made because credentials are missing."],
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const requestBody = buildOpenAIRequestBody(errorData, contextBlock);
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      const parsedError = parseOpenAIError(body);
      const unsupportedParam =
        parsedError?.message.toLowerCase().includes("unsupported parameter");
      const paramDetails = parsedError?.param ? ` (param: ${parsedError.param})` : "";
      const details =
        parsedError?.message ||
        `OpenAI returned a non-OK response body: ${body.slice(0, 500)}`;
      return withFormattedOutput({
        ...fallback,
        analysis: `OpenAI request failed (${response.status}).`,
        fixSuggestion: unsupportedParam
          ? `OpenAI rejected an unsupported request parameter${paramDetails}. The service now sends a safe payload without optional tuning parameters. Response: ${details}`
          : `Inspect OpenAI API response and credentials. Response: ${details}`,
      });
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    const parsed = extractJsonBlock(outputText);

    if (!parsed || typeof parsed !== "object") {
      return withFormattedOutput({
        ...fallback,
        analysis: "AI returned a non-JSON payload.",
        fixSuggestion: `Review model output and tighten prompt schema. Raw output: ${outputText.slice(0, 500)}`,
      });
    }

    return withFormattedOutput({
      analysis: String(parsed.analysis || "No analysis provided."),
      fixSuggestion: String(parsed.fixSuggestion || "No fix suggestion provided."),
      patch: typeof parsed.patch === "string" ? parsed.patch : "",
      model: DEFAULT_MODEL,
      timestamp,
      assumptions: Array.isArray(parsed.assumptions)
        ? parsed.assumptions.map((x) => String(x))
        : undefined,
      context,
    });
  } catch (error: any) {
    const isAbort = error?.name === "AbortError";
    return withFormattedOutput({
      ...fallback,
      analysis: isAbort ? "AI request timed out." : "AI request failed unexpectedly.",
      fixSuggestion: isAbort
        ? "Retry with the same payload or reduce prompt context size."
        : `Inspect backend logs for details: ${String(error?.message || error)}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}
