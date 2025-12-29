"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { caseAPI } from "@/lib/api";
import { type Case, CaseStatus } from "@/types";
import { toast } from "sonner";
import {
  Trash2,
  Trash,
  Archive,
  Search,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import React, { useMemo } from "react";
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
} from "@/components/alert-dialog";
import { useSettings } from "@/contexts/settings-context";
import ScalesLoader from "@/components/scales-loader";

export default function CasesListing() {
  const router = useRouter();
  const { skipArchiveConfirmation, skipDeleteConfirmation } = useSettings();
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingCnr, setDeletingCnr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [sortField, setSortField] = useState<
    "cnr" | "title" | "status" | "created_at"
  >("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Refs for click-outside handling
  const searchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setSearchExpanded(false);
      }
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setFilterExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedCases.size === processedCases.length) {
      setSelectedCases(new Set());
    } else {
      setSelectedCases(new Set(processedCases.map((c) => c.cnr)));
    }
  };

  const toggleCaseSelection = (cnr: string) => {
    const newSelection = new Set(selectedCases);
    if (newSelection.has(cnr)) {
      newSelection.delete(cnr);
    } else {
      newSelection.add(cnr);
    }
    setSelectedCases(newSelection);
  };

  const handleBulkArchive = async () => {
    const archivedCnrs = Array.from(selectedCases);
    const archivedCases = cases.filter((c) => selectedCases.has(c.cnr));
    const count = archivedCnrs.length;

    if (count === 0) return;

    setDeletingCnr("bulk");
    try {
      for (const cnr of archivedCnrs) {
        await caseAPI.deleteCase(cnr);
      }
      setCases((prev) => prev.filter((c) => !archivedCnrs.includes(c.cnr)));
      setSelectedCases(new Set());
      setMultiSelectMode(false);
      toast.success(`${count} case(s) archived`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              for (const cnr of archivedCnrs) {
                await caseAPI.restoreCase(cnr);
              }
              setCases((prev) => [...prev, ...archivedCases]);
              toast.success(`${count} case(s) restored`);
            } catch (error) {
              console.error("Error restoring cases:", error);
              toast.error("Failed to restore cases");
            }
          },
        },
      });
    } catch (error) {
      console.error("Error bulk archiving:", error);
      toast.error("Failed to archive some cases");
    } finally {
      setDeletingCnr(null);
    }
  };

  const handleBulkDelete = async () => {
    const deletedCnrs = Array.from(selectedCases);
    const deletedCases = cases.filter((c) => selectedCases.has(c.cnr));
    const count = deletedCnrs.length;

    if (count === 0) return;

    setDeletingCnr("bulk");
    let undoClicked = false;

    try {
      // First, archive the cases (soft delete)
      for (const cnr of deletedCnrs) {
        await caseAPI.deleteCase(cnr);
      }
      setCases((prev) => prev.filter((c) => !deletedCnrs.includes(c.cnr)));
      setSelectedCases(new Set());
      setMultiSelectMode(false);

      toast.success(`${count} case(s) will be permanently deleted`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            undoClicked = true;
            try {
              for (const cnr of deletedCnrs) {
                await caseAPI.restoreCase(cnr);
              }
              setCases((prev) => [...prev, ...deletedCases]);
              toast.success(`${count} case(s) restored`);
            } catch (error) {
              console.error("Error restoring cases:", error);
              toast.error("Failed to restore cases");
            }
          },
        },
      });

      // Wait for toast duration, then permanently delete if not undone
      setTimeout(async () => {
        if (!undoClicked) {
          try {
            for (const cnr of deletedCnrs) {
              await caseAPI.permanentDeleteCase(cnr);
            }
          } catch (error) {
            console.error("Error permanently deleting cases:", error);
          }
        }
      }, 5500);
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Failed to delete some cases");
    } finally {
      setDeletingCnr(null);
    }
  };

  useEffect(() => {
    const fetchCases = async () => {
      try {
        // DEV DELAY - Remove in production
        await new Promise((resolve) => setTimeout(resolve, 2000));

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

  // Filter and sort cases
  const processedCases = useMemo(() => {
    let result = [...cases];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(query) ||
          c.cnr?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "cnr":
          aVal = a.cnr || "";
          bVal = b.cnr || "";
          break;
        case "title":
          aVal = a.title?.toLowerCase() || "";
          bVal = b.title?.toLowerCase() || "";
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        case "created_at":
          aVal = new Date(a.created_at || 0).getTime();
          bVal = new Date(b.created_at || 0).getTime();
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [cases, searchQuery, statusFilter, sortField, sortDirection]);

  // Toggle sort direction or change sort field
  const handleSort = (field: "cnr" | "title" | "status" | "created_at") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Render sort indicator
  const SortIcon = ({
    field,
  }: {
    field: "cnr" | "title" | "status" | "created_at";
  }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="inline h-4 w-4 ml-1" />
    ) : (
      <ChevronDown className="inline h-4 w-4 ml-1" />
    );
  };

  const handleDeleteCase = async (cnr: string) => {
    setDeletingCnr(cnr);
    const archivedCase = cases.find((c) => c.cnr === cnr);
    try {
      await caseAPI.deleteCase(cnr);
      // Remove the archived case from the state
      setCases(cases.filter((caseItem) => caseItem.cnr !== cnr));

      // Show toast with undo action
      toast.success("Case archived", {
        description: archivedCase?.title || cnr,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await caseAPI.restoreCase(cnr);
              // Re-add the case to the list
              if (archivedCase) {
                setCases((prev) => [...prev, archivedCase]);
              }
              toast.success("Case restored");
            } catch (error) {
              console.error("Error restoring case:", error);
              toast.error("Failed to restore case");
            }
          },
        },
      });
    } catch (error) {
      console.error("Error archiving case:", error);
      toast.error("Failed to archive case. Please try again.");
    } finally {
      setDeletingCnr(null);
    }
  };

  const handlePermanentDeleteCase = async (cnr: string) => {
    setDeletingCnr(cnr);
    try {
      // First soft delete, then permanently delete
      await caseAPI.deleteCase(cnr);
      await caseAPI.permanentDeleteCase(cnr);
      // Remove the deleted case from the state
      setCases(cases.filter((caseItem) => caseItem.cnr !== cnr));
    } catch (error) {
      console.error("Error permanently deleting case:", error);
      alert("Failed to delete case. Please try again.");
    } finally {
      setDeletingCnr(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grow flex items-center justify-center h-full">
        <ScalesLoader message="Loading your cases..." />
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
    <div className="grow container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6 dark:bg-zinc-900">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Cases</h1>
          <div className="flex gap-3 items-center">
            {/* Animated Search Bar - expands to the left */}
            <div ref={searchRef} className="relative flex items-center">
              <div
                className={`absolute right-full mr-2 transition-all duration-300 ease-in-out origin-right ${
                  searchExpanded
                    ? "opacity-100 scale-100 w-72"
                    : "opacity-0 scale-95 w-0 pointer-events-none"
                }`}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title or case number..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg"
                  autoFocus={searchExpanded}
                />
              </div>
              <button
                onClick={() => setSearchExpanded(!searchExpanded)}
                className={`p-2 rounded-lg transition-colors ${
                  searchExpanded || searchQuery
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
                }`}
                title="Search"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
            {/* Filter Icon with Dropdown */}
            <div ref={filterRef} className="relative">
              <button
                onClick={() => setFilterExpanded(!filterExpanded)}
                className={`p-2 rounded-lg transition-colors ${
                  filterExpanded || statusFilter !== "all"
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
                }`}
                title="Filter by status"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </button>
              <div
                className={`absolute right-0 top-full mt-2 transition-all duration-300 ease-in-out origin-top-right z-20 ${
                  filterExpanded
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-95 pointer-events-none"
                }`}
              >
                <div className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg shadow-lg p-2 min-w-[150px]">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 pb-2 pt-2">
                    Status Filter
                  </p>
                  {[
                    {
                      value: "all",
                      label: "All Statuses",
                      selectedClass:
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                    },
                    {
                      value: CaseStatus.ACTIVE,
                      label: "Active",
                      selectedClass:
                        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                    },
                    {
                      value: CaseStatus.NOT_STARTED,
                      label: "Not Started",
                      selectedClass:
                        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
                    },
                    {
                      value: CaseStatus.ADJOURNED,
                      label: "Adjourned",
                      selectedClass:
                        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
                    },
                    {
                      value: CaseStatus.RESOLVED,
                      label: "Resolved",
                      selectedClass:
                        "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300",
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setStatusFilter(option.value as CaseStatus | "all");
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                        statusFilter === option.value
                          ? option.selectedClass
                          : "hover:bg-gray-100 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Multi-Select Toggle */}
            <button
              onClick={() => {
                setMultiSelectMode(!multiSelectMode);
                if (multiSelectMode) {
                  setSelectedCases(new Set());
                }
              }}
              className={`p-2 rounded-lg transition-colors ${
                multiSelectMode
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : "hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
              }`}
              title={
                multiSelectMode
                  ? "Exit selection mode"
                  : "Enable selection mode"
              }
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
                />
              </svg>
            </button>
            <button
              onClick={() => router.push("/dashboard/cases/archived")}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg flex items-center gap-2"
            >
              <Archive className="h-4 w-4" />
              Archived Cases
            </button>
            <button
              onClick={() => router.push("/dashboard/generate-case")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              New Case
            </button>
          </div>
        </div>

        {!cases || cases.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">You don't have any cases yet.</p>
            <button
              onClick={() => router.push("/dashboard/generate-case")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              Create Your First Case
            </button>
          </div>
        ) : (
          <>
            {/* Results info bar */}
            {(searchQuery || statusFilter !== "all") && (
              <div className="mb-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {processedCases.length} of {cases.length} cases
                </span>
              </div>
            )}

            {/* Fixed Bulk Action Bar - Bottom Right */}
            {selectedCases.size > 0 && (
              <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-gray-200 dark:border-zinc-700">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {selectedCases.size} case(s) selected
                </span>
                <button
                  onClick={() => {
                    setSelectedCases(new Set());
                    setMultiSelectMode(false);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear
                </button>
                <div className="h-6 w-px bg-gray-300 dark:bg-zinc-600" />
                <div className="flex gap-2">
                  {/* Bulk Archive with Confirmation */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        disabled={deletingCnr === "bulk"}
                        className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Archive {selectedCases.size} Case(s)?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          These cases will be moved to the archive. You can
                          restore them later from Archived Cases.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBulkArchive}
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          Archive
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {/* Bulk Delete with Confirmation */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        disabled={deletingCnr === "bulk"}
                        className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete {selectedCases.size} Case(s)?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-red-600 font-medium">
                          ⚠️ This will permanently delete the selected cases!
                        </AlertDialogDescription>
                        <AlertDialogDescription>
                          You will have 5 seconds to undo after confirming.
                          After that, the cases and all associated data will be
                          permanently removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBulkDelete}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-zinc-800">
                  <tr>
                    {/* Checkbox column header - only when multi-select mode is on */}
                    {multiSelectMode && (
                      <th
                        scope="col"
                        className="px-4 py-3 text-center table-cell-divider"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          onClick={handleSelectAll}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all mx-auto ${
                            processedCases.length > 0 &&
                            selectedCases.size === processedCases.length
                              ? "bg-blue-600 border-blue-600"
                              : selectedCases.size > 0
                              ? "bg-blue-600/50 border-blue-600"
                              : "border-gray-400 dark:border-gray-500 hover:border-blue-500"
                          }`}
                        >
                          {processedCases.length > 0 &&
                            selectedCases.size === processedCases.length && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          {selectedCases.size > 0 &&
                            selectedCases.size < processedCases.length && (
                              <div className="w-2.5 h-0.5 bg-white rounded" />
                            )}
                        </div>
                      </th>
                    )}
                    <th
                      scope="col"
                      onClick={() => handleSort("cnr")}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 select-none table-cell-divider"
                    >
                      Case Number
                      <SortIcon field="cnr" />
                    </th>
                    <th
                      scope="col"
                      onClick={() => handleSort("title")}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 select-none table-cell-divider"
                    >
                      Title
                      <SortIcon field="title" />
                    </th>
                    <th
                      scope="col"
                      onClick={() => handleSort("status")}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 select-none table-cell-divider"
                    >
                      Status
                      <SortIcon field="status" />
                    </th>
                    <th
                      scope="col"
                      onClick={() => handleSort("created_at")}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 select-none table-cell-divider"
                    >
                      Date Filed
                      <SortIcon field="created_at" />
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
                  {processedCases.map((caseItem) => (
                    <tr
                      key={caseItem.cnr}
                      className="hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                      onClick={() =>
                        router.push(`/dashboard/cases/${caseItem.cnr}`)
                      }
                    >
                      {/* Checkbox cell - only when multi-select mode is on */}
                      {multiSelectMode && (
                        <td
                          className="px-4 py-4 text-center table-cell-divider"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            onClick={() => toggleCaseSelection(caseItem.cnr)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all mx-auto ${
                              selectedCases.has(caseItem.cnr)
                                ? "bg-blue-600 border-blue-600"
                                : "border-gray-400 dark:border-gray-500 hover:border-blue-500"
                            }`}
                          >
                            {selectedCases.has(caseItem.cnr) && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-center table-cell-divider">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {caseItem.cnr}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center table-cell-divider">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {caseItem.title || "Untitled Case"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center table-cell-divider">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-center table-cell-divider">
                        {caseItem.created_at
                          ? new Date(caseItem.created_at).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <div className="flex items-center justify-center gap-2">
                          {/* Archive Button (Move to Archived Cases) */}
                          {skipArchiveConfirmation ? (
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleDeleteCase(caseItem.cnr);
                              }}
                              disabled={deletingCnr === caseItem.cnr}
                              className="p-2 bg-orange-100 text-orange-600 hover:bg-orange-200 hover:text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 rounded-lg transition-colors disabled:opacity-50"
                              title="Archive Case"
                            >
                              <Archive className="h-5 w-5" />
                            </button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  onClick={(e: React.MouseEvent) =>
                                    e.stopPropagation()
                                  }
                                  disabled={deletingCnr === caseItem.cnr}
                                  className="p-2 bg-orange-100 text-orange-600 hover:bg-orange-200 hover:text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 rounded-lg transition-colors disabled:opacity-50"
                                  title="Archive Case"
                                >
                                  <Archive className="h-5 w-5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent
                                onClick={(e: React.MouseEvent) =>
                                  e.stopPropagation()
                                }
                              >
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Archive Case
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to archive this case?
                                    It will be moved to Archived Cases where you
                                    can restore it later or delete it.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDeleteCase(caseItem.cnr)
                                    }
                                    className="bg-orange-600 hover:bg-orange-700 text-white"
                                  >
                                    Archive Case
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          {/* Delete Button */}
                          {skipDeleteConfirmation ? (
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handlePermanentDeleteCase(caseItem.cnr);
                              }}
                              disabled={deletingCnr === caseItem.cnr}
                              className="p-2 bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  onClick={(e: React.MouseEvent) =>
                                    e.stopPropagation()
                                  }
                                  disabled={deletingCnr === caseItem.cnr}
                                  className="p-2 bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors disabled:opacity-50"
                                  title="Delete"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent
                                onClick={(e: React.MouseEvent) =>
                                  e.stopPropagation()
                                }
                              >
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete Case
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-red-600 font-medium">
                                    ⚠️ This action cannot be undone!
                                  </AlertDialogDescription>
                                  <AlertDialogDescription>
                                    This will permanently delete the case and
                                    all associated data. You will not be able to
                                    recover this case.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handlePermanentDeleteCase(caseItem.cnr)
                                    }
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
