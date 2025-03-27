"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getCaseDetails } from "@/lib/api"
import { CaseDetails } from "@/components/cases/case-details"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function CaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [caseData, setCaseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCaseDetails = async () => {
      try {
        const caseId = params.id as string
        const data = await getCaseDetails(caseId)
        setCaseData(data)
      } catch (err) {
        setError("Failed to load case details. Please try again.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchCaseDetails()
  }, [params.id])

  const handleStartArgument = (role: "defendant" | "plaintiff") => {
    router.push(`/dashboard/cases/${params.id}/argument?role=${role}`)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-4 mt-8">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <p className="text-red-500">{error}</p>
        <Button onClick={() => router.push("/dashboard/cases")}>Back to Cases</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Case Details</h1>
        <p className="text-muted-foreground">Review case information and submit arguments</p>
      </div>

      {caseData && <CaseDetails caseData={caseData} />}

      <div className="flex space-x-4 mt-8">
        <Button onClick={() => handleStartArgument("defendant")}>Argue as Defendant Lawyer</Button>
        <Button onClick={() => handleStartArgument("plaintiff")}>Argue as Plaintiff Lawyer</Button>
      </div>
    </div>
  )
}

