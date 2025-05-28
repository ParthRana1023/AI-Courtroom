"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import Navigation from "@/components/navigation";
import { caseAPI } from "@/lib/api";
import { type CaseListItem, CaseStatus } from "@/types";
import {
  Search,
  Plus,
  Loader2,
  AlertCircle,
  User,
  FileText,
  CheckCircle,
  Clock,
} from "lucide-react";

export default function Dashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");

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
          console.error("Error fetching cases:", error);
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

  const activeCases = filteredCases.filter(
    (caseItem) => caseItem.status !== CaseStatus.RESOLVED
  );

  const resolvedCases = filteredCases.filter(
    (caseItem) => caseItem.status === CaseStatus.RESOLVED
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-zinc-500 mx-auto" />
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              Loading your dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center bg-white dark:bg-zinc-900 p-8 rounded-xl shadow-lg max-w-md">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-4 text-zinc-800 dark:text-zinc-100">
              Access Denied
            </h1>
            <p className="mb-6 text-zinc-600 dark:text-zinc-400">
              Please log in to view your dashboard.
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
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-grow container mx-auto px-4 py-8">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-md p-6 mb-8 border border-zinc-200 dark:border-zinc-800">
          <h1 className="text-2xl font-bold mb-6 text-zinc-800 dark:text-zinc-100">
            Welcome to Your Dashboard
          </h1>

          {user && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center text-zinc-800 dark:text-zinc-100">
                  <User className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
                  <span>Your Profile</span>
                </h2>
                <div className="space-y-3">
                  <p className="flex items-center text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium w-24">Name:</span>
                    <span>
                      {user.first_name} {user.last_name}
                    </span>
                  </p>
                  <p className="flex items-center text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium w-24">Email:</span>
                    <span>{user.email}</span>
                  </p>
                  <p className="flex items-center text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium w-24">Phone:</span>
                    <span>{user.phone_number}</span>
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center text-zinc-800 dark:text-zinc-100">
                  <FileText className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
                  <span>Case Summary</span>
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">
                      {activeCases.length}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center justify-center">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>Active</span>
                    </p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">
                      {resolvedCases.length}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      <span>Resolved</span>
                    </p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">
                      {filteredCases.length}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center justify-center">
                      <FileText className="h-4 w-4 mr-1" />
                      <span>Total</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h2 className="text-xl font-semibold flex items-center text-zinc-800 dark:text-zinc-100">
              <FileText className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
              <span>Your Cases</span>
            </h2>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search cases..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <Search className="h-5 w-5 text-zinc-400" />
                </div>
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
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Case Number
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Title
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
                        {activeCases.map((caseItem) => (
                          <tr
                            key={caseItem.id}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {caseItem.cnr}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                              {caseItem.title}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                              {new Date(
                                caseItem.created_at
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  caseItem.status === CaseStatus.ACTIVE
                                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                                }`}
                              >
                                {caseItem.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Link
                                href={`/dashboard/cases/${caseItem.cnr}`}
                                className="text-zinc-900 dark:text-zinc-100 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium"
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
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Case Number
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Title
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
                        {resolvedCases.map((caseItem) => (
                          <tr
                            key={caseItem.id}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {caseItem.cnr}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                              {caseItem.title}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                              {new Date(
                                caseItem.created_at
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                {caseItem.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Link
                                href={`/dashboard/cases/${caseItem.cnr}`}
                                className="text-zinc-900 dark:text-zinc-100 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium"
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
    </div>
  );
}
