"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface CaseDetailsProps {
  caseData: any;
}

export function CaseDetails({ caseData }: CaseDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Case #{caseData.cnr}</CardTitle>
            <CardDescription>Legal Case</CardDescription>
          </div>
          <Badge variant={caseData.verdict ? "secondary" : "default"}>
            {caseData.verdict ? "Verdict Rendered" : "Active"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Description</h3>
          <p className="text-sm text-muted-foreground">{caseData.details}</p>
        </div>

        {(caseData.plaintiff_arguments?.length > 0 ||
          caseData.defendant_arguments?.length > 0) && (
          <>
            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {caseData.plaintiff_arguments?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    Plaintiff Arguments
                  </h3>
                  <div className="space-y-4">
                    {caseData.plaintiff_arguments.map(
                      (arg: any, index: number) => (
                        <div key={index} className="border rounded-md p-4">
                          <h4 className="font-medium">
                            {arg.type === "user"
                              ? "User Argument"
                              : "Counter Argument"}
                          </h4>
                          <p className="text-sm mt-2">{arg.content}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {caseData.defendant_arguments?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    Defendant Arguments
                  </h3>
                  <div className="space-y-4">
                    {caseData.defendant_arguments.map(
                      (arg: any, index: number) => (
                        <div key={index} className="border rounded-md p-4">
                          <h4 className="font-medium">
                            {arg.type === "user"
                              ? "User Argument"
                              : "Counter Argument"}
                          </h4>
                          <p className="text-sm mt-2">{arg.content}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

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
  );
}
