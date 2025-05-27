/**
 * Datetime and timezone utility functions for AI-Courtroom
 * Provides consistent datetime handling across the application
 */

// Default timezone for the application
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Get current datetime in ISO string format with Asia/Kolkata timezone
 */
export function getCurrentDateTime(): string {
  const now = new Date();
  const kolkataTime = new Date(
    now.toLocaleString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
    })
  );
  return kolkataTime.toISOString();
}

/**
 * Get current datetime as Date object adjusted for Asia/Kolkata timezone
 */
export function getCurrentDateTimeAsDate(): Date {
  const now = new Date();
  return new Date(
    now.toLocaleString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
    })
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
 * Format a date to locale time string
 */
export function formatToLocaleTimeString(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleTimeString();
}

/**
 * Format a date to locale date and time string
 */
export function formatToLocaleString(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleString();
}

/**
 * Create a timestamp for arguments with proper timezone handling
 */
export function createArgumentTimestamp(): string {
  return getCurrentDateTime();
}

/**
 * Create a timestamp offset by specified seconds (for AI responses)
 */
export function createOffsetTimestamp(offsetSeconds: number): string {
  const now = new Date();
  const kolkataTime = new Date(
    now.toLocaleString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
    })
  );
  kolkataTime.setSeconds(kolkataTime.getSeconds() + offsetSeconds);
  return kolkataTime.toISOString();
}

/**
 * Create a timestamp offset by specified milliseconds (for AI responses)
 */
export function createOffsetDate(offsetMs: number): Date {
  const now = getCurrentDateTimeAsDate();
  const offsetDate = new Date(now.getTime() + offsetMs);
  return offsetDate;
}

/**
 * Get current year for copyright notices
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Validate if a date is in the past and within reasonable age limits
 */
export function isValidBirthDate(dateValue: string): boolean {
  const date = new Date(dateValue);
  const today = new Date();
  return (
    date < today &&
    date >
      new Date(today.getFullYear() - 100, today.getMonth(), today.getDate())
  );
}

/**
 * Sort arguments by timestamp in chronological order
 */
export function sortByTimestamp<T extends { timestamp?: string }>(
  items: T[]
): T[] {
  return items.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    return 0;
  });
}

/**
 * Convert timestamp to Asia/Kolkata timezone for display
 */
export function toKolkataTime(timestamp: string | Date): Date {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return new Date(date.toLocaleString("en-US", { timeZone: DEFAULT_TIMEZONE }));
}
