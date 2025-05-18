"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { use } from "react"; // Add this import
import SettingsAwareTextArea from "@/components/settings-aware-textarea";
import Navigation from "@/components/navigation";
import { caseAPI, argumentAPI } from "@/lib/api";
import { rateLimitAPI, type RateLimitInfo } from "@/lib/rateLimitAPI";
import { type Case, CaseStatus, type Argument } from "@/types";
import MarkdownRenderer from "@/components/markdown-renderer";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Courtroom({ params }: { params: { cnr: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "";

  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const cnr = (unwrappedParams as { cnr: string }).cnr;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [caseHistory, setCaseHistory] = useState<{
    plaintiff_arguments: Argument[];
    defendant_arguments: Argument[];
    verdict: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [argument, setArgument] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentRole, setCurrentRole] = useState<string>(role);
  const [showClosingButton, setShowClosingButton] = useState(false);
  const [counterArgument, setCounterArgument] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(384); // Default width (96 * 4 = 384px)
  const [isResizing, setIsResizing] = useState(false);
  const [verdictDialogOpen, setVerdictDialogOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeDividerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchCaseDetails = async () => {
      try {
        const data = await caseAPI.getCase(cnr);
        setCaseData(data);

        // Fetch case history
        const history = await caseAPI.getCaseHistory(cnr); // Changed from params.cnr
        setCaseHistory(history);

        // Determine if we should show the closing statement button
        const userArguments =
          history.plaintiff_arguments.filter((arg) => arg.type === "user")
            .length +
          history.defendant_arguments.filter((arg) => arg.type === "user")
            .length;

        setShowClosingButton(userArguments >= 3);

        // Determine role based on previous participation
        // This is critical to prevent 403 errors when submitting arguments
        let detectedRole = "";

        // Check if user has participated as plaintiff
        const participatedAsPlaintiff = history.plaintiff_arguments.some(
          (arg) => arg.user_id && arg.type === "user"
        );

        // Check if user has participated as defendant
        const participatedAsDefendant = history.defendant_arguments.some(
          (arg) => arg.user_id && arg.type === "user"
        );

        if (participatedAsPlaintiff) {
          detectedRole = "plaintiff";
        } else if (participatedAsDefendant) {
          detectedRole = "defendant";
        }

        // If role is provided in URL but conflicts with previous participation, ignore it
        if (
          role &&
          ((role === "plaintiff" && participatedAsDefendant) ||
            (role === "defendant" && participatedAsPlaintiff))
        ) {
          console.warn(
            "Cannot switch roles. Using previously established role."
          );
          setCurrentRole(detectedRole);
        } else if (role) {
          // Use role from URL if it doesn't conflict
          setCurrentRole(role);
        } else {
          // Use detected role or default to plaintiff if no participation yet
          setCurrentRole(detectedRole || "plaintiff");
        }

        // Fetch rate limit information
        await fetchRateLimitInfo();
      } catch (error) {
        setError("Failed to load case details. Please try again later.");
        console.error("Error fetching case details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCaseDetails();
  }, [cnr, role]);

  // Fetch rate limit information and update countdown timer
  const fetchRateLimitInfo = async () => {
    try {
      const limitInfo = await rateLimitAPI.getArgumentRateLimit();
      setRateLimit(limitInfo);

      if (limitInfo.seconds_until_next) {
        setTimeRemaining(Math.ceil(limitInfo.seconds_until_next));
      } else {
        setTimeRemaining(null);
      }
    } catch (error) {
      console.error("Error fetching rate limit info:", error);
    }
  };

  // Update countdown timer every second
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          // Refresh rate limit info when timer reaches zero
          fetchRateLimitInfo();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  useEffect(() => {
    // Scroll to bottom of chat when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [caseHistory, counterArgument]);

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new width based on mouse position
      // Window width - mouse X position from right side of screen
      const newWidth = window.innerWidth - e.clientX;

      // Set minimum and maximum width constraints
      const minWidth = 300;
      const maxWidth = Math.min(600, window.innerWidth * 0.8);

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    // Add event listeners when resizing is active
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    // Clean up event listeners
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleSubmitArgument = async () => {
    if (!argument.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await argumentAPI.submitArgument(
        cnr,
        currentRole,
        argument
      ); // Changed from params.cnr

      // Initialize updatedHistory once, ensuring arrays are properly initialized
      const updatedHistory = {
        ...caseHistory!, // Spread existing history
        plaintiff_arguments: [...(caseHistory?.plaintiff_arguments || [])],
        defendant_arguments: [...(caseHistory?.defendant_arguments || [])],
      };

      const userArgumentTimestamp = new Date().toISOString();
      const aiCounterArgumentTimestamp = new Date();
      // Ensure AI counter is slightly later for chronological display
      aiCounterArgumentTimestamp.setSeconds(
        aiCounterArgumentTimestamp.getSeconds() + 1
      );

      // Scenario 1: User is Defendant, and it's the first turn (AI Plaintiff makes opening statement)
      if (
        currentRole === "defendant" &&
        (response.plaintiff_opening_statement || response.plaintiff_opening)
      ) {
        const openingStatement =
          response.plaintiff_opening_statement || response.plaintiff_opening;

        // Add AI Plaintiff's opening statement
        // Ensure this timestamp is slightly before the user's argument for correct ordering
        const plaintiffOpeningTimestamp = new Date(
          new Date(userArgumentTimestamp).getTime() - 1000
        ).toISOString();
        updatedHistory.plaintiff_arguments.push({
          type: "opening",
          content: openingStatement,
          user_id: null,
          timestamp: plaintiffOpeningTimestamp,
        });

        // Add User (Defendant)'s argument
        updatedHistory.defendant_arguments.push({
          type: "user",
          content: argument,
          user_id: "current-user", // Replace with actual user ID if available
          timestamp: userArgumentTimestamp,
        });

        // If AI Plaintiff provides an immediate counter-argument to the defendant's first response
        if (response.ai_plaintiff_counter_argument) {
          // Assuming this key exists in API response for this scenario
          updatedHistory.plaintiff_arguments.push({
            type: "counter",
            content: response.ai_plaintiff_counter_argument,
            user_id: null,
            timestamp: aiCounterArgumentTimestamp.toISOString(),
          });
        }
      }
      // Scenario 2: User is Plaintiff
      else if (currentRole === "plaintiff") {
        // Add User (Plaintiff)'s argument
        updatedHistory.plaintiff_arguments.push({
          type: "user",
          content: argument,
          user_id: "current-user", // Replace with actual user ID
          timestamp: userArgumentTimestamp,
        });

        // Check if there was an error generating the counter argument
        if (response.error) {
          // Display error as an alert instead of storing it as an argument
          setError(response.error);
        } else if (response.counter_argument) {
          // If AI Defendant provides a counter-argument
          updatedHistory.defendant_arguments.push({
            type: "counter",
            content: response.counter_argument,
            user_id: null,
            timestamp: aiCounterArgumentTimestamp.toISOString(),
          });
        }
      }
      // Scenario 3: User is Defendant (not the first turn, i.e., no AI plaintiff opening statement)
      else if (currentRole === "defendant") {
        // Add User (Defendant)'s argument
        updatedHistory.defendant_arguments.push({
          type: "user",
          content: argument,
          user_id: "current-user", // Replace with actual user ID
          timestamp: userArgumentTimestamp,
        });

        // Check if there was an error generating the counter argument
        if (response.error) {
          // Display error as an alert instead of storing it as an argument
          setError(response.error);
        } else if (response.counter_argument) {
          // If AI Plaintiff provides a counter-argument
          updatedHistory.plaintiff_arguments.push({
            type: "counter",
            content: response.counter_argument,
            user_id: null,
            timestamp: aiCounterArgumentTimestamp.toISOString(),
          });
        }
      }

      setCaseHistory(updatedHistory);

      // Update showClosingButton logic based on the new history
      const userPlaintiffArgs = updatedHistory.plaintiff_arguments.filter(
        (arg) => arg.type === "user" && arg.user_id === "current-user"
      ).length;
      const userDefendantArgs = updatedHistory.defendant_arguments.filter(
        (arg) => arg.type === "user" && arg.user_id === "current-user"
      ).length;
      setShowClosingButton(userPlaintiffArgs + userDefendantArgs >= 3);

      // Check if we should show the closing statement button
      const userArguments =
        caseHistory!.plaintiff_arguments.filter((arg) => arg.type === "user")
          .length +
        caseHistory!.defendant_arguments.filter((arg) => arg.type === "user")
          .length;

      setShowClosingButton(userArguments >= 3);

      // Clear the input
      setArgument("");
      setCounterArgument(null);

      // Refresh case data to get updated status
      const updatedCase = await caseAPI.getCase(cnr); // Changed from params.cnr
      setCaseData(updatedCase);

      // Refresh rate limit information
      await fetchRateLimitInfo();

      // Update the remaining attempts counter
      if (rateLimit) {
        setRateLimit({
          ...rateLimit,
          remaining_attempts: Math.max(0, rateLimit.remaining_attempts - 1),
        });
      }
    } catch (error: any) {
      console.error("Error submitting argument:", error);
      if (error.response?.status === 403 && error.response?.data?.detail) {
        // Handle role switching error specifically
        if (error.response.data.detail.includes("Cannot switch roles")) {
          setError(
            "You cannot switch roles in this case. Please continue with your current role."
          );

          // Refresh case details to ensure we have the correct role
          try {
            const history = await caseAPI.getCaseHistory(cnr);

            // Determine correct role based on previous participation
            const participatedAsPlaintiff = history.plaintiff_arguments.some(
              (arg) => arg.user_id && arg.type === "user"
            );

            const participatedAsDefendant = history.defendant_arguments.some(
              (arg) => arg.user_id && arg.type === "user"
            );

            if (participatedAsPlaintiff) {
              setCurrentRole("plaintiff");
            } else if (participatedAsDefendant) {
              setCurrentRole("defendant");
            }

            setCaseHistory(history);
          } catch (refreshError) {
            console.error("Error refreshing case history:", refreshError);
          }
        } else {
          setError(error.response.data.detail);
        }
      } else if (error.response?.data?.detail) {
        setError(error.response.data.detail);
      } else {
        setError("Failed to submit argument. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitClosingStatement = async () => {
    if (!argument.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await argumentAPI.submitClosingStatement(
        cnr,
        currentRole,
        argument
      ); // Changed from params.cnr

      // Update the UI with the closing statement and verdict
      const updatedHistory = { ...caseHistory! };
      if (currentRole === "plaintiff") {
        updatedHistory.plaintiff_arguments = [
          ...updatedHistory.plaintiff_arguments,
          {
            type: "closing",
            content: argument,
            user_id: "current-user",
            timestamp: new Date().toISOString(),
          },
        ];
      } else {
        updatedHistory.defendant_arguments = [
          ...updatedHistory.defendant_arguments,
          {
            type: "closing",
            content: argument,
            user_id: "current-user",
            timestamp: new Date().toISOString(),
          },
        ];
      }

      if (response.verdict) {
        updatedHistory.verdict = response.verdict;
      }

      setCaseHistory(updatedHistory);
      setArgument("");

      // Refresh case data to get updated status
      const updatedCase = await caseAPI.getCase(cnr); // Changed from params.cnr
      setCaseData(updatedCase);

      // Refresh rate limit information
      await fetchRateLimitInfo();

      // Update the remaining attempts counter
      if (rateLimit) {
        setRateLimit({
          ...rateLimit,
          remaining_attempts: Math.max(0, rateLimit.remaining_attempts - 1),
        });
      }
    } catch (error: any) {
      console.error("Error submitting closing statement:", error);
      if (error.response?.data?.detail) {
        setError(error.response.data.detail);
      } else {
        setError("Failed to submit closing statement. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4">Loading courtroom...</p>
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

  if (!caseData || !caseHistory) {
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
            <div className="flex items-center">
              <h1 className="text-2xl font-bold">Courtroom</h1>
              <button
                onClick={() => setSidebarOpen(true)}
                className="ml-4 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                View Case Details
              </button>
              {caseHistory.verdict && (
                <button
                  onClick={() => setVerdictDialogOpen(true)}
                  className="ml-4 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  View Verdict
                </button>
              )}
            </div>
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

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">{caseData.title}</h2>
            <p className="text-gray-600">
              <span className="font-medium">Case Number:</span> {caseData.cnr}
            </p>
            <p className="text-gray-600">
              <span className="font-medium">Date Filed:</span>{" "}
              {caseData.created_at
                ? new Date(caseData.created_at).toLocaleDateString()
                : "N/A"}
            </p>
            <p className="text-gray-600">
              <span className="font-medium">Court:</span> {caseData.court}
            </p>
            {currentRole && (
              <div className="mt-2">
                <span className="font-medium">Your Role:</span>{" "}
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    currentRole === "plaintiff"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {currentRole === "plaintiff"
                    ? "Plaintiff Lawyer"
                    : "Defendant Lawyer"}
                </span>
              </div>
            )}
          </div>

          <div className="mb-6 bg-gray-50 rounded-lg p-4 h-[400px] overflow-y-auto">
            {/* Chat messages */}
            <div className="space-y-4">
              {/* Combine and sort plaintiff and defendant arguments chronologically */}
              {[
                ...caseHistory.plaintiff_arguments,
                ...caseHistory.defendant_arguments,
              ]
                .sort((a, b) => {
                  // Sort by timestamp to display in chronological order
                  if (a.timestamp && b.timestamp) {
                    return (
                      new Date(a.timestamp).getTime() -
                      new Date(b.timestamp).getTime()
                    );
                  }
                  // Fallback to type-based sorting if timestamps are missing
                  const typeOrder = {
                    opening: 0,
                    user: 1,
                    counter: 1,
                    closing: 2,
                  };
                  return (
                    (typeOrder as any)[a.type] - (typeOrder as any)[b.type]
                  );
                })
                .map((arg, index) => {
                  const isPlaintiff =
                    caseHistory.plaintiff_arguments.includes(arg);
                  const role = isPlaintiff ? "plaintiff" : "defendant";
                  const isUser =
                    arg.user_id === "current-user" ||
                    (currentRole === role && arg.type === "user");

                  return (
                    <div
                      key={index}
                      className={`flex ${
                        isUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg p-3 ${
                          isUser ||
                          (arg.user_id === "current-user" &&
                            arg.type === "closing")
                            ? "bg-blue-100 text-blue-900"
                            : "bg-gray-200 text-gray-900"
                        }`}
                      >
                        <div className="text-xs font-medium mb-1 flex justify-between">
                          <span>
                            {isPlaintiff ? "Plaintiff" : "Defendant"}{" "}
                            {arg.type === "opening" && "(Opening Statement)"}
                            {arg.type === "closing" && "(Closing Statement)"}
                          </span>
                          {arg.timestamp && (
                            <span className="text-xs text-gray-500 ml-2">
                              {new Date(arg.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{arg.content}</p>
                      </div>
                    </div>
                  );
                })}

              {/* Verdict is now shown in a popup dialog */}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area - only show if case is not resolved */}
          {caseData.status !== CaseStatus.RESOLVED && !caseHistory.verdict && (
            <div className="mt-4">
              {/* Rate limit information */}
              {rateLimit && (
                <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-700">
                        Daily argument limit:
                      </span>{" "}
                      <span
                        className={`${
                          rateLimit.remaining_attempts === 0
                            ? "text-red-600 font-medium"
                            : "text-gray-900"
                        }`}
                      >
                        {rateLimit.remaining_attempts} of{" "}
                        {rateLimit.max_attempts} remaining
                      </span>
                    </div>

                    {timeRemaining !== null && timeRemaining > 0 ? (
                      <div className="mt-2 sm:mt-0 flex items-center">
                        <div className="text-orange-600 font-medium flex items-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>Next submission in: </span>
                          <span className="ml-1 bg-orange-100 text-orange-800 px-2 py-1 rounded font-mono">
                            {Math.floor(timeRemaining / 60)}:
                            {(timeRemaining % 60).toString().padStart(2, "0")}
                          </span>
                        </div>
                      </div>
                    ) : rateLimit.remaining_attempts === 0 ? (
                      <div className="mt-2 sm:mt-0">
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                          Daily limit reached
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              <div className="flex flex-col space-y-2">
                <SettingsAwareTextArea
                  value={argument}
                  onChange={setArgument}
                  onSubmit={handleSubmitArgument}
                  placeholder={`Enter your ${
                    showClosingButton ? "closing statement" : "argument"
                  }...`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32"
                  disabled={
                    isSubmitting ||
                    (timeRemaining !== null && timeRemaining > 0)
                  }
                />
                <div className="flex justify-end">
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSubmitArgument}
                      disabled={
                        isSubmitting ||
                        !argument.trim() ||
                        (timeRemaining !== null && timeRemaining > 0)
                      }
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Argument"}
                    </button>

                    {showClosingButton && (
                      <button
                        onClick={handleSubmitClosingStatement}
                        disabled={
                          isSubmitting ||
                          !argument.trim() ||
                          (timeRemaining !== null && timeRemaining > 0)
                        }
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md transition-colors disabled:opacity-50"
                      >
                        {isSubmitting
                          ? "Submitting..."
                          : "Submit Closing Statement"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Case Details Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 z-50 bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Resize handle */}
        <div
          ref={resizeDividerRef}
          className={`absolute inset-y-0 left-0 w-1 hover:w-2 transition-all ${
            isResizing ? "bg-blue-500 w-2" : "bg-gray-300"
          } cursor-col-resize`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />

        <div className="h-full flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h2 className="text-xl font-bold">Case Details</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-500 hover:text-gray-700 focus:outline-none"
              aria-label="Close sidebar"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            <div>
              <h3 className="font-medium text-gray-700">Case Title</h3>
              <p className="text-gray-900">{caseData.title}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-700">Case Number (CNR)</h3>
              <p className="text-gray-900">{caseData.cnr}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-700">Court</h3>
              <p className="text-gray-900">{caseData.court || "N/A"}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-700">Date Filed</h3>
              <p className="text-gray-900">
                {caseData.created_at
                  ? new Date(caseData.created_at).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-700">Status</h3>
              <p className="text-gray-900">{caseData.status}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-700">Case Details</h3>
              {caseData.case_text ? (
                <div className="mt-2 border border-gray-200 rounded-md p-4 bg-gray-50">
                  <MarkdownRenderer
                    markdown={caseData.case_text}
                    className="prose prose-sm max-w-none font-serif"
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
      </div>

      {/* Overlay for mobile - closes sidebar when clicked */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Overlay when resizing is active */}
      {isResizing && <div className="fixed inset-0 z-40 cursor-col-resize" />}

      {/* Verdict Dialog */}
      <Dialog open={verdictDialogOpen} onOpenChange={setVerdictDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-green-800">
              Final Verdict
            </DialogTitle>
          </DialogHeader>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <p className="whitespace-pre-wrap text-green-900">
              {caseHistory?.verdict}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
