type ErrorLayer = "FRONTEND" | "BACKEND" | "DATABASE";

type ErrorReportParams = {
  layer: ErrorLayer;
  message: string;
  stack?: string;
  url?: string;
  timestamp?: string;
  file?: string;
  line?: number;
  userAgent?: string;
  userId?: string;
};

function getBackendBaseUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const raw = env.VITE_API_BASE_URL || "";
  return raw.trim().replace(/\/$/, "");
}

function normalizeLine(value: string): string {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

function truncate(value: string, max = 3000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function getCurrentUserHint(): string | undefined {
  try {
    const keys = Object.keys(localStorage);
    const sbAuthKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!sbAuthKey) return undefined;
    const raw = localStorage.getItem(sbAuthKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as any;
    const maybeUserId =
      parsed?.currentSession?.user?.id ||
      parsed?.user?.id ||
      parsed?.session?.user?.id;
    if (typeof maybeUserId === "string" && maybeUserId.trim()) return maybeUserId.trim();
    return undefined;
  } catch {
    return undefined;
  }
}

export function formatTelegramErrorMessage(params: ErrorReportParams): string {
  const url = normalizeLine(params.url || window.location.href);
  const message = normalizeLine(params.message || "Unknown error");
  const stackValue = normalizeLine(params.stack || "N/A");
  const timestamp = normalizeLine(params.timestamp || new Date().toISOString());
  const file = normalizeLine(params.file || "N/A");
  const line = Number.isFinite(Number(params.line)) ? String(params.line) : "N/A";
  const userAgent = normalizeLine(params.userAgent || navigator.userAgent || "N/A");

  return truncate(
    [
      "🚨 ERROR ALERT",
      `Layer: ${params.layer}`,
      `Message: ${message}`,
      `File: ${file}`,
      `Line: ${line}`,
      `URL: ${url}`,
      `Stack: ${stackValue}`,
      `Time: ${timestamp}`,
      `UserAgent: ${userAgent}`,
      `User: ${normalizeLine(params.userId || "N/A")}`,
    ].join("\n"),
  );
}

export async function sendToTelegram(message: string): Promise<void> {
  const base = getBackendBaseUrl();
  const endpoint = `${base}/api/log-error`;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layer: "FRONTEND",
        message: truncate(message, 3900),
        timestamp: new Date().toISOString(),
        currentUrl: window.location.href,
        userAgent: navigator.userAgent,
        source: "frontend.message",
      }),
      keepalive: true,
    });
  } catch {
    // Logging must never break the app.
  }
}

export function reportErrorToTelegram(params: ErrorReportParams): void {
  const payload = {
    layer: params.layer,
    message: params.message,
    stack: params.stack,
    currentUrl: params.url || window.location.href,
    timestamp: params.timestamp || new Date().toISOString(),
    file: params.file,
    line: params.line,
    userAgent: params.userAgent || navigator.userAgent,
    userId: params.userId || getCurrentUserHint(),
    source: "frontend.capture",
    formatted: formatTelegramErrorMessage(params),
  };
  const base = getBackendBaseUrl();
  const endpoint = `${base}/api/log-error`;
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Never break execution due to logging.
  });
}
