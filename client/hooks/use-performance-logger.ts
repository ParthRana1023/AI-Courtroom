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
  threshold: number = 16
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
 * Create a timer for measuring operation duration.
 * Useful for API calls and other async operations.
 *
 * @example
 * function MyComponent() {
 *   const timer = useApiTimer();
 *
 *   const handleClick = async () => {
 *     const startTime = timer.start();
 *     try {
 *       await fetchData();
 *       timer.end("fetchData", startTime);
 *     } catch (error) {
 *       timer.end("fetchData", startTime, error);
 *     }
 *   };
 * }
 */
export function useApiTimer(): {
  start: () => number;
  end: (operation: string, startTime: number, error?: Error) => number;
} {
  return {
    start: () => performance.now(),
    end: (operation: string, startTime: number, error?: Error) => {
      const duration = performance.now() - startTime;

      if (error) {
        logger.error(`${operation} failed`, error, {
          duration_ms: Math.round(duration),
        });
      } else {
        logger.info(`${operation} completed`, {
          duration_ms: Math.round(duration),
        });
      }

      return duration;
    },
  };
}

/**
 * Log effect execution time.
 * Useful for tracking expensive effects.
 *
 * @param effectName - Name of the effect
 * @param dependencies - Effect dependencies (for logging)
 *
 * @example
 * useEffectLogger("fetchUserData", [userId], async () => {
 *   const data = await fetchUser(userId);
 *   setUser(data);
 * });
 */
export function useEffectLogger(
  effectName: string,
  dependencies: unknown[],
  effect: () => void | Promise<void> | (() => void)
): void {
  useEffect(() => {
    const startTime = performance.now();

    logger.debug(`Effect starting: ${effectName}`, {
      dependencies: dependencies.map((d) =>
        typeof d === "object" ? "[object]" : String(d)
      ),
    });

    const result = effect();

    // Handle async effects
    if (result instanceof Promise) {
      result
        .then(() => {
          const duration = performance.now() - startTime;
          logger.debug(`Effect completed: ${effectName}`, {
            duration_ms: Math.round(duration),
          });
        })
        .catch((error) => {
          const duration = performance.now() - startTime;
          logger.error(`Effect failed: ${effectName}`, error as Error, {
            duration_ms: Math.round(duration),
          });
        });
      return;
    }

    // Sync effect
    const duration = performance.now() - startTime;
    logger.debug(`Effect completed: ${effectName}`, {
      duration_ms: Math.round(duration),
    });

    // Handle cleanup function
    if (typeof result === "function") {
      return () => {
        logger.debug(`Effect cleanup: ${effectName}`);
        result();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
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
