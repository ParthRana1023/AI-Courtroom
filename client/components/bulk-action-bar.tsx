"use client";

import React from "react";

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionBar({
  selectedCount,
  onClear,
  children,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-gray-200 dark:border-zinc-700">
      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
        {selectedCount} case(s) selected
      </span>
      <button
        onClick={onClear}
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Clear
      </button>
      <div className="h-6 w-px bg-gray-300 dark:bg-zinc-600" />
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
