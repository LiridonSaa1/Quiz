import test from "node:test";
import assert from "node:assert/strict";
import { generateFixSuggestion } from "../src/lib/ai/generateFixSuggestion.js";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;

  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

test("generateFixSuggestion sends safe OpenAI payload without temperature", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5";

  let capturedPayload: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedPayload = JSON.parse(String(init?.body || "{}"));
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          analysis: "A",
          fixSuggestion: "B",
          patch: "",
          assumptions: [],
        }),
      }),
    } as Response;
  }) as typeof fetch;

  await generateFixSuggestion({ message: "boom" });

  assert.ok(capturedPayload);
  assert.equal(capturedPayload?.model, "gpt-5");
  assert.ok(typeof capturedPayload?.input === "string");
  assert.equal(Object.prototype.hasOwnProperty.call(capturedPayload, "temperature"), false);
});

test("generateFixSuggestion returns actionable fallback on unsupported parameter", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5";

  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            message: "Unsupported parameter: 'temperature' is not supported with this model.",
            type: "invalid_request_error",
            param: "temperature",
            code: null,
          },
        }),
    }) as Response) as typeof fetch;

  const result = await generateFixSuggestion({ message: "boom" });

  assert.match(result.analysis, /OpenAI request failed \(400\)/);
  assert.match(result.fixSuggestion, /unsupported request parameter/i);
  assert.match(result.fixSuggestion, /param: temperature/i);
  assert.match(result.fixSuggestion, /safe payload without optional tuning parameters/i);
});
