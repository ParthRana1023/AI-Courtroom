/**
 * Global browser error handlers.
 * Captures errors that escape React's error boundary.
 */

import { getLogger } from "./logger";

const logger = getLogger("error");

let initialized = false;

/**
 * Initialize global browser error handlers.
 * Captures:
 * - Uncaught JavaScript errors (window.onerror)
 * - Unhandled promise rejections (window.onunhandledrejection)
 * - Resource load errors (images, scripts)
 */
export function initBrowserErrorHandlers(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;

  initialized = true;

  // Store original handlers
  const originalOnError = window.onerror;
  const originalOnUnhandledRejection = window.onunhandledrejection;

  /**
   * Capture uncaught JavaScript errors
   * Example: undefined.foo() outside of React
   */
  window.onerror = (
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
  ): boolean => {
    const errorMessage =
      typeof message === "string" ? message : "Unknown error";

    logger.error(
      "Uncaught JavaScript error",
      error || new Error(errorMessage),
      {
        type: "window.onerror",
        source: source || "unknown",
        line: lineno,
        column: colno,
      }
    );

    // Call original handler if it exists
    if (originalOnError) {
      return originalOnError.call(
        window,
        message,
        source,
        lineno,
        colno,
        error
      );
    }

    // Don't prevent default error handling
    return false;
  };

  /**
   * Capture unhandled promise rejections
   * Example: fetch().then() without .catch()
   */
  window.onunhandledrejection = (event: PromiseRejectionEvent): void => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

    logger.error("Unhandled promise rejection", error, {
      type: "unhandledrejection",
      reason:
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason),
    });

    // Call original handler if it exists
    if (originalOnUnhandledRejection) {
      originalOnUnhandledRejection.call(window, event);
    }
  };

  /**
   * Capture resource load errors (images, scripts, stylesheets)
   * Uses capture phase to catch errors before they bubble
   */
  window.addEventListener(
    "error",
    (event: ErrorEvent) => {
      // Only handle resource errors, not JavaScript errors
      // Resource errors have a target that is an HTML element
      const target = event.target as HTMLElement | null;

      if (target && "tagName" in target && target.tagName) {
        const tagName = target.tagName.toLowerCase();
        const src =
          (target as HTMLImageElement).src ||
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          "unknown";

        // Don't log favicon errors (common and noisy)
        if (src.includes("favicon")) return;

        logger.warn("Resource failed to load", {
          type: "resource",
          tagName,
          src,
        });
      }
    },
    true // Use capture phase
  );

  // Log that error handlers are initialized
  logger.debug("Browser error handlers initialized");
}

/**
 * Create a wrapped version of a function that logs errors
 */
export function withErrorLogging<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context?: Record<string, unknown>
): T {
  return ((...args: unknown[]) => {
    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error: Error) => {
          logger.error("Async function error", error, context);
          throw error;
        });
      }

      return result;
    } catch (error) {
      logger.error("Function error", error as Error, context);
      throw error;
    }
  }) as T;
}
