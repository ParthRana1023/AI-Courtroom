"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import Navigation from "@/components/navigation";
import { caseAPI } from "@/lib/api";
import { type Case, CaseStatus } from "@/types";
import MarkdownRenderer from "@/components/markdown-renderer";

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
      // Update case status to ACTIVE
      await caseAPI.updateCaseStatus(cnr, CaseStatus.ACTIVE);
      router.push(`/dashboard/cases/${cnr}/courtroom?role=${role}`);
    } catch (error) {
      console.error("Error updating case status:", error);
      // Optionally show an error message to the user
      setError("Failed to start case. Please try again.");
    }
  };

  const handleToCourtroom = () => {
    router.push(`/dashboard/cases/${cnr}/courtroom`);
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading case details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
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
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
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
      <Navigation />

      <div className="flex-grow container mx-auto px-4 py-8">
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

          <div className="mt-8 flex justify-center">
            {caseData.status === CaseStatus.NOT_STARTED ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <div title="We're still working on this">
                  <button
                    onClick={() => handleRoleSelection("plaintiff")}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                  >
                    Plaintiff Lawyer
                  </button>
                </div>
                <div title="We're still working on this">
                  <button
                    onClick={() => handleRoleSelection("defendant")}
                    disabled={true}
                    className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors cursor-not-allowed"
                  >
                    Defendant Lawyer
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleToCourtroom}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
              >
                To The Courtroom
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
