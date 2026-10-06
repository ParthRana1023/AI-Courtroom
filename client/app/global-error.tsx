"use client";

import "./globals.css";
import { ErrorSheet } from "@/components/chrome/error-screen";

// Replaces the root layout when it crashes, so no providers or header are available.
export default function GlobalError() {
  return (
    <html lang="en" data-theme="dark">
      <body className="flex min-h-dvh flex-col font-type">
        <ErrorSheet />
      </body>
    </html>
  );
}
