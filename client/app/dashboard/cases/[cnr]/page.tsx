"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { use } from "react"; // Add this import
import Navigation from "@/components/navigation";
import { caseAPI } from "@/lib/api";
import { type Case, CaseStatus } from "@/types";
import MarkdownIt from "markdown-it"; // Replaced ReactMarkdown

export default function CaseDetails({ params }: { params: { cnr: string } }) {
  const router = useRouter();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const cnr = unwrappedParams.cnr;

  // Initialize markdown-it with custom configuration
  const md = new MarkdownIt({
    html: true, // Enable HTML tags in source
    typographer: true, // Enable some language-neutral replacement + quotes beautification
    quotes: "\"\"''",
  });

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

  const handleRoleSelection = (role: string) => {
    router.push(`/dashboard/cases/${cnr}/courtroom?role=${role}`);
  };

  const handleToCourtroom = () => {
    router.push(`/dashboard/cases/${cnr}/courtroom`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4">Loading case details...</p>
          </div>
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
        <div className="bg-white rounded-lg shadow-md p-6">
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
              <div
                className="bg-[#f8f8f0] p-6 rounded-md shadow-md border border-gray-300 legal-document"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(#f8f8f0, #f8f8f0 22px, #e8e8e0 23px)",
                }}
              >
                {caseData.case_text ? (
                  <div className="prose prose-lg max-w-none font-serif">
                    <style jsx global>{`
                      .legal-document {
                        font-family: "Courier New", Courier, monospace;
                        line-height: 1.5;
                        color: #1a1a1a;
                        padding: 2rem;
                        letter-spacing: 0.05rem;
                      }
                      .legal-document pre {
                        white-space: pre-wrap;
                        font-family: inherit;
                        background: none;
                        padding: 0;
                        margin: 2rem 0;
                      }
                      .legal-document p {
                        margin-bottom: 1.8rem;
                        text-align: left;
                        font-size: 1rem;
                        text-indent: 0;
                        line-height: 1.6;
                      }
                      .legal-document p:first-of-type {
                        text-indent: 0;
                      }
                      .legal-document strong {
                        font-weight: normal;
                        text-decoration: underline;
                        color: #000;
                      }
                      .legal-document code {
                        font-family: inherit;
                        background: none;
                        padding: 0;
                      }
                      .legal-document h1 {
                        text-align: center;
                        margin: 2.5rem 0 2rem;
                        font-size: 1.5rem;
                        font-weight: normal;
                        color: #000;
                        letter-spacing: 0.1rem;
                        text-transform: uppercase;
                      }
                      .legal-document h2 {
                        text-align: center;
                        margin: 2.25rem 0 1.75rem;
                        font-size: 1.25rem;
                        font-weight: normal;
                        color: #000;
                        letter-spacing: 0.05rem;
                      }
                      .legal-document h3 {
                        margin: 2rem 0 1.5rem;
                        font-size: 1.125rem;
                        font-weight: normal;
                        color: #000;
                        text-transform: uppercase;
                        letter-spacing: 0.05rem;
                      }
                      .legal-document ul,
                      .legal-document ol {
                        margin: 1.8rem 0;
                        padding-left: 2.5rem;
                      }
                      .legal-document li {
                        margin-bottom: 0.75rem;
                        line-height: 1.7;
                      }
                      .legal-document blockquote {
                        margin: 2rem 3rem;
                        padding: 1rem 1.5rem;
                        border-left: none;
                        border-top: 1px solid #000;
                        border-bottom: 1px solid #000;
                        font-style: normal;
                        color: #333;
                        background-color: transparent;
                      }
                      /* Ensure proper markdown rendering */
                      .legal-document .prose {
                        max-width: none;
                      }
                      .legal-document .prose strong {
                        font-weight: bold;
                        text-decoration: underline;
                        color: #000;
                      }
                      .legal-document .prose em {
                        font-style: normal;
                        text-decoration: underline;
                      }
                      .legal-document .prose a {
                        color: #000;
                        text-decoration: underline;
                        text-decoration-thickness: 1px;
                        text-decoration-style: dotted;
                      }
                      .legal-document .prose a:hover {
                        color: #444;
                      }
                    `}</style>
                    {/* Use markdown-it to render HTML */}
                    <div
                      dangerouslySetInnerHTML={{
                        __html: md.render(caseData.case_text),
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-gray-500 italic">
                    No case details available.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            {caseData.status === CaseStatus.NOT_STARTED ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => handleRoleSelection("plaintiff")}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                >
                  Plaintiff Lawyer
                </button>
                <button
                  onClick={() => handleRoleSelection("defendant")}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors"
                >
                  Defendant Lawyer
                </button>
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
