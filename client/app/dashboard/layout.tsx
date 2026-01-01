"use client";

import type React from "react";

import Navigation from "@/components/navigation";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HexagonBackground className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 p-0 pt-16 flex flex-col">{children}</main>
    </HexagonBackground>
  );
}
