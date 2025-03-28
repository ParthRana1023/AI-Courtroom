"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Gavel, User } from "lucide-react"

const navItems = [
  {
    title: "Cases",
    href: "/dashboard/cases",
    icon: Gavel,
  },
  {
    title: "User Profile",
    href: "/dashboard/profile",
    icon: User,
  },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="grid gap-2 p-4">
      {navItems.map((item) => (
        <Button
          key={item.href}
          variant={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "secondary" : "ghost"}
          className={cn(
            "justify-start",
            (pathname === item.href || pathname.startsWith(`${item.href}/`)) && "bg-secondary",
          )}
          asChild
        >
          <Link href={item.href}>
            <item.icon className="mr-2 h-4 w-4" />
            {item.title}
          </Link>
        </Button>
      ))}
    </nav>
  )
}

