"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";

const THEME_COLOR = { dark: "#070504", light: "#d9cfbb" } as const;

export function useThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const resolved = mounted && resolvedTheme === "light" ? "light" : "dark";
  return {
    label: resolved === "light" ? "Switch to dark theme" : "Switch to light theme",
    name: `Theme · ${mounted && theme === "system" ? "Device" : resolved === "light" ? "Light" : "Dark"}`,
    toggle: () => setTheme(resolved === "light" ? "dark" : "light"),
  };
}

/** Keeps <meta name="theme-color"> in step with the resolved theme. */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color = THEME_COLOR[resolvedTheme === "light" ? "light" : "dark"];
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme]);
  return null;
}

export function ThemeGlyph({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="rounded-full border-[1.5px] border-current"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(90deg,currentColor 50%,transparent 50%)",
      }}
    />
  );
}
