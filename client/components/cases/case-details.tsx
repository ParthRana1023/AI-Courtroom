"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface CaseDetailsProps {
  caseData: any
}

export function CaseDetails({ caseData }: CaseDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{caseData.title}</CardTitle>
            <CardDescription>Case #{caseData.id}</CardDescription>
          </div>
          <Badge variant={caseData.status === "active" ? "default" : "secondary"}>{caseData.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Description</h3>
          <p className="text-sm text-muted-foreground">{caseData.description}</p>
        </div>

        <Separator />

        <div>
          <h3 className="text-lg font-semibold mb-2">Case Sections</h3>
          <div className="space-y-4">
            {caseData.sections?.map((section: any) => (
              <div key={section.id} className="border rounded-md p-4">
                <h4 className="font-medium">Section {section.number}</h4>
                <p className="text-sm mt-2">{section.content}</p>
              </div>
            ))}
          </div>
        </div>

        {caseData.verdict && (
          <>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold mb-2">Verdict</h3>
              <div className="bg-muted p-4 rounded-md">
                <p className="text-sm">{caseData.verdict}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

