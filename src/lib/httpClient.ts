import { reportErrorToTelegram } from "./telegramLogger";

function toMethod(init?: RequestInit): string {
  return String(init?.method || "GET").toUpperCase();
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function monitoredFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = toMethod(init);
  const requestUrl = toUrl(input);

  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      reportErrorToTelegram({
        layer: "FRONTEND",
        message: `HTTP ${res.status} ${res.statusText || ""} on ${method} ${requestUrl}`.trim(),
        stack: undefined,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      });
    }
    return res;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    reportErrorToTelegram({
      layer: "FRONTEND",
      message: `Network/API failure on ${method} ${requestUrl}: ${err.message}`,
      stack: err.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
    throw error;
  }
}
