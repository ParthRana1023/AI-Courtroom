import type React from "react";

import Navigation from "@/components/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 p-0 pt-16 flex flex-col">{children}</main>{" "}
      {/* Ensure no default padding, add pt-16 for navbar */}
    </div>
  );
}
