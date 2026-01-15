/**
 * Client-side structured logging system for AI Courtroom.
 * Mirrors server-side logging patterns with browser adaptations.
 *
 * Features:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Sensitive data masking (emails, tokens, passwords)
 * - Colored console output in development
 * - Remote logging to FastAPI backend
 * - Session and user ID tracking
 * - Performance timing utilities
 */

// Log levels matching common standards
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

// Best practice categories for organizing logs
export type LogCategory =
  | "api" // HTTP requests, responses, errors
  | "auth" // Login, logout, token refresh
  | "courtroom" // Case arguments, verdicts, analysis
  | "cases" // Case CRUD operations
  | "ui" // User interactions, navigation
  | "performance" // Render times, API latency
  | "error" // Uncaught errors, boundary catches
  | "cookies" // Consent changes (compliance)
  | "general"; // Default category

// Structured log entry matching backend schema
export interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  category: LogCategory;
  message: string;
  session_id: string;
  user_id?: string;
  url: string;
  user_agent: string;
  context?: Record<string, unknown>;
  duration_ms?: number;
  error_name?: string;
  error_stack?: string;
  component_stack?: string;
}

// Sensitive data patterns (same as server-side)
const SENSITIVE_PATTERNS = {
  // Mask emails: john.doe@email.com -> j***@email.com
  email: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  // Mask JWT tokens
  token: /(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)/g,
  // Mask passwords
  password: /(password["']?\s*[:=]\s*["']?)([^"'\}\s]+)/gi,
  // Mask API keys
  apiKey: /(api[_-]?key["']?\s*[:=]\s*["']?)([a-zA-Z0-9_-]{20,})/gi,
};

// Console colors for development
const CONSOLE_COLORS = {
  debug: "#6B7280", // gray
  info: "#10B981", // green
  warn: "#F59E0B", // amber
  error: "#EF4444", // red
};

// Generate a unique session ID
function generateSessionId(): string {
  if (typeof window !== "undefined") {
    // Try to get existing session ID from sessionStorage
    const existing = sessionStorage.getItem("log_session_id");
    if (existing) return existing;

    // Generate new session ID
    const newId = Math.random().toString(36).substring(2, 10);
    sessionStorage.setItem("log_session_id", newId);
    return newId;
  }
  return "ssr";
}

// Get current timestamp in ISO format
function getTimestamp(): string {
  return new Date().toISOString();
}

// Get current URL safely
function getCurrentUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.pathname + window.location.search;
  }
  return "server";
}

// Get user agent safely
function getUserAgent(): string {
  if (typeof window !== "undefined") {
    return navigator.userAgent;
  }
  return "server";
}

// Log transport interface
interface LogTransport {
  log(entry: LogEntry): void;
  flush?(): Promise<void>;
}

/**
 * Console transport with colored output (development only)
 */
class ConsoleTransport implements LogTransport {
  private isDev: boolean;

  constructor() {
    this.isDev = process.env.NODE_ENV === "development";
  }

  log(entry: LogEntry): void {
    if (typeof window === "undefined") return;

    const color = CONSOLE_COLORS[entry.level];
    const prefix = `[${
      entry.timestamp.split("T")[1].split(".")[0]
    }] [${entry.level.toUpperCase()}] [${entry.category}]`;
    const contextStr = entry.context ? entry.context : "";

    if (this.isDev) {
      // Colored output in development
      if (entry.level === "error") {
        console.error(
          `%c${prefix}`,
          `color: ${color}; font-weight: bold`,
          entry.message,
          contextStr
        );
        if (entry.error_stack) {
          console.error(entry.error_stack);
        }
      } else if (entry.level === "warn") {
        console.warn(
          `%c${prefix}`,
          `color: ${color}; font-weight: bold`,
          entry.message,
          contextStr
        );
      } else if (entry.level === "info") {
        console.info(
          `%c${prefix}`,
          `color: ${color}`,
          entry.message,
          contextStr
        );
      } else {
        console.debug(
          `%c${prefix}`,
          `color: ${color}`,
          entry.message,
          contextStr
        );
      }
    } else {
      // Plain output in production (only warn and error should reach here)
      if (entry.level === "error") {
        console.error(prefix, entry.message, contextStr);
      } else if (entry.level === "warn") {
        console.warn(prefix, entry.message, contextStr);
      }
    }
  }
}

/**
 * Remote transport for sending logs to FastAPI backend
 */
class RemoteTransport implements LogTransport {
  private queue: LogEntry[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly batchSize = 10;
  private readonly flushInterval = 5000; // 5 seconds
  private readonly endpoint: string;
  private isEnabled: boolean;

  constructor() {
    this.endpoint = `${process.env.NEXT_PUBLIC_API_URL || ""}/logs/client`;
    this.isEnabled =
      process.env.NEXT_PUBLIC_LOG_REMOTE_ENABLED === "true" ||
      process.env.NODE_ENV === "production";

    // Flush on page unload
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.flush());
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.flush();
        }
      });
    }
  }

  log(entry: LogEntry): void {
    if (!this.isEnabled) return;

    // Only send warn and error logs to remote
    if (entry.level !== "warn" && entry.level !== "error") return;

    this.queue.push(entry);

    // Immediate flush for errors
    if (entry.level === "error") {
      this.flush();
      return;
    }

    // Batch flush for warnings
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.queue.length === 0) return;

    const logs = [...this.queue];
    this.queue = [];

    try {
      // Use sendBeacon for reliability on page unload
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const sent = navigator.sendBeacon(
          this.endpoint,
          JSON.stringify({ logs })
        );
        if (!sent) {
          // Fallback to fetch if sendBeacon fails
          await this.sendWithFetch(logs);
        }
      } else {
        await this.sendWithFetch(logs);
      }
    } catch (error) {
      // Re-add to queue if failed (will retry on next flush)
      // But limit queue size to prevent memory issues
      if (this.queue.length < 100) {
        this.queue.unshift(...logs);
      }
      // Don't use logger here to avoid infinite loop
      if (process.env.NODE_ENV === "development") {
        console.error("[Logger] Failed to send logs to server:", error);
      }
    }
  }

  private async sendWithFetch(logs: LogEntry[]): Promise<void> {
    await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
      keepalive: true,
    });
  }
}

/**
 * Main Logger class
 */
export class Logger {
  private category: LogCategory;
  private static level: LogLevel =
    process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.WARN;
  private static userId: string | undefined;
  private static sessionId: string = generateSessionId();
  private static transports: LogTransport[] = [
    new ConsoleTransport(),
    new RemoteTransport(),
  ];

  constructor(category: LogCategory = "general") {
    this.category = category;
  }

  /**
   * Configure logger globally
   */
  static configure(options: { level?: LogLevel; userId?: string }): void {
    if (options.level !== undefined) {
      Logger.level = options.level;
    }
    if (options.userId !== undefined) {
      Logger.userId = options.userId;
    }
  }

  /**
   * Set current user ID (call on login/logout)
   */
  static setUserId(userId: string | undefined): void {
    Logger.userId = userId;
  }

  /**
   * Get current session ID
   */
  static getSessionId(): string {
    return Logger.sessionId;
  }

  /**
   * Mask sensitive data in text
   */
  private maskSensitive(text: string): string {
    let result = text;

    // Mask emails: john.doe@email.com -> j***@email.com
    result = result.replace(
      SENSITIVE_PATTERNS.email,
      (_, user, domain) => `${user[0]}***@${domain}`
    );

    // Mask JWT tokens
    result = result.replace(SENSITIVE_PATTERNS.token, "[REDACTED_TOKEN]");

    // Mask passwords
    result = result.replace(SENSITIVE_PATTERNS.password, "$1[REDACTED]");

    // Mask API keys
    result = result.replace(SENSITIVE_PATTERNS.apiKey, "$1[REDACTED_KEY]");

    return result;
  }

  /**
   * Mask sensitive data in context object
   */
  private maskContext(
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      if (typeof value === "string") {
        masked[key] = this.maskSensitive(value);
      } else if (typeof value === "object" && value !== null) {
        masked[key] = this.maskContext(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    levelName: "debug" | "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check log level
    if (level < Logger.level) return;

    // Create log entry
    const entry: LogEntry = {
      timestamp: getTimestamp(),
      level: levelName,
      category: this.category,
      message: this.maskSensitive(message),
      session_id: Logger.sessionId,
      user_id: Logger.userId,
      url: getCurrentUrl(),
      user_agent: getUserAgent(),
    };

    // Add masked context
    if (context) {
      entry.context = this.maskContext(context);
    }

    // Add error details
    if (error) {
      entry.error_name = error.name;
      entry.error_stack = error.stack;
    }

    // Send to all transports
    for (const transport of Logger.transports) {
      try {
        transport.log(entry);
      } catch (e) {
        // Silently ignore transport errors
      }
    }
  }

  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, "debug", message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, "info", message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, "warn", message, context);
  }

  /**
   * Log error message with optional Error object
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ): void {
    this.log(LogLevel.ERROR, "error", message, context, error);
  }

  /**
   * Start a performance timer
   * Returns a function that, when called, logs the elapsed time
   */
  time(label: string): () => number {
    const start = performance.now();

    return () => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { duration_ms: Math.round(duration) });
      return duration;
    };
  }

  /**
   * Create a child logger with a specific category
   */
  child(category: LogCategory): Logger {
    return new Logger(category);
  }
}

/**
 * Factory function to get a logger for a specific category
 */
export function getLogger(category: LogCategory = "general"): Logger {
  return new Logger(category);
}

/**
 * Default logger instance
 */
export const logger = getLogger("general");
