export type ErrorData = {
  message: string;
  stack?: string;
  fileName?: string;
  lineNumber?: number;
  currentUrl?: string;
  rawLog?: string;
};

export type ResolvedCodeContext = {
  fileName: string;
  requestedLineNumber?: number;
  startLine: number;
  endLine: number;
  snippet: string;
};

export type FixSuggestionResult = {
  analysis: string;
  fixSuggestion: string;
  patch?: string;
  formatted: string;
  model: string;
  timestamp: string;
  assumptions?: string[];
  context?: ResolvedCodeContext | null;
};
