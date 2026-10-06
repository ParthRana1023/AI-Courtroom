"use client";

import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { getLogger } from "@/lib/logger";
import { ErrorSheet } from "@/components/chrome/error-screen";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const logger = getLogger("error");

/**
 * React Error Boundary with automatic logging.
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and displays a fallback UI.
 */
export class LoggingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error with component stack
    logger.error("React component crashed", error, {
      componentStack: errorInfo.componentStack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-dvh flex-col">
          <ErrorSheet />
        </div>
      );
    }

    return this.props.children;
  }
}
