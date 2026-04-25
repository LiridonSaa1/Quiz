import type { FixSuggestionResult } from "./types";

export function formatFixSuggestion(result: {
  analysis: string;
  fixSuggestion: string;
  patch?: string;
}): string {
  const analysis = String(result.analysis || "No analysis available.").trim();
  const suggestion = String(result.fixSuggestion || "No fix suggestion available.").trim();
  const patch = String(result.patch || "").trim();

  const patchSection = patch
    ? `🛠️ CODE PATCH\n\`\`\`diff\n${patch}\n\`\`\``
    : "🛠️ CODE PATCH\n```diff\n# No patch generated\n```";

  return [
    "🧠 BUG ANALYSIS",
    `Problem: ${analysis}`,
    "",
    "💡 FIX SUGGESTION",
    suggestion,
    "",
    patchSection,
  ].join("\n");
}

export function withFormattedOutput(
  result: Omit<FixSuggestionResult, "formatted">,
): FixSuggestionResult {
  return {
    ...result,
    formatted: formatFixSuggestion({
      analysis: result.analysis,
      fixSuggestion: result.fixSuggestion,
      patch: result.patch,
    }),
  };
}
