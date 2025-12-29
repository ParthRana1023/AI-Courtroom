"use client";

import { Gavel } from "lucide-react";

interface GavelLoaderProps {
  message?: string;
}

export default function GavelLoader({
  message = "Loading...",
}: GavelLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {/* Animated Gavel */}
      <div className="relative w-20 h-20">
        {/* Gavel Icon - faces right, swings from raised to horizontal */}
        <div
          className="animate-gavel absolute top-0 left-0"
          style={{ transformOrigin: "20% 80%" }}
        >
          <Gavel
            className="w-16 h-16 text-gray-600 dark:text-gray-400"
            strokeWidth={1.5}
          />
        </div>

        {/* Sound Block / Base */}
        <div className="absolute bottom-1 right-1 w-10 h-2 bg-gray-400 dark:bg-gray-500 rounded-sm shadow-md" />
      </div>

      {/* Loading Text */}
      <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
        {message}
      </p>
    </div>
  );
}
