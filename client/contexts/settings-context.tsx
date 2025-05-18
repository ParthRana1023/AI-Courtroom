"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface SettingsContextType {
  // Enter key behavior: true = submit on Enter, false = new line on Enter (submit with Shift+Enter)
  enterKeySubmits: boolean;
  setEnterKeySubmits: (value: boolean) => void;

  // Auto-expand text areas
  autoExpandTextAreas: boolean;
  setAutoExpandTextAreas: (value: boolean) => void;

  // Text size (small, medium, large)
  textSize: "small" | "medium" | "large";
  setTextSize: (size: "small" | "medium" | "large") => void;
}

const defaultSettings: Omit<
  SettingsContextType,
  "setEnterKeySubmits" | "setAutoExpandTextAreas" | "setTextSize"
> = {
  enterKeySubmits: true,
  autoExpandTextAreas: true,
  textSize: "medium",
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [enterKeySubmits, setEnterKeySubmits] = useState<boolean>(
    defaultSettings.enterKeySubmits
  );
  const [autoExpandTextAreas, setAutoExpandTextAreas] = useState<boolean>(
    defaultSettings.autoExpandTextAreas
  );
  const [textSize, setTextSize] = useState<"small" | "medium" | "large">(
    defaultSettings.textSize
  );

  // Load settings from localStorage on initial render
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedSettings = localStorage.getItem("aiCourtroom-settings");
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          setEnterKeySubmits(
            parsedSettings.enterKeySubmits ?? defaultSettings.enterKeySubmits
          );
          setAutoExpandTextAreas(
            parsedSettings.autoExpandTextAreas ??
              defaultSettings.autoExpandTextAreas
          );
          setTextSize(parsedSettings.textSize ?? defaultSettings.textSize);
        }
      } catch (error) {
        console.error("Failed to load settings from localStorage:", error);
      }
    };

    loadSettings();
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        "aiCourtroom-settings",
        JSON.stringify({
          enterKeySubmits,
          autoExpandTextAreas,
          textSize,
        })
      );
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
    }
  }, [enterKeySubmits, autoExpandTextAreas, textSize]);

  return (
    <SettingsContext.Provider
      value={{
        enterKeySubmits,
        setEnterKeySubmits,
        autoExpandTextAreas,
        setAutoExpandTextAreas,
        textSize,
        setTextSize,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
