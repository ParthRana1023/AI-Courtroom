import { redirect } from "next/navigation"

export default function DashboardPage() {
  // Redirect from /dashboard to /dashboard/profile
  redirect("/dashboard/profile")
}

