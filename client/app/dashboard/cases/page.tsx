"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { caseAPI } from "@/lib/api";
import { type Case, CaseStatus } from "@/types";

export default function CasesListing() {
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCases = async () => {
      try {
        console.log("Fetching cases...");
        const data = await caseAPI.listCases();
        console.log("Processed API response:", data);

        // Even if data is an empty array, this is valid
        setCases(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching cases:", error);
        setCases([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCases();
  }, []);

  const handleDeleteCase = async (e: React.MouseEvent, cnr: string) => {
    e.stopPropagation(); // Prevent row click event from triggering
    if (window.confirm("Are you sure you want to delete this case?")) {
      try {
        await caseAPI.deleteCase(cnr);
        // Remove the deleted case from the state
        setCases(cases.filter((caseItem) => caseItem.cnr !== cnr));
      } catch (error) {
        console.error("Error deleting case:", error);
        alert("Failed to delete case. Please try again.");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading cases...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6 dark:bg-zinc-900">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Cases</h1>
          <button
            onClick={() => router.push("/dashboard/generate-case")} // Updated path to match your project structure
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
          >
            New Case
          </button>
        </div>

        {!cases || cases.length === 0 ? ( // Add a check for cases being undefined
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">You don't have any cases yet.</p>
            <button
              onClick={() => router.push("/dashboard/generate-case")} // Updated path to match your project structure
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              Create Your First Case
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 dark:bg-zinc-800">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Case Number
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Date Filed
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-gray-700">
                {cases.map((caseItem) => (
                  <tr
                    key={caseItem.cnr}
                    className="hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                    onClick={() =>
                      router.push(`/dashboard/cases/${caseItem.cnr}`)
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {caseItem.cnr}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {caseItem.title || "Untitled Case"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          caseItem.status === CaseStatus.ACTIVE
                            ? "bg-green-100 text-green-800"
                            : caseItem.status === CaseStatus.RESOLVED
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {caseItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-center">
                      {caseItem.created_at
                        ? new Date(caseItem.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <button
                        onClick={(e) => handleDeleteCase(e, caseItem.cnr)}
                        className="text-red-600 hover:text-red-900 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
