import type React from "react";
import DeskPage from "@/components/chrome/desk-page";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DeskPage>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </DeskPage>
  );
}
