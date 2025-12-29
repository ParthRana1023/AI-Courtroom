"use client";

interface ScalesLoaderProps {
  message?: string;
}

export default function ScalesLoader({
  message = "Loading...",
}: ScalesLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {/* Custom Scales of Justice with tilting beam */}
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gray-600 dark:text-gray-400"
      >
        {/* Center pillar - stationary */}
        <line x1="12" y1="5" x2="12" y2="21" />

        {/* Base - stationary */}
        <path d="M8 21h8" />

        {/* Small pivot circle at top - stationary */}
        <circle cx="12" cy="5" r="1" fill="currentColor" />

        {/* Tilting balance beam with attached pans */}
        <g
          className="animate-balance-beam"
          style={{ transformOrigin: "12px 5px" }}
        >
          {/* Horizontal beam */}
          <line x1="4" y1="5" x2="20" y2="5" />

          {/* Left chain and pan */}
          <line x1="4" y1="5" x2="4" y2="10" />
          <path d="M1 10h6" />
          <path d="M1.5 10l0.5 3h4l0.5-3" />

          {/* Right chain and pan */}
          <line x1="20" y1="5" x2="20" y2="10" />
          <path d="M17 10h6" />
          <path d="M17.5 10l0.5 3h4l0.5-3" />
        </g>
      </svg>

      {/* Loading Text */}
      <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
        {message}
      </p>
    </div>
  );
}
