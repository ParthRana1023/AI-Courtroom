"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { use } from "react";
import Navigation from "@/components/navigation";
import { caseAPI, argumentAPI } from "@/lib/api";
import { argumentRateLimitAPI, RateLimitInfo } from "@/lib/rateLimitAPI";
import { type Case, CaseStatus, type Argument } from "@/types";
import {
  createArgumentTimestamp,
  createOffsetTimestamp,
  createOffsetDate,
  formatToLocaleDateString,
  formatToLocaleString,
  sortByTimestamp,
} from "@/lib/datetime";
import SettingsAwareTextArea from "@/components/settings-aware-textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownRenderer from "@/components/markdown-renderer";

export default function Courtroom({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "";

  const { cnr } = use(params);

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
  const [showVerdict, setShowVerdict] = useState(false);
  const [showCaseDetails, setShowCaseDetails] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [caseAnalysis, setCaseAnalysis] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Combine and sort all arguments chronologically
  const allArguments = useMemo(() => {
    if (!caseHistory) return [];
    const combined = [
      ...(caseHistory.plaintiff_arguments || []),
      ...(caseHistory.defendant_arguments || []),
    ];
    return sortByTimestamp(combined);
  }, [caseHistory]);

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
          history.plaintiff_arguments.filter(
            (arg: Argument) => arg.type === "user"
          ).length +
          history.defendant_arguments.filter(
            (arg: Argument) => arg.type === "user"
          ).length;

        setShowClosingButton(userArguments >= 3);

        // Determine role based on previous participation
        // This is critical to prevent 403 errors when submitting arguments
        let detectedRole = "";

        // Check if user has participated as plaintiff
        const participatedAsPlaintiff = history.plaintiff_arguments.some(
          (arg: Argument) => arg.user_id && arg.type === "user"
        );

        // Check if user has participated as defendant
        const participatedAsDefendant = history.defendant_arguments.some(
          (arg: Argument) => arg.user_id && arg.type === "user"
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

        // Lock role if case is NOT_STARTED and role is provided in URL
        if (data.status === CaseStatus.NOT_STARTED && role) {
          setCurrentRole(role);
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
      const limitInfo = await argumentRateLimitAPI.getArgumentRateLimit();

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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [caseHistory, counterArgument]);

  // Poll for case history updates to catch plaintiff opening statement
  // This is especially important when user selects defendant role
  useEffect(() => {
    // Only set up polling if we have case data and the case is active
    if (!caseData || caseData.status !== CaseStatus.ACTIVE) return;

    // Check if user is defendant and there are no plaintiff arguments yet
    const isDefendantWithNoPlaintiffArgs =
      currentRole === "defendant" &&
      caseHistory &&
      caseHistory.plaintiff_arguments.length === 0;

    // If we're in this state, poll for updates
    if (isDefendantWithNoPlaintiffArgs) {
      console.log("Setting up polling for plaintiff opening statement");

      const pollInterval = setInterval(async () => {
        try {
          console.log("Polling for case history updates...");
          const updatedHistory = await caseAPI.getCaseHistory(cnr);

          // Check if there are new plaintiff arguments
          if (updatedHistory.plaintiff_arguments.length > 0) {
            console.log("Found new plaintiff arguments, updating case history");
            setCaseHistory(updatedHistory);
            clearInterval(pollInterval); // Stop polling once we find the opening statement
          }
        } catch (pollError) {
          console.error("Error polling case history:", pollError);
        }
      }, 2000); // Poll every 2 seconds

      return () => {
        console.log("Cleaning up polling interval");
        clearInterval(pollInterval);
      };
    }
  }, [caseData, caseHistory, currentRole, cnr]);

  const handleSubmitArgument = async () => {
    if (!argument.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await argumentAPI.submitArgument(
        cnr,
        currentRole,
        argument
      );

      // Initialize updatedHistory once, ensuring arrays are properly initialized
      const updatedHistory = {
        ...caseHistory!, // Spread existing history
        plaintiff_arguments: [...(caseHistory?.plaintiff_arguments || [])],
        defendant_arguments: [...(caseHistory?.defendant_arguments || [])],
      };

      // In handleSubmitArgument function, ensure consistent timestamp format
      const userArgumentTimestamp = createArgumentTimestamp();

      // Add User's argument based on their role
      if (currentRole === "plaintiff") {
        updatedHistory.plaintiff_arguments.push({
          type: "user",
          content: argument,
          user_id: "current-user",
          timestamp: userArgumentTimestamp, // Ensure this is always set
        });
      } else if (currentRole === "defendant") {
        updatedHistory.defendant_arguments.push({
          type: "user",
          content: argument,
          user_id: "current-user",
          timestamp: userArgumentTimestamp, // Ensure this is always set
        });
      }

      // Add AI Opening Statement if present in the response
      if (response.ai_opening_statement && response.ai_opening_role) {
        const aiOpeningTimestamp = createOffsetTimestamp(1); // 1 second offset to appear after user argument
        if (response.ai_opening_role === "plaintiff") {
          updatedHistory.plaintiff_arguments.push({
            type: "opening",
            content: response.ai_opening_statement,
            user_id: null,
            timestamp: aiOpeningTimestamp,
          });
        } else if (response.ai_opening_role === "defendant") {
          updatedHistory.defendant_arguments.push({
            type: "opening",
            content: response.ai_opening_statement,
            user_id: null,
            timestamp: aiOpeningTimestamp,
          });
        }
      }

      // Add AI Counter-Argument if present in the response
      if (response.ai_counter_argument && response.ai_counter_role) {
        console.log("Counter-argument found in response:", {
          role: response.ai_counter_role,
          content: response.ai_counter_argument.substring(0, 100) + "...",
        });

        const aiCounterArgumentTimestamp = createOffsetTimestamp(2); // 2 second offset to appear after opening statement
        if (response.ai_counter_role === "plaintiff") {
          console.log("Adding plaintiff counter-argument to history");
          updatedHistory.plaintiff_arguments.push({
            type: "counter",
            content: response.ai_counter_argument,
            user_id: null,
            timestamp: aiCounterArgumentTimestamp, // Use consistent format
          });
        } else if (response.ai_counter_role === "defendant") {
          console.log("Adding defendant counter-argument to history");
          updatedHistory.defendant_arguments.push({
            type: "counter",
            content: response.ai_counter_argument,
            user_id: null,
            timestamp: aiCounterArgumentTimestamp, // Use consistent format
          });
        }
      } else {
        console.log("No counter-argument in response:", response);
      }

      // Update the state with the new history
      setCaseHistory(updatedHistory);

      setIsSubmitting(false);
      setArgument("");

      // Refresh rate limit info after successful submission
      fetchRateLimitInfo();

      // Check if closing statement button should be shown
      const totalUserArguments =
        updatedHistory.plaintiff_arguments.filter((arg) => arg.type === "user")
          .length +
        updatedHistory.defendant_arguments.filter((arg) => arg.type === "user")
          .length;

      setShowClosingButton(totalUserArguments >= 3);
    } catch (error) {
      console.error("Error submitting argument:", error);
      setError("Failed to submit argument. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyzeCase = async () => {
    console.log("🔍 handleAnalyzeCase called");
    console.log("📊 Current caseAnalysis state:", caseAnalysis);
    console.log("👁️ Current showAnalysis state:", showAnalysis);

    if (caseAnalysis) {
      console.log("✅ Case analysis already exists, showing dialog");
      setShowAnalysis(true);
      console.log("🔄 setShowAnalysis(true) called");
      return;
    }

    setIsLoading(true);
    try {
      const analysis = await caseAPI.analyzeCase(cnr);

      if (analysis) {
        // The analysis field contains the formatted markdown
        setCaseAnalysis(analysis.analysis || "");
      } else {
        console.log("No analysis in response");
      }

      setShowAnalysis(true);
    } catch (error: any) {
      console.error("Error fetching case analysis:", error);
      console.log("Error details:", {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      setError("Failed to load case analysis. Please try again.");
    } finally {
      setIsLoading(false);
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
      );

      // Update the UI with the closing statement and verdict
      const updatedHistory = { ...caseHistory! };
      const userTimestamp = createArgumentTimestamp();
      const aiTimestamp = createOffsetTimestamp(1); // 1 second after user's timestamp

      // Add user's closing statement
      if (currentRole === "plaintiff") {
        updatedHistory.plaintiff_arguments = [
          ...updatedHistory.plaintiff_arguments,
          {
            type: "closing",
            content: argument,
            user_id: "current-user",
            timestamp: userTimestamp,
          },
        ];
        // Add AI's closing statement for defendant if present
        if (response.ai_closing_statement) {
          updatedHistory.defendant_arguments = [
            ...updatedHistory.defendant_arguments,
            {
              type: "closing",
              content: response.ai_closing_statement,
              user_id: null,
              timestamp: aiTimestamp,
            },
          ];
        }
      } else {
        updatedHistory.defendant_arguments = [
          ...updatedHistory.defendant_arguments,
          {
            type: "closing",
            content: argument,
            user_id: "current-user",
            timestamp: userTimestamp,
          },
        ];
        // Add AI's closing statement for plaintiff if present
        if (response.ai_closing_statement) {
          updatedHistory.plaintiff_arguments = [
            ...updatedHistory.plaintiff_arguments,
            {
              type: "closing",
              content: response.ai_closing_statement,
              user_id: null,
              timestamp: aiTimestamp,
            },
          ];
        }
      }

      if (response.verdict) {
        updatedHistory.verdict = response.verdict;

        setTimeout(() => {
          setShowVerdict(true);
        }, 3000);

        // Call the case analysis endpoint
        try {
          await caseAPI.analyzeCase(cnr);
          console.log("Case analysis initiated successfully.");
        } catch (analysisError) {
          console.error("Failed to initiate case analysis:", analysisError);
        }
      }

      setCaseHistory(updatedHistory);
      setArgument("");
      setCounterArgument(null);
      setIsSubmitting(false);

      // Refresh case data to get updated status
      const updatedCase = await caseAPI.getCase(cnr);
      setCaseData(updatedCase);

      // Refresh rate limit information
      await fetchRateLimitInfo();
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
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading courtroom...</p>
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
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-zinc-950 pb-0">
      <Navigation />
      <main className="flex flex-col">
        <header className="bg-white dark:bg-zinc-900 shadow-sm py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">
              Courtroom
            </h1>
            <div className="flex items-center space-x-2">
              <Drawer open={showCaseDetails} onOpenChange={setShowCaseDetails}>
                <DrawerTrigger asChild>
                  <Button variant="outline">View Case Details</Button>
                </DrawerTrigger>
                <DrawerContent className="h-[80vh]">
                  <DrawerHeader className="pb-4 border-b">
                    <DrawerTitle>Case Details</DrawerTitle>
                  </DrawerHeader>
                  <ScrollArea className="h-[calc(100vh-10rem)]">
                    <div className="p-6">
                      <div className="mb-8">
                        <h2 className="text-xl font-semibold mb-4">
                          {caseData.title}
                        </h2>
                        <div className="flex flex-wrap gap-4 mb-4">
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            Case #{caseData.cnr}
                          </span>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                            Filed{" "}
                            {formatToLocaleDateString(caseData.created_at)}
                          </span>
                          {caseData.court && (
                            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                              {caseData.court}
                            </span>
                          )}
                        </div>

                        <div className="rounded-md shadow-md border border-gray-300">
                          {caseData.case_text ? (
                            <div className="p-6">
                              <MarkdownRenderer
                                markdown={caseData.case_text}
                                className="prose prose-lg max-w-none font-serif dark:prose-invert"
                              />
                            </div>
                          ) : (
                            <p className="text-gray-500 italic p-6">
                              No case details available.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </DrawerContent>
              </Drawer>
              {caseData?.status === CaseStatus.RESOLVED && (
                <Button
                  variant="secondary"
                  onClick={() => setShowVerdict(true)}
                >
                  View Verdict
                </Button>
              )}
              {caseData?.status === CaseStatus.RESOLVED && (
                <Button variant="secondary" onClick={handleAnalyzeCase}>
                  Analyze Case
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-6 p-2 md:p-8 max-w-7xl mx-auto w-full">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-4 flex items-center justify-between">
            <div className="bg-white dark:bg-zinc-900">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {caseData.title}
              </h2>
            </div>
            <div className="flex items-center space-x-6">
              {currentRole && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    currentRole === "plaintiff"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-purple-100 text-purple-800"
                  }`}
                >
                  {currentRole === "plaintiff"
                    ? "Plaintiff Lawyer"
                    : "Defendant Lawyer"}
                </span>
              )}
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
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Case #{caseData.cnr} • Filed{" "}
              {formatToLocaleDateString(caseData.created_at)}
            </div>
          </div>
        </div>
      </main>

      {/* Arguments display area - scrollable */}
      <div
        className={`flex-1 ${
          caseData.status === CaseStatus.RESOLVED ? "mb-6" : "mb-48"
        } bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 max-w-7xl mx-auto w-full `}
        style={{ height: "calc(100vh - 700px)" }}
      >
        {/* Chat messages */}
        <div className="h-full overflow-y-auto p-4">
          <div className="space-y-4">
            {allArguments.map((arg: any, index: number) => {
              const isPlaintiff = caseHistory.plaintiff_arguments.some(
                (pArg) =>
                  pArg.timestamp === arg.timestamp &&
                  pArg.content === arg.content
              );
              const role = isPlaintiff ? "plaintiff" : "defendant";
              const isUser =
                arg.user_id === "current-user" ||
                (arg.user_id && currentRole === role);

              // Create a unique key using timestamp and content hash
              const uniqueKey = `${arg.timestamp || index}-${
                arg.type
              }-${arg.content.substring(0, 20)}`;

              return (
                <div
                  key={uniqueKey} // Use unique key instead of index
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      isUser
                        ? "bg-blue-500 text-white"
                        : role === "plaintiff"
                        ? "bg-purple-200 text-gray-900"
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
                        <span className="text-xs text-gray-800 ml-2">
                          {formatToLocaleString(arg.timestamp)}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap">{arg.content}</p>
                  </div>
                </div>
              );
            })}
            {caseHistory?.verdict &&
              caseData?.status === CaseStatus.RESOLVED && (
                <div>
                  <Dialog
                    open={showVerdict && !!caseHistory?.verdict}
                    onOpenChange={setShowVerdict}
                  >
                    <DialogContent className="max-w-3xl max-h-[90vh] p-0">
                      <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle className="flex items-center justify-between">
                          Case Verdict
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="h-[calc(90vh-6rem)] p-6">
                        <MarkdownRenderer
                          markdown={caseHistory.verdict}
                          className="prose prose-lg max-w-none font-serif dark:prose-invert"
                        />
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={showAnalysis && !!caseAnalysis}
                    onOpenChange={setShowAnalysis}
                  >
                    <DialogContent className="max-w-3xl max-h-[90vh] p-0">
                      <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-1 h-8 bg-blue-500 rounded"></div>
                            <div className="max-w-md">
                              <h2 className="text-xl font-bold truncate">
                                Case Analysis
                              </h2>
                              <p className="text-sm text-gray-500 mt-1 truncate">
                                Case #{caseData.cnr} • {caseData.title}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Analysis Complete
                          </span>
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="max-h-[calc(90vh-12rem)]">
                        <div className="px-6 py-4">
                          <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 shadow-inner overflow-hidden">
                            <div className="p-6">
                              <MarkdownRenderer
                                markdown={caseAnalysis || ""}
                                className="prose prose-lg max-w-none font-serif prose-p:text-gray-900 dark:prose-p:text-gray-100 prose-headings:text-gray-900 dark:prose-headings:text-gray-100"
                              />
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                      <div className="px-6 py-4 border-t bg-gray-50 dark:bg-zinc-900">
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center">
                            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                            Analysis generated on{" "}
                            {formatToLocaleDateString(caseData.created_at)}
                          </div>
                          {caseData.court && (
                            <div className="flex items-center text-gray-500">
                              <span>{caseData.court}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            {caseHistory?.verdict &&
              caseData?.status === CaseStatus.RESOLVED && (
                <div>
                  <Dialog
                    open={showVerdict && !!caseHistory?.verdict}
                    onOpenChange={setShowVerdict}
                  >
                    <DialogContent className="max-w-3xl max-h-[90vh] p-0">
                      <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-1 h-8 bg-green-500 rounded"></div>
                            <div className="max-w-md">
                              <h2 className="text-xl font-bold truncate">
                                Final Verdict
                              </h2>
                              <p className="text-sm text-gray-500 mt-1 truncate">
                                Case #{caseData.cnr} • {caseData.title}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 px-3 py-1 rounded-full text-sm bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Verdict Passed
                          </span>
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="max-h-[calc(90vh-12rem)]">
                        <div className="px-6 py-4">
                          <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 shadow-inner overflow-hidden">
                            <div className="p-6">
                              <MarkdownRenderer
                                markdown={caseHistory?.verdict || ""}
                                className="prose prose-lg max-w-none font-serif prose-p:text-gray-900 dark:prose-p:text-gray-100 prose-headings:text-gray-900 dark:prose-headings:text-gray-100"
                              />
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                      <div className="px-6 py-4 border-t bg-gray-50 dark:bg-zinc-900">
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center">
                            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                            Verdict passed on{" "}
                            {formatToLocaleDateString(caseData.created_at)}
                          </div>
                          {caseData.court && (
                            <div className="flex items-center text-gray-500">
                              <span>{caseData.court}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <div ref={messagesEndRef} />
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Fixed input area at bottom */}
      {caseData.status !== CaseStatus.RESOLVED && (
        <div className="fixed bottom-0 left-0 right-0 mb-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-700 p-4 shadow-lg">
          <div className="max-w-7xl mx-auto">
            {/* Rate limit information */}
            {rateLimit && (
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg flex items-end space-x-2">
                <div className="w-full flex justify-between items-center">
                  <div>
                    <span className="text-s text-gray-700 dark:text-gray-300">
                      Daily argument limit:
                    </span>{" "}
                    <span
                      className={`${
                        rateLimit.remaining_attempts === 0
                          ? "text-red-600 font-medium"
                          : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {rateLimit.remaining_attempts} of {rateLimit.max_attempts}{" "}
                      remaining
                    </span>
                  </div>

                  {timeRemaining !== null && timeRemaining > 0 ? (
                    <div className="flex items-center justify-end">
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
                          {/* Format timeRemaining in HH:MM:SS */}
                          {`${Math.floor(timeRemaining / 3600)
                            .toString()
                            .padStart(2, "0")}:${Math.floor(
                            (timeRemaining % 3600) / 60
                          )
                            .toString()
                            .padStart(2, "0")}:${(timeRemaining % 60)
                            .toString()
                            .padStart(2, "0")}`}
                        </span>
                      </div>
                    </div>
                  ) : rateLimit.remaining_attempts === 0 ? (
                    <div className="flex justify-end">
                      <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                        Daily limit reached
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            <div className="flex items-start space-x-4 pt-3">
              <div className="flex-1">
                <SettingsAwareTextArea
                  value={argument}
                  onChange={setArgument}
                  onSubmit={handleSubmitArgument}
                  placeholder="Type your argument here... (Press Enter to submit, Shift+Enter for new line)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white resize-none"
                  minHeight={80}
                  maxHeight={120}
                  disabled={
                    isSubmitting ||
                    !caseData ||
                    caseData.status !== CaseStatus.ACTIVE
                  }
                />
              </div>

              {/* Vertically stacked buttons */}
              <div className="flex flex-col space-y-2 min-w-[140px]">
                <button
                  onClick={handleSubmitArgument}
                  disabled={
                    isSubmitting ||
                    !argument.trim() ||
                    (timeRemaining !== null && timeRemaining > 0)
                  }
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Closing"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
