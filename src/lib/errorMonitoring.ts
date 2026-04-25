import { reportErrorToTelegram } from "./telegramLogger";

let initialized = false;

function toErrorLike(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message || "Unknown error", stack: value.stack };
  }
  if (typeof value === "string") {
    return { message: value };
  }
  try {
    return { message: JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
}

export function initGlobalErrorMonitoring(): void {
  if (initialized) return;
  initialized = true;

  window.onerror = (message, source, lineno, colno, error) => {
    const fallbackMessage = [
      String(message || "Unknown runtime error"),
      source ? `at ${source}:${lineno}:${colno}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const details = toErrorLike(error ?? fallbackMessage);

    reportErrorToTelegram({
      layer: "FRONTEND",
      message: details.message,
      stack: details.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      file: typeof source === "string" ? source : undefined,
      line: Number.isFinite(Number(lineno)) ? Number(lineno) : undefined,
      userAgent: navigator.userAgent,
    });

    return false;
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const details = toErrorLike(event.reason);
    reportErrorToTelegram({
      layer: "FRONTEND",
      message: `Unhandled Promise Rejection: ${details.message}`,
      stack: details.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  };
}
