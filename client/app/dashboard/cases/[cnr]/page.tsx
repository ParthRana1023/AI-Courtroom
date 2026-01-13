"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { caseAPI } from "@/lib/api";
import { type Case, CaseStatus, Roles } from "@/types";
import MarkdownRenderer from "@/components/markdown-renderer";
import ScalesLoader from "@/components/scales-loader";

export default function CaseDetails({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  const router = useRouter();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const { cnr } = use(params);

  useEffect(() => {
    const fetchCaseDetails = async () => {
      try {
        // DEV DELAY - Remove in production
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const data = await caseAPI.getCase(cnr); // Use cnr instead of params.cnr
        setCaseData(data);
      } catch (error) {
        setError("Failed to load case details. Please try again later.");
        console.error("Error fetching case details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCaseDetails();
  }, [cnr]); // Use cnr in dependency array instead of params.cnr

  const handleRoleSelection = async (role: string) => {
    try {
      // Only update roles, NOT status - status becomes ACTIVE only when entering courtroom
      const userRole = role === "plaintiff" ? Roles.PLAINTIFF : Roles.DEFENDANT;
      const aiRole = role === "plaintiff" ? Roles.DEFENDANT : Roles.PLAINTIFF;
      await caseAPI.updateCaseRoles(cnr, userRole, aiRole);

      // If user selects defendant role, navigate first, then generate plaintiff opening statement after a delay
      if (role === "defendant") {
        // Navigate to people page first
        router.push(`/dashboard/cases/${cnr}/people?role=${role}`);

        // Wait 2 seconds before generating the plaintiff opening statement
        setTimeout(async () => {
          console.log(
            "Generating plaintiff opening statement for defendant user after delay"
          );
          try {
            await caseAPI.generatePlaintiffOpening(cnr);
            console.log("Successfully generated plaintiff opening statement");
          } catch (error) {
            console.error(
              "Error generating plaintiff opening statement:",
              error
            );
          }
        }, 2000); // 2 second delay
      } else {
        // For plaintiff role, navigate to people page first
        router.push(`/dashboard/cases/${cnr}/people?role=${role}`);
      }
    } catch (error) {
      console.error("Error updating case status or role:", error);
      // Optionally show an error message to the user
      setError("Failed to start case. Please try again.");
    }
  };

  const handleToPartiesInvolved = () => {
    router.push(`/dashboard/cases/${cnr}/people`);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ScalesLoader message="Loading case details..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Error</h1>
            <p className="mb-6">{error}</p>
            <button
              onClick={() => router.back()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Case Not Found</h1>
            <p className="mb-6">
              The case you're looking for doesn't exist or you don't have
              permission to view it.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 container max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Case Details</h1>
            <div className="flex items-center">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  caseData.status === CaseStatus.ACTIVE
                    ? "bg-green-100 text-green-800"
                    : caseData.status === CaseStatus.RESOLVED
                    ? "bg-gray-100 text-gray-800"
                    : caseData.status === CaseStatus.ADJOURNED
                    ? "bg-amber-100 text-amber-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {caseData.status}
              </span>
              <button
                onClick={() => router.back()}
                className="ml-4 px-3 py-1 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back
              </button>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">{caseData.title}</h2>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="rounded-md shadow-md border border-gray-300">
                {caseData.case_text ? (
                  <MarkdownRenderer
                    markdown={caseData.case_text || ""}
                    className="prose prose-lg max-w-none font-serif"
                  />
                ) : (
                  <p className="text-gray-500 italic p-6">
                    No case details available.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            {/* Check if role has been chosen - if user_role is plaintiff or defendant, show proceed button */}
            {caseData.user_role === "plaintiff" ||
            caseData.user_role === "defendant" ? (
              <>
                {/* Role is already selected - show proceed button */}
                <p className="text-gray-600 dark:text-gray-400">
                  You are the{" "}
                  <span className="font-semibold capitalize text-gray-900 dark:text-white">
                    {caseData.user_role === "plaintiff"
                      ? "Plaintiff"
                      : "Defendant"}
                  </span>{" "}
                  Lawyer
                </p>
                <button
                  onClick={handleToPartiesInvolved}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                >
                  Proceed to Chat with Parties Involved
                </button>
              </>
            ) : (
              <>
                {/* Role not yet chosen - show selection buttons */}
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Choose your role to start the case:
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div title="Represent the plaintiff/applicant side">
                    <button
                      onClick={() => handleRoleSelection("plaintiff")}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                    >
                      Plaintiff Lawyer
                    </button>
                  </div>
                  <div title="Represent the defendant/respondent side">
                    <button
                      onClick={() => handleRoleSelection("defendant")}
                      className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors"
                    >
                      Defendant Lawyer
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
