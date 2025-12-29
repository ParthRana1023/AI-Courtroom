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

  // Confirmation preferences for power users
  skipArchiveConfirmation: boolean;
  setSkipArchiveConfirmation: (value: boolean) => void;
  skipDeleteConfirmation: boolean;
  setSkipDeleteConfirmation: (value: boolean) => void;
}

const defaultSettings = {
  enterKeySubmits: true,
  autoExpandTextAreas: true,
  textSize: "medium" as const,
  skipArchiveConfirmation: false,
  skipDeleteConfirmation: false,
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
  const [skipArchiveConfirmation, setSkipArchiveConfirmation] =
    useState<boolean>(defaultSettings.skipArchiveConfirmation);
  const [skipDeleteConfirmation, setSkipDeleteConfirmation] = useState<boolean>(
    defaultSettings.skipDeleteConfirmation
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
          setSkipArchiveConfirmation(
            parsedSettings.skipArchiveConfirmation ??
              defaultSettings.skipArchiveConfirmation
          );
          setSkipDeleteConfirmation(
            parsedSettings.skipDeleteConfirmation ??
              defaultSettings.skipDeleteConfirmation
          );
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
          skipArchiveConfirmation,
          skipDeleteConfirmation,
        })
      );
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
    }
  }, [
    enterKeySubmits,
    autoExpandTextAreas,
    textSize,
    skipArchiveConfirmation,
    skipDeleteConfirmation,
  ]);

  return (
    <SettingsContext.Provider
      value={{
        enterKeySubmits,
        setEnterKeySubmits,
        autoExpandTextAreas,
        setAutoExpandTextAreas,
        textSize,
        setTextSize,
        skipArchiveConfirmation,
        setSkipArchiveConfirmation,
        skipDeleteConfirmation,
        setSkipDeleteConfirmation,
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
