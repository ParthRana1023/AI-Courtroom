"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, Save, Check, ArrowLeft } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import Navigation from "@/components/navigation";

// Add custom styles for animations
import "./settings.css";

export default function SettingsPage() {
  const router = useRouter();
  const {
    enterKeySubmits,
    setEnterKeySubmits,
    autoExpandTextAreas,
    setAutoExpandTextAreas,
    textSize,
    setTextSize,
  } = useSettings();

  // Local state to track changes before saving
  const [localEnterKeySubmits, setLocalEnterKeySubmits] =
    useState(enterKeySubmits);
  const [localAutoExpandTextAreas, setLocalAutoExpandTextAreas] =
    useState(autoExpandTextAreas);
  const [localTextSize, setLocalTextSize] = useState(textSize);
  const [saveMessage, setSaveMessage] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes to enable/disable save button
  useEffect(() => {
    const hasUnsavedChanges =
      localEnterKeySubmits !== enterKeySubmits ||
      localAutoExpandTextAreas !== autoExpandTextAreas ||
      localTextSize !== textSize;

    setHasChanges(hasUnsavedChanges);
  }, [
    localEnterKeySubmits,
    localAutoExpandTextAreas,
    localTextSize,
    enterKeySubmits,
    autoExpandTextAreas,
    textSize,
  ]);

  const handleSave = () => {
    // Update global settings
    setEnterKeySubmits(localEnterKeySubmits);
    setAutoExpandTextAreas(localAutoExpandTextAreas);
    setTextSize(localTextSize);

    // Show success message
    setSaveMessage("Settings saved successfully!");

    // Clear message after 3 seconds
    setTimeout(() => {
      setSaveMessage("");
    }, 3000);
  };

  // Get text size class based on current setting
  const getTextSizeClass = () => {
    switch (localTextSize) {
      case "small":
        return "text-sm";
      case "large":
        return "text-lg";
      default:
        return "text-base";
    }
  };

  return (
    <>
      <Navigation />
      <div className="max-w-4xl mx-auto p-6 pt-8">
        <div className="flex items-center mb-8">
          <Settings className="h-6 w-6 mr-2 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 mb-6 transition-all duration-200">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-zinc-700">
            Interface Preferences
          </h2>

          {/* Enter Key Behavior */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
              Enter Key Behavior
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Control how the Enter key works when typing arguments
            </p>
            <div className="space-y-3 pl-2">
              <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="enterKeyBehavior"
                  checked={localEnterKeySubmits}
                  onChange={() => setLocalEnterKeySubmits(true)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className={`${getTextSizeClass()} font-medium`}>
                  Submit on Enter{" "}
                  <span className="text-gray-500 dark:text-gray-400 font-normal">
                    (use Shift+Enter for new line)
                  </span>
                </span>
              </label>
              <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="enterKeyBehavior"
                  checked={!localEnterKeySubmits}
                  onChange={() => setLocalEnterKeySubmits(false)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className={`${getTextSizeClass()} font-medium`}>
                  New line on Enter{" "}
                  <span className="text-gray-500 dark:text-gray-400 font-normal">
                    (use Ctrl+Enter to submit)
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Auto-expand Text Areas */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
              Text Area Behavior
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Control how text areas behave when typing long arguments
            </p>
            <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={localAutoExpandTextAreas}
                onChange={() =>
                  setLocalAutoExpandTextAreas(!localAutoExpandTextAreas)
                }
                className="mr-3 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className={`${getTextSizeClass()} font-medium`}>
                Auto-expand text areas for long arguments
              </span>
            </label>
          </div>

          {/* Text Size */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
              Text Size
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Adjust the size of text throughout the application
            </p>
            <div className="flex flex-wrap gap-3 pl-2">
              <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="textSize"
                  checked={localTextSize === "small"}
                  onChange={() => setLocalTextSize("small")}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium">Small</span>
              </label>
              <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="textSize"
                  checked={localTextSize === "medium"}
                  onChange={() => setLocalTextSize("medium")}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-base font-medium">Medium</span>
              </label>
              <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="textSize"
                  checked={localTextSize === "large"}
                  onChange={() => setLocalTextSize("large")}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-lg font-medium">Large</span>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t dark:border-zinc-700">
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`${
                hasChanges
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-400 cursor-not-allowed"
              } text-white font-bold py-2 px-6 rounded-lg flex items-center transition-all duration-200 transform hover:scale-105 active:scale-95`}
            >
              {saveMessage ? (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 mr-2" />
                  Save Settings
                </>
              )}
            </button>

            {saveMessage && (
              <span className="text-green-600 dark:text-green-400 ml-4 font-medium animate-fadeIn">
                {saveMessage}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 transition-all duration-200">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-zinc-700 text-blue-600 dark:text-blue-400">
            Preview
          </h2>
          <p className={`mb-4 ${getTextSizeClass()}`}>
            This text will appear at the selected size throughout the
            application.
          </p>
          <div className="border dark:border-zinc-700 p-5 rounded-lg bg-gray-50 dark:bg-zinc-900 shadow-inner">
            <p
              className={`mb-3 font-medium ${getTextSizeClass()} text-blue-600 dark:text-blue-400`}
            >
              Sample Argument
            </p>
            <p className={getTextSizeClass()}>
              The plaintiff argues that the defendant breached the contract by
              failing to deliver the goods on time. This caused significant
              financial damage to the plaintiff's business operations.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
