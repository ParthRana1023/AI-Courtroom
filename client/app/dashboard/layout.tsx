import type React from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 p-0">{children}</main>
    </div>
  );
}
