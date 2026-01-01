"use client";

import { ThemeTogglerButton } from "@/components/animate-ui/components/buttons/theme-toggler";

export function ThemeToggle() {
  return (
    <ThemeTogglerButton
      modes={["light", "dark"]}
      variant="ghost"
      size="sm"
      className="text-zinc-400 hover:text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-800 focus:ring-white"
      aria-label="Toggle theme"
    />
  );
}
