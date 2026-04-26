import test from "node:test";
import assert from "node:assert/strict";
import { formatFixSuggestion } from "../src/lib/ai/formatFixSuggestion.js";

test("formatFixSuggestion preserves output structure when assumptions are missing", () => {
  const formatted = formatFixSuggestion({
    analysis: "OpenAI request failed (400).",
    fixSuggestion: "Inspect OpenAI API response and credentials.",
    patch: "",
  });

  assert.match(formatted, /🧠 BUG ANALYSIS/);
  assert.match(formatted, /💡 FIX SUGGESTION/);
  assert.match(formatted, /🛠️ CODE PATCH/);
  assert.doesNotMatch(formatted, /📝 ASSUMPTIONS/);
});

test("formatFixSuggestion appends assumptions section when present", () => {
  const formatted = formatFixSuggestion({
    analysis: "Missing model parameter.",
    fixSuggestion: "Check environment values.",
    patch: "",
    assumptions: ["OPENAI_MODEL may be unset", "Request reached fallback path"],
  });

  assert.match(formatted, /📝 ASSUMPTIONS/);
  assert.match(formatted, /- OPENAI_MODEL may be unset/);
  assert.match(formatted, /- Request reached fallback path/);
});
