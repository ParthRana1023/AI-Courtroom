"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { use } from "react"; // Add this import
import Navigation from "@/components/navigation";
import { caseAPI, argumentAPI } from "@/lib/api";
import { type Case, CaseStatus, type Argument } from "@/types";

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      } catch (error) {
        setError("Failed to load case details. Please try again later.");
        console.error("Error fetching case details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCaseDetails();
  }, [cnr, role]);

  useEffect(() => {
    // Scroll to bottom of chat when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [caseHistory, counterArgument]);

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

        // If AI Defendant provides a counter-argument
        if (response.counter_argument) {
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

        // If AI Plaintiff provides a counter-argument
        // Assuming backend sends 'counter_argument' for AI plaintiff's response in subsequent turns
        if (response.counter_argument) {
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
            <h1 className="text-2xl font-bold">Courtroom</h1>
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
              <span className="font-medium">Case Number:</span>{" "}
              {caseData.case_number} |
              <span className="font-medium ml-2">CNR:</span> {caseData.cnr}
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
                          isUser
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

              {/* Verdict (if available) */}
              {caseHistory.verdict && (
                <div className="flex justify-center my-6">
                  <div className="max-w-[90%] bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">
                      Final Verdict
                    </h3>
                    <p className="whitespace-pre-wrap text-green-900">
                      {caseHistory.verdict}
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          {caseData.status !== CaseStatus.RESOLVED && (
            <div className="mt-4">
              <div className="flex flex-col space-y-2">
                <textarea
                  value={argument}
                  onChange={(e) => setArgument(e.target.value)}
                  placeholder={`Enter your ${
                    showClosingButton ? "closing statement" : "argument"
                  }...`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32"
                  disabled={isSubmitting}
                />
                <div className="flex justify-end">
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSubmitArgument}
                      disabled={isSubmitting || !argument.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Argument"}
                    </button>

                    {showClosingButton && (
                      <button
                        onClick={handleSubmitClosingStatement}
                        disabled={isSubmitting || !argument.trim()}
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
    </div>
  );
}
