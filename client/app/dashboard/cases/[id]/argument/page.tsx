"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { getCaseDetails } from "@/lib/api"
import { ChatInterface } from "@/components/chat/chat-interface"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function ArgumentPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const role = searchParams.get("role") as "defendant" | "plaintiff"

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

  if (!role || (role !== "defendant" && role !== "plaintiff")) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <p className="text-red-500">Invalid role selected.</p>
        <Button onClick={() => router.push(`/dashboard/cases/${params.id}`)}>Back to Case</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-4 mt-8">
          <Skeleton className="h-[60vh] w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <p className="text-red-500">{error}</p>
        <Button onClick={() => router.push(`/dashboard/cases/${params.id}`)}>Back to Case</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {role === "defendant" ? "Defendant" : "Plaintiff"} Arguments
        </h1>
        <p className="text-muted-foreground">Submit your arguments and receive counter-arguments</p>
      </div>

      {caseData && <ChatInterface caseId={params.id as string} role={role} caseData={caseData} />}
    </div>
  )
}

