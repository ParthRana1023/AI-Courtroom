"use client";

import { useEffect } from "react";
import { useSettings } from "@/contexts/settings-context";

// This component applies the text size setting to the body element
// and ensures proper theme compatibility
export default function TextSizeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { textSize } = useSettings();

  useEffect(() => {
    // Remove any existing text size classes
    document.body.classList.remove(
      "text-size-small",
      "text-size-medium",
      "text-size-large"
    );

    // Add the appropriate class based on the current setting
    document.body.classList.add(`text-size-${textSize}`);

    // Ensure the text-size classes inherit colors properly
    const applyThemeCompatibility = () => {
      // This ensures our text-size styles properly respect the theme colors
      const isDarkMode = document.documentElement.classList.contains("dark");
      if (isDarkMode) {
        document.body.classList.add("theme-dark");
        document.documentElement.style.setProperty(
          "--foreground-rgb",
          "255, 255, 255"
        );
      } else {
        document.body.classList.remove("theme-dark");
        document.documentElement.style.setProperty(
          "--foreground-rgb",
          "0, 0, 0"
        );
      }
    };

    // Apply immediately
    applyThemeCompatibility();

    // Set up an observer to detect theme changes
    const observer = new MutationObserver(applyThemeCompatibility);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [textSize]);

  return <>{children}</>;
}
