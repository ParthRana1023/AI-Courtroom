import { CaseList } from "@/components/cases/case-list"
import { GenerateCaseForm } from "@/components/cases/generate-case-form"

export default function CasesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cases</h1>
        <p className="text-muted-foreground">View and manage your courtroom cases</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-4">Available Cases</h2>
          <CaseList />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4">Generate New Case</h2>
          <GenerateCaseForm />
        </div>
      </div>
    </div>
  )
}

