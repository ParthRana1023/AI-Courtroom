"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { use } from "react";
import { caseAPI, argumentAPI, witnessAPI } from "@/lib/api";
import WitnessPanel from "@/components/witness-panel";
import { argumentRateLimitAPI, RateLimitInfo } from "@/lib/rateLimitAPI";
import {
  type Case,
  CaseStatus,
  Roles,
  CourtroomProceedingsEventType,
  type CourtroomProceedingsEvent,
} from "@/types";
import { formatToLocaleDateString, formatToLocaleString } from "@/lib/datetime";
import SettingsAwareTextArea, {
  SettingsAwareTextAreaRef,
} from "@/components/settings-aware-textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownRenderer from "@/components/markdown-renderer";
import ChatMarkdownRenderer from "@/components/chat-markdown-renderer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import GavelLoader from "@/components/gavel-loader";
import {
  useRenderLogger,
  useLifecycleLogger,
} from "@/hooks/use-performance-logger";
import { getLogger } from "@/lib/logger";
import { getErrorDetail } from "@/lib/error-utils";

const logger = getLogger("courtroom");

function countUserArguments(proceedings?: CourtroomProceedingsEvent[]): number {
  return (
    proceedings?.filter(
      (event) => event.type === CourtroomProceedingsEventType.ARGUMENT,
    ).length ?? 0
  );
}

function hasPlaintiffOpening(
  proceedings?: CourtroomProceedingsEvent[],
): boolean {
  return Boolean(
    proceedings?.some(
      (event) =>
        event.type === CourtroomProceedingsEventType.OPENING_STATEMENT &&
        event.speaker_role === Roles.PLAINTIFF,
    ),
  );
}

export default function Courtroom({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  // IMPORTANT: use() must be called first to maintain consistent hook order
  const { cnr } = use(params);

  // Performance monitoring
  useRenderLogger("Courtroom", 50); // Warn if render takes > 50ms (complex component)
  useLifecycleLogger("Courtroom");

  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRole = searchParams.get("role") || "";

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [argument, setArgument] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentRole, setCurrentRole] = useState<Roles>(
    (urlRole as Roles) || Roles.PLAINTIFF,
  );
  const [showClosingButton, setShowClosingButton] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showVerdict, setShowVerdict] = useState(false);
  const [showCaseDetails, setShowCaseDetails] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [caseAnalysis, setCaseAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [refreshWitnessPanel, setRefreshWitnessPanel] = useState(0);

  const [aiWitnessAlert, setAiWitnessAlert] = useState<{
    isOpen: boolean;
    witnessName: string;
    message: string;
  }>({
    isOpen: false,
    witnessName: "",
    message: "",
  });

  // Controlled state for witness drawer (used when AI calls a witness)
  const [witnessDrawerOpen, setWitnessDrawerOpen] = useState(false);

  // Session popup states
  const [showSessionPopup, setShowSessionPopup] = useState(false);
  const [showAdjournedPopup, setShowAdjournedPopup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const argumentTextareaRef = useRef<SettingsAwareTextAreaRef>(null);
  const previousCaseStatusRef = useRef<CaseStatus | null>(null);

  const timelineEvents = useMemo<CourtroomProceedingsEvent[]>(
    () => caseData?.courtroom_proceedings ?? [],
    [caseData?.courtroom_proceedings],
  );

  // Auto-scroll to bottom when timeline events change (e.g., AI responds)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [timelineEvents]);

  // Fetch rate limit information and update countdown timer
  const fetchRateLimitInfo = useCallback(async () => {
    try {
      const limitInfo = await argumentRateLimitAPI.getArgumentRateLimit();

      setRateLimit(limitInfo);

      if (limitInfo.seconds_until_next) {
        setTimeRemaining(Math.ceil(limitInfo.seconds_until_next));
      } else {
        setTimeRemaining(null);
      }
    } catch (error) {
      logger.error("Error fetching rate limit info", error as Error);
    }
  }, []);

  const fetchCaseDetails = useCallback(
    async (isPolling = false) => {
      try {
        if (!isPolling) {
          // DEV DELAY - Remove in production
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const data = await caseAPI.getCase(cnr);
        setCaseData(data);

        setShowClosingButton(
          countUserArguments(data.courtroom_proceedings) >= 3,
        );

        // Role detection (skip if polling to avoid UI flickering/resets)
        if (!isPolling) {
          if (
            data.user_role &&
            data.user_role !== Roles.NOT_STARTED &&
            data.user_role !== "not_started"
          ) {
            setCurrentRole(data.user_role as Roles);
          } else if (urlRole && urlRole !== Roles.NOT_STARTED) {
            setCurrentRole(urlRole as Roles);
          } else {
            setCurrentRole(Roles.PLAINTIFF);
          }

          if (data.status === CaseStatus.NOT_STARTED && urlRole) {
            setCurrentRole(urlRole as Roles);
          }
        }

        await fetchRateLimitInfo();
      } catch (error) {
        if (!isPolling) {
          setError("Failed to load case details. Please try again later.");
        }
        logger.error("Error fetching case details", error as Error);
      } finally {
        if (!isPolling) {
          setIsLoading(false);
        }
      }
    },
    [cnr, urlRole, fetchRateLimitInfo],
  );

  useEffect(() => {
    fetchCaseDetails();
  }, [fetchCaseDetails]);

  // Polling for AI updates
  useEffect(() => {
    if (caseData?.is_ai_examining) {
      const interval = setInterval(() => {
        fetchCaseDetails(true);
      }, 1500); // Poll every 1.5s
      return () => clearInterval(interval);
    }
  }, [caseData?.is_ai_examining, fetchCaseDetails]);

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
  }, [timeRemaining, fetchRateLimitInfo]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [timelineEvents]);

  // Show "Court in Session" popup only when entering or resuming an active session.
  useEffect(() => {
    const currentStatus = caseData?.status ?? null;

    if (!currentStatus || isLoading) {
      return;
    }

    const previousStatus = previousCaseStatusRef.current;

    if (
      currentStatus === CaseStatus.ACTIVE &&
      previousStatus !== CaseStatus.ACTIVE
    ) {
      setShowSessionPopup(true);
      const timer = setTimeout(() => {
        setShowSessionPopup(false);
      }, 3000);
      previousCaseStatusRef.current = currentStatus;
      return () => clearTimeout(timer);
    }

    previousCaseStatusRef.current = currentStatus;
  }, [caseData?.status, isLoading]);

  // Calculate user arguments submitted THIS SESSION (not total)
  // session_args_at_start is set when status becomes ACTIVE
  const sessionUserArguments = useMemo(() => {
    if (!caseData) return 0;
    const totalUserArgs = countUserArguments(caseData.courtroom_proceedings);
    // Subtract the count when session started to get session-specific count
    const sessionStart = caseData.session_args_at_start || 0;
    return Math.max(0, totalUserArgs - sessionStart);
  }, [caseData]);

  // Handle ending the court session
  const handleEndSession = async () => {
    if (sessionUserArguments < 2) {
      return; // Can't end session with less than 2 arguments
    }

    try {
      // Update case status to adjourned (paused) - can resume later
      await caseAPI.updateCaseStatus(cnr, CaseStatus.ADJOURNED);

      // Show adjourned popup
      setShowAdjournedPopup(true);
      setTimeout(() => {
        setShowAdjournedPopup(false);
        // Refresh case data
        window.location.reload();
      }, 3000);
    } catch (error) {
      logger.error("Error ending session", error as Error);
    }
  };

  // Poll for courtroom proceedings updates to catch plaintiff opening statement
  // This is especially important when user selects defendant role
  useEffect(() => {
    // Only set up polling if we have case data and the case is active
    if (!caseData || caseData.status !== CaseStatus.ACTIVE) return;

    // Check if user is defendant and there is no plaintiff opening yet
    const isDefendantWithNoPlaintiffArgs =
      currentRole === Roles.DEFENDANT &&
      !hasPlaintiffOpening(caseData.courtroom_proceedings);

    // If we're in this state, poll for updates
    if (isDefendantWithNoPlaintiffArgs) {
      logger.debug("Setting up polling for plaintiff opening statement");

      const pollInterval = setInterval(async () => {
        try {
          logger.debug("Polling for courtroom proceedings updates");
          const updatedCase = await caseAPI.getCase(cnr);

          if (hasPlaintiffOpening(updatedCase.courtroom_proceedings)) {
            logger.debug(
              "Found plaintiff opening statement, updating case data",
            );
            setCaseData(updatedCase);
            clearInterval(pollInterval); // Stop polling once we find the opening statement
          }
        } catch (pollError) {
          logger.error(
            "Error polling courtroom proceedings",
            pollError as Error,
          );
        }
      }, 2000); // Poll every 2 seconds

      return () => {
        logger.debug("Cleaning up polling interval");
        clearInterval(pollInterval);
      };
    }
  }, [caseData, currentRole, cnr]);

  const handleSubmitArgument = async () => {
    if (!argument.trim()) return;

    setIsSubmitting(true);
    try {
      await argumentAPI.submitArgument(
        cnr,
        currentRole.toLowerCase() as "plaintiff" | "defendant",
        argument,
      );

      const updatedCase = await caseAPI.getCase(cnr);
      setCaseData(updatedCase);

      setIsSubmitting(false);
      setArgument("");

      // Auto-focus the textarea for next input
      setTimeout(() => argumentTextareaRef.current?.focus(), 100);

      // Refresh rate limit info after successful submission
      fetchRateLimitInfo();

      setShowClosingButton(
        countUserArguments(updatedCase.courtroom_proceedings) >= 3,
      );

      // Check if AI wants to call a witness (only if no witness is currently on stand)
      // We do this after the argument flow is updated
      setTimeout(async () => {
        try {
          const currentWitness = await witnessAPI.getCurrentWitness(cnr);
          if (!currentWitness.has_witness) {
            const witnessCall = await witnessAPI.aiCallWitness(cnr);
            if (witnessCall.should_call) {
              // Show popup alert to user
              setAiWitnessAlert({
                isOpen: true,
                witnessName: witnessCall.witness_name,
                message: witnessCall.message,
              });
              // Auto-dismiss popup after 4s and open the witness drawer
              setTimeout(() => {
                setAiWitnessAlert((prev) => ({ ...prev, isOpen: false }));
                setWitnessDrawerOpen(true);
                setRefreshWitnessPanel((p) => p + 1);
              }, 4000);
            }
          }
        } catch (err) {
          logger.error("Failed to check for AI witness call", err as Error);
        }
      }, 2000); // Small delay to let the user read the argument first
    } catch (error) {
      logger.error("Error submitting argument", error as Error);
      setError("Failed to submit argument. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyzeCase = async () => {
    logger.debug("Analyze case requested", {
      hasCaseAnalysis: Boolean(caseAnalysis),
      showAnalysis,
    });

    if (caseAnalysis) {
      logger.debug("Case analysis already exists, showing dialog");
      setShowAnalysis(true);
      return;
    }

    setIsLoading(true);
    try {
      const analysis = await caseAPI.analyzeCase(cnr);

      if (analysis) {
        // The analysis field contains the formatted markdown
        setCaseAnalysis(analysis.analysis || "");
      } else {
        logger.debug("No analysis in response");
      }

      setShowAnalysis(true);
    } catch (error: unknown) {
      logger.error("Error fetching case analysis", error as Error);
      setAnalysisError(
        getErrorDetail(error) ||
          "Failed to load case analysis. Please try again.",
      );
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
        argument,
      );

      if (response.verdict) {
        setTimeout(() => {
          setShowVerdict(true);
        }, 3000);

        // Call the case analysis endpoint
        try {
          await caseAPI.analyzeCase(cnr);
          logger.debug("Case analysis initiated successfully");
        } catch (analysisErr: unknown) {
          logger.error(
            "Failed to initiate case analysis",
            analysisErr as Error,
          );
          setAnalysisError(
            getErrorDetail(analysisErr) || "Failed to generate case analysis.",
          );
        }
      }

      setArgument("");
      setIsSubmitting(false);

      // Auto-focus the textarea for next input
      setTimeout(() => argumentTextareaRef.current?.focus(), 100);

      // Refresh case data to get updated status
      const updatedCase = await caseAPI.getCase(cnr);
      setCaseData(updatedCase);

      // Refresh rate limit information
      await fetchRateLimitInfo();
    } catch (error: unknown) {
      logger.error("Error submitting closing statement", error as Error);
      const detail = getErrorDetail(error);
      if (detail) {
        setError(detail);
      } else {
        setError("Failed to submit closing statement. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <GavelLoader message="Loading courtroom..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center">
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
        <div className="flex-1 flex items-center justify-center">
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
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden pb-0">
      <header className="shrink-0 mt-2 sm:mt-4 max-w-7xl mx-auto w-full px-2 sm:px-0">
        <div className="bg-white dark:bg-zinc-900 shadow-sm py-4 rounded-lg border border-gray-200 dark:border-zinc-700">
          <div className="px-3 sm:px-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Left side - Case info */}
              <div className="flex flex-col gap-2">
                <h1 className="text-base sm:text-xl md:text-2xl font-bold leading-tight text-gray-900 dark:text-white line-clamp-2">
                  {caseData.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  {currentRole && (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        currentRole === "plaintiff"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                          : "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                      }`}
                    >
                      {currentRole === "plaintiff"
                        ? "Plaintiff Lawyer"
                        : "Defendant Lawyer"}
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      caseData.status === CaseStatus.ACTIVE
                        ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                        : caseData.status === CaseStatus.RESOLVED
                          ? "bg-gray-100 text-gray-800 dark:bg-zinc-700 dark:text-gray-300"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                    }`}
                  >
                    {caseData.status}
                  </span>
                  <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
                    Case #{caseData.cnr} • Filed{" "}
                    {formatToLocaleDateString(caseData.created_at)}
                  </span>
                  <span className="sm:hidden text-xs text-gray-500 dark:text-gray-400">
                    #{caseData.cnr}
                  </span>
                </div>
              </div>

              {/* Right side - Action buttons */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* Witness Panel */}
                <WitnessPanel
                  key={refreshWitnessPanel}
                  cnr={cnr}
                  isActive={caseData?.status === CaseStatus.ACTIVE}
                  userRole={currentRole}
                  externalOpen={witnessDrawerOpen}
                  onExternalOpenChange={setWitnessDrawerOpen}
                  onWitnessUpdate={() => {
                    // Optional: Reload case data if needed
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/dashboard/cases/${cnr}/parties`)}
                >
                  View Parties
                </Button>

                <Drawer
                  open={showCaseDetails}
                  onOpenChange={setShowCaseDetails}
                >
                  <DrawerTrigger asChild>
                    <Button variant="outline" size="sm">
                      View Case Details
                    </Button>
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
                {caseData?.status === CaseStatus.ACTIVE && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleEndSession}
                    disabled={sessionUserArguments < 2}
                    title={
                      sessionUserArguments < 2
                        ? `Submit at least ${
                            2 - sessionUserArguments
                          } more argument(s) this session before ending`
                        : "End court session"
                    }
                  >
                    End Session
                  </Button>
                )}
                {caseData?.status === CaseStatus.RESOLVED && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowVerdict(true)}
                  >
                    View Verdict
                  </Button>
                )}
                {caseData?.status === CaseStatus.RESOLVED && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAnalyzeCase}
                  >
                    Analyze Case
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {analysisError && (
        <div className="max-w-7xl mx-auto w-full px-4 py-4 mt-4">
          <Alert
            variant="destructive"
            className="relative bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800"
          >
            <button
              onClick={() => setAnalysisError(null)}
              className="absolute top-3 right-3 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
              aria-label="Dismiss"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div className="flex items-start gap-3 pr-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <AlertTitle className="text-red-800 dark:text-red-300 font-semibold">
                  Analysis Failed
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400 text-sm mt-1">
                  Unable to generate case analysis. Please try again later.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        </div>
      )}

      {/* Arguments display area - scrollable */}
      <div
        className={`flex-1 min-h-0 mt-2 sm:mt-4 ${
          caseData.status === CaseStatus.RESOLVED ? "mb-6" : "mb-1 sm:mb-2"
        } bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 max-w-7xl w-full mx-2 sm:mx-auto`}
      >
        {/* Chat messages */}
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {timelineEvents.map((event, index: number) => {
              // System Messages (Witness Called/Dismissed)
              if (
                event.type === CourtroomProceedingsEventType.WITNESS_CALLED ||
                event.type ===
                  CourtroomProceedingsEventType.WITNESS_DISMISSED ||
                event.type === CourtroomProceedingsEventType.SYSTEM_MESSAGE
              ) {
                return (
                  <div
                    key={`${event.timestamp}-${index}`}
                    className="flex justify-center my-4"
                  >
                    <div className="bg-gray-100 dark:bg-zinc-700 px-4 py-2 rounded-full text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-600 shadow-sm">
                      <span className="font-semibold mr-1">
                        {event.type ===
                        CourtroomProceedingsEventType.WITNESS_CALLED
                          ? "🏛️ Witness Stand:"
                          : event.type ===
                              CourtroomProceedingsEventType.WITNESS_DISMISSED
                            ? "⚖️ Court Order:"
                            : "ℹ️ Info:"}
                      </span>
                      {event.content}
                    </div>
                  </div>
                );
              }

              // Witness Question (Examiner)
              if (
                event.type === CourtroomProceedingsEventType.WITNESS_EXAMINED_Q
              ) {
                // Examiner is usually on the side of their role
                const isExaminerUserSide = event.speaker_role === currentRole;
                return (
                  <div
                    key={`${event.timestamp}-${index}`}
                    className={`flex ${
                      isExaminerUserSide ? "justify-end" : "justify-start"
                    } mb-2`}
                  >
                    <div
                      className={`max-w-[90%] sm:max-w-[75%] rounded-lg p-2.5 sm:p-3 border-l-4 shadow-sm ${
                        isExaminerUserSide
                          ? "bg-blue-50 dark:bg-blue-900/10 border-blue-600"
                          : "bg-purple-50 dark:bg-purple-900/10 border-purple-600"
                      }`}
                    >
                      <div
                        className={`text-xs font-bold mb-1 ${
                          isExaminerUserSide
                            ? "text-blue-600"
                            : "text-purple-600"
                        }`}
                      >
                        {event.speaker_name} (Examiner)
                      </div>
                      <div className="text-sm font-medium italic text-gray-800 dark:text-gray-200">
                        "{event.content}"
                      </div>
                    </div>
                  </div>
                );
              }

              // Witness Answer
              if (
                event.type === CourtroomProceedingsEventType.WITNESS_EXAMINED_A
              ) {
                return (
                  <div
                    key={`${event.timestamp}-${index}`}
                    className="flex justify-center mb-4"
                  >
                    <div className="max-w-[95%] sm:max-w-[85%] rounded-lg p-3 sm:p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 shadow-sm relative">
                      <div className="absolute -top-3 left-4 bg-amber-100 dark:bg-amber-900/80 px-2 py-0.5 rounded text-[10px] font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wide">
                        Witness Testimony
                      </div>
                      <div className="text-xs font-bold mb-1 text-amber-700 dark:text-amber-400 mt-1">
                        {event.speaker_name}
                      </div>
                      <div className="text-gray-900 dark:text-gray-100">
                        <ChatMarkdownRenderer markdown={event.content} />
                      </div>
                    </div>
                  </div>
                );
              }

              // Regular Arguments / Opening / Closing
              const isUserArg = event.speaker_role === currentRole;

              return (
                <div
                  key={`${event.timestamp}-${index}`}
                  className={`flex ${
                    isUserArg ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[75%] rounded-lg p-2.5 sm:p-3 border-l-4 shadow-sm ${
                      isUserArg
                        ? "bg-blue-100 dark:bg-blue-900/20 border-blue-600"
                        : "bg-purple-100 dark:bg-purple-900/20 border-purple-600"
                    }`}
                  >
                    <div
                      className={`text-xs font-medium mb-1 flex justify-between ${
                        isUserArg
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-purple-600 dark:text-purple-400"
                      }`}
                    >
                      <span>
                        {event.speaker_name}
                        {event.type ===
                          CourtroomProceedingsEventType.OPENING_STATEMENT && (
                          <span className="ml-1 font-bold">(Opening)</span>
                        )}
                        {event.type ===
                          CourtroomProceedingsEventType.AI_ARGUMENT && (
                          <span className="ml-1 opacity-75">(AI)</span>
                        )}
                      </span>
                      {event.timestamp && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          {formatToLocaleString(event.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-900 dark:text-gray-100">
                      <ChatMarkdownRenderer markdown={event.content} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
            {caseData.verdict && caseData?.status === CaseStatus.RESOLVED && (
              <div>
                <Dialog
                  open={showVerdict && !!caseData.verdict}
                  onOpenChange={setShowVerdict}
                >
                  <DialogContent className="max-w-3xl max-h-[90vh] p-0">
                    <DialogHeader className="px-6 py-4 border-b">
                      <DialogTitle className="flex items-center justify-between">
                        Case Verdict
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        Final verdict for case {caseData.cnr}.
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[calc(90vh-6rem)] p-6">
                      <MarkdownRenderer
                        markdown={caseData.verdict}
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
                      <DialogDescription className="sr-only">
                        Detailed analysis for case {caseData.cnr}.
                      </DialogDescription>
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
            {caseData.verdict && caseData?.status === CaseStatus.RESOLVED && (
              <div>
                <Dialog
                  open={showVerdict && !!caseData.verdict}
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
                      <DialogDescription className="sr-only">
                        Final verdict details for case {caseData.cnr}.
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[calc(90vh-12rem)]">
                      <div className="px-6 py-4">
                        <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 shadow-inner overflow-hidden">
                          <div className="p-6">
                            <MarkdownRenderer
                              markdown={caseData.verdict || ""}
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
        </ScrollArea>
      </div>

      {/* Fixed input area at bottom */}
      {caseData.status !== CaseStatus.RESOLVED && (
        <div className="shrink-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-700 p-2.5 sm:p-4 shadow-lg w-full">
          <div className="max-w-7xl mx-auto">
            {/* Rate limit information */}
            {rateLimit && (
              <div className="p-2 sm:p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg">
                <div className="w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
                  <div>
                    <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
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
                        <span className="hidden sm:inline">
                          Next submission in:{" "}
                        </span>
                        <span className="sm:hidden">Next in: </span>
                        <span className="ml-1 bg-orange-100 text-orange-800 px-2 py-1 rounded font-mono">
                          {/* Format timeRemaining in HH:MM:SS */}
                          {`${Math.floor(timeRemaining / 3600)
                            .toString()
                            .padStart(2, "0")}:${Math.floor(
                            (timeRemaining % 3600) / 60,
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
            <div className="flex flex-col sm:flex-row sm:items-start sm:space-x-4 pt-2 sm:pt-3 gap-2 sm:gap-0">
              <div className="flex-1">
                <SettingsAwareTextArea
                  ref={argumentTextareaRef}
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
              <div className="flex flex-row sm:flex-col gap-2 sm:space-y-2 sm:gap-0 sm:min-w-[140px]">
                <button
                  onClick={handleSubmitArgument}
                  disabled={
                    isSubmitting ||
                    !argument.trim() ||
                    (timeRemaining !== null && timeRemaining > 0)
                  }
                  className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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
                    className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Closing"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Witness Call Popup */}
      {aiWitnessAlert.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setAiWitnessAlert((prev) => ({ ...prev, isOpen: false }));
            setWitnessDrawerOpen(true);
            setRefreshWitnessPanel((p) => p + 1);
          }}
        >
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
              <span className="text-3xl">⚖️</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Witness Called
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-1">
              {aiWitnessAlert.message}
            </p>
            <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mt-3">
              The opposition lawyer will now question the witness.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              Click to continue or wait...
            </p>
          </div>
        </div>
      )}

      {/* Court in Session Popup */}
      {showSessionPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Court is in Session
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              The proceedings have begun. Present your arguments wisely.
            </p>
          </div>
        </div>
      )}

      {/* Court Adjourned Popup */}
      {showAdjournedPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Court is Adjourned
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              The court is adjourned for the day. Thank you for your
              participation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
