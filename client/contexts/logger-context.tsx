"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Logger, getLogger, LogLevel, type LogCategory } from "@/lib/logger";
import { initBrowserErrorHandlers } from "@/lib/browser-error-handler";

interface LoggerContextValue {
  logger: Logger;
  setUserId: (userId: string | undefined) => void;
}

const LoggerContext = createContext<LoggerContextValue | undefined>(undefined);

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

  const setUserId = (userId: string | undefined) => {
    Logger.setUserId(userId);
    if (userId) {
      loggerInstance.debug("User ID set", { userId });
    } else {
      loggerInstance.debug("User ID cleared");
    }
  };

  return (
    <LoggerContext.Provider value={{ logger: loggerInstance, setUserId }}>
      {children}
    </LoggerContext.Provider>
  );
}

/**
 * Hook to get a logger instance
 * @param category - Optional category for the logger (defaults to "general")
 */
export function useLogger(category: LogCategory = "general"): Logger {
  const context = useContext(LoggerContext);

  // Return a category-specific logger
  if (context) {
    return context.logger.child(category);
  }

  // Fallback if used outside provider (shouldn't happen in normal usage)
  return getLogger(category);
}

/**
 * Hook to get the setUserId function
 * Useful in auth context to track logged-in users
 */
export function useLoggerUserId(): (userId: string | undefined) => void {
  const context = useContext(LoggerContext);

  if (!context) {
    // Return a no-op if used outside provider
    return () => {};
  }

  return context.setUserId;
}
