"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { caseAPI } from "@/lib/api";
import { CaseStatus } from "@/types";
import { Trash2, RotateCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ScalesLoader from "@/components/scales-loader";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";
import { getLogger } from "@/lib/logger";

const logger = getLogger("cases");

interface DeletedCase {
  id: string;
  cnr: string;
  title: string;
  created_at: string;
  deleted_at: string;
  status: CaseStatus;
}

export default function RecycleBin() {
  useLifecycleLogger("RecycleBin");

  const router = useRouter();
  const [deletedCases, setDeletedCases] = useState<DeletedCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingCnr, setProcessingCnr] = useState<string | null>(null);

  useEffect(() => {
    fetchDeletedCases();
  }, []);

  const fetchDeletedCases = async () => {
    try {
      const data = await caseAPI.listDeletedCases();
      setDeletedCases(Array.isArray(data) ? data : []);
    } catch (error) {
      logger.error("Failed to fetch deleted cases", error as Error);
      setError("Failed to load archived cases. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreCase = async (cnr: string) => {
    setProcessingCnr(cnr);
    try {
      await caseAPI.restoreCase(cnr);
      setDeletedCases(deletedCases.filter((caseItem) => caseItem.cnr !== cnr));
      toast.success("Case restored");
    } catch (error) {
      logger.error("Failed to restore case", error as Error);
      toast.error("Failed to restore case. Please try again.");
    } finally {
      setProcessingCnr(null);
    }
  };

  const handlePermanentDelete = async (cnr: string) => {
    setProcessingCnr(cnr);
    try {
      await caseAPI.permanentDeleteCase(cnr);
      setDeletedCases(deletedCases.filter((caseItem) => caseItem.cnr !== cnr));
      toast.success("Case permanently deleted");
    } catch (error) {
      logger.error("Failed to permanently delete case", error as Error);
      toast.error("Failed to delete case. Please try again.");
    } finally {
      setProcessingCnr(null);
    }
  };

  const handleEmptyAll = async () => {
    setProcessingCnr("all");
    try {
      for (const caseItem of deletedCases) {
        await caseAPI.permanentDeleteCase(caseItem.cnr);
      }
      toast.success(`${deletedCases.length} case(s) permanently deleted`);
      setDeletedCases([]);
    } catch (error) {
      logger.error("Failed to empty archived cases", error as Error);
      toast.error("Failed to delete all cases. Please try again.");
      // Refresh to get updated list
      fetchDeletedCases();
    } finally {
      setProcessingCnr(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grow flex items-center justify-center h-full">
        <ScalesLoader message="Loading archived cases..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="grow flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => router.push("/dashboard/cases")}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Back to Cases
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grow container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6 dark:bg-zinc-900">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/cases")}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Back to Cases"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold">Archived Cases</h1>
          </div>
          {deletedCases.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={processingCnr === "all"}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Empty All
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty All Archived Cases</AlertDialogTitle>
                  <AlertDialogDescription className="text-red-600 font-medium">
                    ⚠️ This action cannot be undone!
                  </AlertDialogDescription>
                  <AlertDialogDescription>
                    This will permanently delete all {deletedCases.length}{" "}
                    archived case(s) and their associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleEmptyAll}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {deletedCases.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No archived cases.</p>
            <button
              onClick={() => router.push("/dashboard/cases")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              Back to Cases
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
                    Deleted On
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
                {deletedCases.map((caseItem) => (
                  <tr
                    key={caseItem.cnr}
                    className="hover:bg-gray-50 dark:hover:bg-zinc-800"
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
                      {caseItem.deleted_at
                        ? new Date(caseItem.deleted_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-2">
                        {/* Restore Button */}
                        <button
                          onClick={() => handleRestoreCase(caseItem.cnr)}
                          disabled={processingCnr === caseItem.cnr}
                          className="p-2 text-green-600 hover:text-green-900 hover:bg-green-100 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Restore Case"
                        >
                          <RotateCcw className="h-5 w-5" />
                        </button>

                        {/* Permanent Delete Button */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              disabled={processingCnr === caseItem.cnr}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Case</AlertDialogTitle>
                              <AlertDialogDescription className="text-red-600 font-medium">
                                ⚠️ This action cannot be undone!
                              </AlertDialogDescription>
                              <AlertDialogDescription>
                                This will permanently delete the case and all
                                associated data. You will not be able to recover
                                this case.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  handlePermanentDelete(caseItem.cnr)
                                }
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
