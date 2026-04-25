import React from "react";
import { reportErrorToTelegram } from "../lib/telegramLogger";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportErrorToTelegram({
      layer: "FRONTEND",
      message: error.message || "React component error",
      stack: `${error.stack || ""}\n${errorInfo.componentStack || ""}`.trim(),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h2>Something went wrong.</h2>
          <p>The error has been reported automatically.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
