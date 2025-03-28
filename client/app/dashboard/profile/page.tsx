import { UserProfile } from "@/components/dashboard/user-profile"
import { CaseHistory } from "@/components/case-history"

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Profile</h1>
        <p className="text-muted-foreground">Manage your profile and view your case history</p>
      </div>
      <div className="space-y-6">
        <UserProfile />

        <div>
          <h2 className="text-2xl font-semibold mb-4">Case History</h2>
          <CaseHistory />
        </div>
      </div>
    </div>
  )
}

