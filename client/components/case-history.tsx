"use client"

import { useEffect, useState } from "react"
import { getCases } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Gavel, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function CaseHistory() {
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const data = await getCases()
        setCases(data)
      } catch (err) {
        setError("Failed to load cases. Please try again.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchCases()
  }, [])

  // Filter cases based on status
  const activeCases = cases.filter((c) => !c.verdict)
  const foughtCases = cases.filter((c) => c.verdict)

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-500">{error}</p>
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
          <Link href="/dashboard/cases" className="mt-4">
            <Button>Go to Cases</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const renderCaseList = (caseList: any[]) => {
    if (caseList.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">No cases in this category.</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-4">
        {caseList.map((caseItem) => (
          <Card key={caseItem.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Case #{caseItem.cnr}</CardTitle>
                <Badge variant={caseItem.verdict ? "secondary" : "default"}>
                  {caseItem.verdict ? "Completed" : "Active"}
                </Badge>
              </div>
              <CardDescription>Legal Case</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">{caseItem.details}</p>
              <div className="mt-4">
                <Link href={`/dashboard/cases/${caseItem.id}`} passHref>
                  <Button size="sm">
                    View Case <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <Tabs defaultValue="active" className="space-y-4">
      <TabsList>
        <TabsTrigger value="active">Active Cases ({activeCases.length})</TabsTrigger>
        <TabsTrigger value="fought">Fought Cases ({foughtCases.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="space-y-4">
        {renderCaseList(activeCases)}
      </TabsContent>
      <TabsContent value="fought" className="space-y-4">
        {renderCaseList(foughtCases)}
      </TabsContent>
    </Tabs>
  )
}

