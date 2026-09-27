/**
 * Datetime and timezone utility functions for AI-Courtroom
 * Provides consistent datetime handling across the application
 */

// Default timezone for the application
const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Get current datetime as Date object adjusted for Asia/Kolkata timezone
 */
function getCurrentDateTimeAsDate(): Date {
  const now = new Date();
  return new Date(
    now.toLocaleString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
    }),
  );
}

/**
 * Format a date to local date string
 */
export function formatToLocaleDateString(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString();
}

/**
 * Format a date to locale date and time string
 */
export function formatToLocaleString(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleString();
}

/**
 * Create a timestamp offset by specified milliseconds (for AI responses)
 */
export function createOffsetDate(offsetMs: number): Date {
  const now = getCurrentDateTimeAsDate();
  const offsetDate = new Date(now.getTime() + offsetMs);
  return offsetDate;
}
