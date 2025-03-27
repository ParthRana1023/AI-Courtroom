import { UserProfile } from "@/components/dashboard/user-profile"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your AI Courtroom Simulation dashboard</p>
      </div>
      <div className="space-y-6">
        <UserProfile />
      </div>
    </div>
  )
}

