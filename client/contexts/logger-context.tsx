"use client";

import { useEffect, type ReactNode } from "react";
import { Logger, getLogger, LogLevel } from "@/lib/logger";
import { initBrowserErrorHandlers } from "@/lib/browser-error-handler";

export function LoggerProvider({ children }: { children: ReactNode }) {
  const loggerInstance = getLogger("general");

  useEffect(() => {
    // Initialize browser error handlers
    initBrowserErrorHandlers();

    // Configure log level based on environment
    const isDev = process.env.NODE_ENV === "development";
    Logger.configure({
      level: isDev ? LogLevel.DEBUG : LogLevel.WARN,
    });

    loggerInstance.info("Logger initialized", {
      environment: process.env.NODE_ENV,
      logLevel: isDev ? "debug" : "warn",
      sessionId: Logger.getSessionId(),
    });

    // Log page visibility changes for debugging session issues
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        loggerInstance.debug("Page hidden");
      } else {
        loggerInstance.debug("Page visible");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loggerInstance]);

  return children;
}
