"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getCases } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Gavel, ArrowRight } from "lucide-react"

// Add import for useRouter
import { useRouter } from "next/navigation"

// Update the CaseList component to handle authentication
export function CaseList() {
  const router = useRouter()
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCases = async () => {
    setLoading(true)
    setError(null)
    try {
      // Check if user is authenticated
      const token = localStorage.getItem("auth_token")
      if (!token) {
        console.log("No auth token found, redirecting to login")
        router.push("/login")
        return
      }

      const data = await getCases()
      setCases(data)
    } catch (err: any) {
      setError(err.message || "Failed to load cases. Please try again.")
      console.error("Error in fetchCases:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCases()
  }, [router])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full mt-2" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-24" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={fetchCases}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (cases.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
          <Gavel className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No cases available.</p>
          <p className="text-sm text-muted-foreground mt-1">Generate a new case to get started.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {cases.map((caseItem) => (
        <Card key={caseItem.id}>
          <CardHeader>
            <CardTitle>Case #{caseItem.cnr}</CardTitle>
            <CardDescription>Legal Case</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-2">{caseItem.details}</p>
          </CardContent>
          <CardFooter>
            <Link href={`/dashboard/cases/${caseItem.id}`} passHref>
              <Button size="sm">
                View Case <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

