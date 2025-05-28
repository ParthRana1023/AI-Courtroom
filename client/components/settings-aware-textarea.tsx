"use client";

import React, {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { useSettings } from "@/contexts/settings-context";

interface SettingsAwareTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export default function SettingsAwareTextArea({
  value,
  onChange,
  onSubmit,
  placeholder,
  className = "",
  disabled = false,
  minHeight = 100,
  maxHeight = 400,
}: SettingsAwareTextAreaProps) {
  const { enterKeySubmits, autoExpandTextAreas, textSize } = useSettings();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Adjust height based on content if auto-expand is enabled
  useEffect(() => {
    if (autoExpandTextAreas && textareaRef.current) {
      const textarea = textareaRef.current;
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";
      // Set the height to the scrollHeight, but constrain between min and max
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight)
      );
      textarea.style.height = `${newHeight}px`;
    }
  }, [value, autoExpandTextAreas, minHeight, maxHeight]);

  // Get text size class based on setting
  const getTextSizeClass = () => {
    switch (textSize) {
      case "small":
        return "text-sm";
      case "large":
        return "text-lg";
      default:
        return "text-base";
    }
  };

  // Handle key presses for Enter key behavior
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    console.log(
      "Key pressed:",
      e.key,
      "Enter submits:",
      enterKeySubmits,
      "Shift pressed:",
      e.shiftKey
    );
    // Handle Enter key based on settings
    if (e.key === "Enter") {
      if (enterKeySubmits && !e.shiftKey) {
        // Enter submits, Shift+Enter creates new line
        e.preventDefault();
        onSubmit?.(e);
      } else if (!enterKeySubmits && e.ctrlKey) {
        // Ctrl+Enter submits when Enter creates new line
        e.preventDefault();
        onSubmit?.(e);
      }
    }
  };

  // Handle text changes
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${getTextSizeClass()} ${className}`}
      style={{
        minHeight: `${minHeight}px`,
        height: autoExpandTextAreas ? "auto" : `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
        overflowY: "auto",
      }}
    />
  );
}
