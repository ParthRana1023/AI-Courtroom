/**
 * Performance logging hooks for React components.
 * Use these to track render times and API call durations.
 */

import { useEffect, useRef } from "react";
import { getLogger } from "@/lib/logger";

const logger = getLogger("performance");

/**
 * Log component render performance.
 * Logs a warning if render time exceeds the threshold.
 *
 * @param componentName - Name of the component being measured
 * @param threshold - Duration threshold in ms (default: 16ms = 60fps budget)
 *
 * @example
 * function MyComponent() {
 *   useRenderLogger("MyComponent");
 *   return <div>...</div>;
 * }
 */
export function useRenderLogger(
  componentName: string,
  threshold: number = 16,
): void {
  const renderStart = useRef(performance.now());
  const renderCount = useRef(0);

  useEffect(() => {
    const duration = performance.now() - renderStart.current;
    renderCount.current += 1;

    if (duration > threshold) {
      logger.warn(`Slow render: ${componentName}`, {
        duration_ms: Math.round(duration),
        threshold_ms: threshold,
        render_count: renderCount.current,
      });
    } else if (process.env.NODE_ENV === "development") {
      logger.debug(`Render: ${componentName}`, {
        duration_ms: Math.round(duration),
        render_count: renderCount.current,
      });
    }

    // Reset for next render
    renderStart.current = performance.now();
  });
}

/**
 * Track component mount/unmount lifecycle
 *
 * @param componentName - Name of the component
 *
 * @example
 * function MyComponent() {
 *   useLifecycleLogger("MyComponent");
 *   return <div>...</div>;
 * }
 */
export function useLifecycleLogger(componentName: string): void {
  useEffect(() => {
    logger.debug(`Component mounted: ${componentName}`);

    return () => {
      logger.debug(`Component unmounted: ${componentName}`);
    };
  }, [componentName]);
}
