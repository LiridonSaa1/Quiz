import React from "react";
import { reportErrorToTelegram } from "../lib/telegramLogger";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  reloading: boolean;
};

// Transient errors caused by Vite HMR / stale module cache — safe to auto-reload
const TRANSIENT_PATTERNS = [
  "Cannot read properties of null",
  "Cannot read property",
  "null is not an object",
  "undefined is not an object",
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
];

function isTransientError(err: Error): boolean {
  const msg = err?.message || "";
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, reloading: false };

  static getDerivedStateFromError(): State {
    return { hasError: true, reloading: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (isTransientError(error)) {
      // Stale Vite/HMR chunk — silently reload once
      sessionStorage.setItem("__eb_reload_ts", String(Date.now()));
      window.location.reload();
      this.setState({ reloading: true });
      return;
    }
    reportErrorToTelegram({
      layer: "FRONTEND",
      message: error.message || "React component error",
      stack: `${error.stack || ""}\n${errorInfo.componentStack || ""}`.trim(),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  }

  handleReload = () => {
    this.setState({ reloading: true });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.reloading) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100vh", fontFamily: "sans-serif", color: "#64748b",
          flexDirection: "column", gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "3px solid #e2e8f0", borderTopColor: "#6366f1",
            animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ margin: 0, fontSize: 14 }}>Reloading…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100vh", fontFamily: "sans-serif",
          flexDirection: "column", gap: 16, padding: 24,
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ margin: 0, fontSize: 20, color: "#1e293b" }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b", textAlign: "center", maxWidth: 360 }}>
            An unexpected error occurred. The issue has been reported automatically.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: 8, padding: "10px 24px", borderRadius: 10,
              background: "linear-gradient(135deg,#6366f1,#818cf8)",
              color: "#fff", border: "none", fontSize: 14,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
