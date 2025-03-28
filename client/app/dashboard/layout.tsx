import type React from "react"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { UserNav } from "@/components/dashboard/user-nav"
import { ThemeToggle } from "@/components/theme-toggle"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center font-semibold">AI Courtroom Simulation</div>
          <div className="ml-auto flex items-center space-x-4">
            <ThemeToggle />
            <UserNav />
          </div>
        </div>
      </div>
      <div className="flex flex-1">
        <aside className="w-64 border-r bg-muted/40">
          <DashboardNav />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

