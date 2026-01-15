"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { caseAPI } from "@/lib/api";
import { type CaseListItem, CaseStatus } from "@/types";
import ProfileBento from "@/components/profile-bento";
import {
  Search,
  Plus,
  Loader2,
  AlertCircle,
  User,
  Gavel,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";
import { getLogger } from "@/lib/logger";

const logger = getLogger("ui");

export default function ProfilePage() {
  useLifecycleLogger("ProfilePage");

  const router = useRouter();
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [error, setError] = useState("");

  // Ref for click-outside handling
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    if (!searchExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setSearchExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchExpanded]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const fetchCases = async () => {
      if (isAuthenticated) {
        try {
          const casesData = await caseAPI.listCases();
          setCases(casesData);
        } catch (error) {
          setError("Failed to load cases. Please try again later.");
          logger.error("Failed to fetch cases", error as Error);
        } finally {
          setIsLoadingCases(false);
        }
      }
    };

    if (!isLoading) {
      fetchCases();
    }
  }, [isAuthenticated, isLoading]);

  const filteredCases = cases
    ? cases.filter(
        (caseItem) =>
          caseItem.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          caseItem.cnr.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // Unfiltered counts for the bento grid (not affected by search)
  const allActiveCases = cases.filter(
    (caseItem) => caseItem.status !== CaseStatus.RESOLVED
  );

  const allResolvedCases = cases.filter(
    (caseItem) => caseItem.status === CaseStatus.RESOLVED
  );

  // Filtered counts for display in tables
  const activeCases = filteredCases.filter(
    (caseItem) => caseItem.status !== CaseStatus.RESOLVED
  );

  const resolvedCases = filteredCases.filter(
    (caseItem) => caseItem.status === CaseStatus.RESOLVED
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-zinc-500 mx-auto" />
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Loading your profile...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-zinc-900 p-8 rounded-xl shadow-lg max-w-md">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4 text-zinc-800 dark:text-zinc-100">
            Access Denied
          </h1>
          <p className="mb-6 text-zinc-600 dark:text-zinc-400">
            Please log in to view your profile.
          </p>
          <Link
            href="/login"
            className="bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 font-bold py-3 px-6 rounded-lg inline-flex items-center transition-colors"
          >
            <User className="h-4 w-4 mr-2" />
            <span>Login</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 container mx-auto px-4 py-8">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-md p-6 mb-8 border border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold mb-6 text-zinc-800 dark:text-zinc-100">
          Your Profile
        </h1>

        {user && (
          <>
            <ProfileBento
              user={user}
              caseStats={{
                total: cases.length,
                active: allActiveCases.length,
                completed: allResolvedCases.length,
              }}
              enableStars={true}
              enableSpotlight={true}
              enableBorderGlow={true}
              enableTilt={true}
              enableMagnetism={true}
              clickEffect={true}
              spotlightRadius={300}
              particleCount={8}
              glowColor="59, 130, 246"
              onRefreshUser={refreshUser}
            />
          </>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pt-5">
          <h2 className="text-xl font-semibold flex items-center text-zinc-800 dark:text-zinc-100">
            <Gavel className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
            <span>Your Cases</span>
          </h2>

          <div className="flex items-center gap-3">
            {/* Animated Search Bar - expands to the left */}
            <div ref={searchRef} className="relative flex items-center">
              <div
                className={`absolute right-full mr-2 overflow-hidden transition-all duration-500 ease-out ${
                  searchExpanded ? "w-72 opacity-100" : "w-0 opacity-0"
                }`}
              >
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title or case number..."
                  className="w-72 px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 shadow-lg"
                  autoFocus={searchExpanded}
                />
              </div>
              <button
                onClick={() => setSearchExpanded(!searchExpanded)}
                className={`p-2 rounded-lg transition-colors ${
                  searchExpanded || searchTerm
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                }`}
                title="Search"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>

            <Link
              href="/dashboard/generate-case"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span>Generate New Case</span>
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        )}

        {isLoadingCases ? (
          <div className="text-center py-8">
            <Loader2 className="animate-spin h-12 w-12 text-zinc-500 mx-auto" />
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              Loading cases...
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4 flex items-center text-zinc-800 dark:text-zinc-100">
                <Clock className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
                <span>Active Cases</span>
              </h3>
              {activeCases.length > 0 ? (
                <div className="overflow-x-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                  <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-800">
                      <tr>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Case Number
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Case Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
                      {activeCases.map((caseItem) => (
                        <tr
                          key={caseItem.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100 text-center">
                            {caseItem.cnr}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 text-center">
                            {caseItem.title}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 text-center">
                            {new Date(caseItem.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                caseItem.status === CaseStatus.ACTIVE
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                  : caseItem.status === CaseStatus.RESOLVED
                                  ? "bg-gray-100 text-gray-800 dark:bg-zinc-700 dark:text-zinc-300"
                                  : caseItem.status === CaseStatus.ADJOURNED
                                  ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              }`}
                            >
                              {caseItem.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                            <Link
                              href={`/dashboard/cases/${caseItem.cnr}`}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                            >
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center">
                  <p className="text-zinc-500 dark:text-zinc-400 italic">
                    No active cases found.
                  </p>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4 flex items-center text-zinc-800 dark:text-zinc-100">
                <CheckCircle className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
                <span>Resolved Cases</span>
              </h3>
              {resolvedCases.length > 0 ? (
                <div className="overflow-x-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                  <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-800">
                      <tr>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Case Number
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Case Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
                      {resolvedCases.map((caseItem) => (
                        <tr
                          key={caseItem.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100 text-center">
                            {caseItem.cnr}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 text-center">
                            {caseItem.title}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 text-center">
                            {new Date(caseItem.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-zinc-700 dark:text-zinc-300">
                              {caseItem.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                            <Link
                              href={`/dashboard/cases/${caseItem.cnr}`}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                            >
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center">
                  <p className="text-zinc-500 dark:text-zinc-400 italic">
                    No resolved cases found.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
