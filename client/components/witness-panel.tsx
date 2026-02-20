"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { witnessAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLogger } from "@/lib/logger";
import type {
  WitnessInfo,
  CurrentWitnessResponse,
  ExaminationItem,
  WitnessExaminationResponse,
} from "@/types";

const logger = getLogger("courtroom");

type ExaminationState =
  | "user_questioning"
  | "ai_cross_examining"
  | "ai_examining_first"
  | "awaiting_user_choice"
  | "awaiting_user_cross";

interface AICrossExaminationItem {
  question: string;
  answer: string;
  question_number: number;
}

interface WitnessPanelProps {
  cnr: string;
  isActive: boolean;
  userRole: string;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  onWitnessUpdate?: () => void;
}

export default function WitnessPanel({
  cnr,
  isActive,
  userRole,
  externalOpen,
  onExternalOpenChange,
  onWitnessUpdate,
}: WitnessPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Use external open state if provided, otherwise internal
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (onExternalOpenChange) {
      onExternalOpenChange(open);
    }
    setInternalOpen(open);
  };
  const [witnesses, setWitnesses] = useState<WitnessInfo[]>([]);
  const [currentWitness, setCurrentWitness] =
    useState<CurrentWitnessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExamining, setIsExamining] = useState(false);
  const [isCrossExamining, setIsCrossExamining] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [examinationState, setExaminationState] =
    useState<ExaminationState>("user_questioning");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null); // Kept if needed, but unused for autoscroll now
  const isCrossExaminingRef = useRef(isCrossExamining);

  useEffect(() => {
    isCrossExaminingRef.current = isCrossExamining;
  }, [isCrossExamining]);

  // Auto-scroll to bottom when examination history updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentWitness?.examination_history]);

  // Fetch available witnesses and current witness state
  // Fetch available witnesses and current witness state
  const fetchWitnessState = useCallback(async () => {
    if (!isActive) return;

    try {
      // Don't show full loading state during polling updates to avoid flicker
      if (!isCrossExaminingRef.current) {
        setIsLoading(true);
      }

      const [witnessesData, currentData] = await Promise.all([
        witnessAPI.getAvailableWitnesses(cnr),
        witnessAPI.getCurrentWitness(cnr),
      ]);
      setWitnesses(witnessesData.witnesses || []);
      setCurrentWitness(currentData);

      // Determine examination state based on who called the witness
      if (currentData?.has_witness) {
        const aiCalled = currentData.called_by !== userRole;

        if (currentData.is_ai_examining) {
          // AI is actively examining
          if (aiCalled && examinationState !== "ai_cross_examining") {
            setExaminationState("ai_examining_first");
          } else {
            setExaminationState("ai_cross_examining");
          }
          setIsCrossExamining(true);
        } else {
          if (isCrossExaminingRef.current) {
            // Just finished examining
            if (examinationState === "ai_examining_first") {
              // AI was examining first (AI-called witness) -> user can cross-examine
              setExaminationState("awaiting_user_cross");
            } else {
              // AI was cross-examining (user-called witness) -> user choice
              setExaminationState("awaiting_user_choice");
            }
            setIsCrossExamining(false);
          } else {
            // Preserve specific states unless clearly reset
            setExaminationState((prev) => {
              if (
                prev === "awaiting_user_choice" ||
                prev === "awaiting_user_cross"
              ) {
                return prev;
              }
              // If AI called and no examination yet, start AI examining
              if (
                aiCalled &&
                (currentData.examination_history?.length ?? 0) === 0
              ) {
                return "ai_examining_first";
              }
              return "user_questioning";
            });
            setIsCrossExamining(false);
          }
        }
      }
    } catch (err) {
      logger.error("Failed to fetch witness state", err as Error);
      setError("Failed to load witnesses");
    } finally {
      setIsLoading(false);
    }
  }, [cnr, isActive]);

  useEffect(() => {
    if (isOpen && isActive) {
      fetchWitnessState();
    }
  }, [isOpen, isActive, fetchWitnessState]);

  // Poll for updates during AI cross-examination
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCrossExamining && isActive && isOpen) {
      interval = setInterval(fetchWitnessState, 2000);
    }
    return () => clearInterval(interval);
  }, [isCrossExamining, isActive, isOpen, fetchWitnessState]);

  const handleCallWitness = async (witnessId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await witnessAPI.callWitness(cnr, witnessId);
      await fetchWitnessState();
      setExaminationState("user_questioning");
      onWitnessUpdate?.();
      logger.info("Witness called successfully");
    } catch (err: any) {
      logger.error("Failed to call witness", err);
      setError(err.response?.data?.detail || "Failed to call witness");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExamineWitness = async () => {
    if (!question.trim()) return;

    try {
      setIsExamining(true);
      setError(null);
      const response: WitnessExaminationResponse =
        await witnessAPI.examineWitness(cnr, question);

      // Update current witness with new examination item
      if (currentWitness) {
        const newItem: ExaminationItem = {
          id: response.examination_id,
          examiner: userRole,
          question: response.question,
          answer: response.answer,
          timestamp: response.timestamp,
        };
        setCurrentWitness({
          ...currentWitness,
          examination_history: [...currentWitness.examination_history, newItem],
        });
      }

      setQuestion("");
      inputRef.current?.focus();
    } catch (err: any) {
      logger.error("Failed to examine witness", err);
      setError(err.response?.data?.detail || "Failed to examine witness");
    } finally {
      setIsExamining(false);
    }
  };

  const handleNoMoreQuestions = async () => {
    // User is done asking questions, trigger AI cross-examination
    try {
      setIsCrossExamining(true);
      setExaminationState("ai_cross_examining");
      setError(null);

      // Trigger background task (returns immediately)
      await witnessAPI.aiCrossExamine(cnr);
      // Polling effect will handle updates and state transition
    } catch (err: any) {
      logger.error("Failed to get AI cross-examination", err);
      setError(
        err.response?.data?.detail || "Failed to get AI cross-examination",
      );
      // Revert to user questioning on error
      setExaminationState("user_questioning");
      setIsCrossExamining(false);
    }
  };

  const handleAskMoreQuestions = () => {
    // User wants to continue asking questions
    setExaminationState("user_questioning");
    inputRef.current?.focus();
  };

  const handleNoFurtherQuestions = async () => {
    // User is completely done, dismiss the witness
    try {
      setIsLoading(true);
      setError(null);
      const response = await witnessAPI.concludeWitness(cnr);

      // Reset state
      setCurrentWitness(null);
      setExaminationState("user_questioning");
      await fetchWitnessState();
      onWitnessUpdate?.();

      logger.info("Witness concluded", { message: response.message });
    } catch (err: any) {
      logger.error("Failed to conclude witness", err);
      setError(
        err.response?.data?.detail || "Failed to conclude witness examination",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isActive) {
    return null;
  }

  const hasWitnessOnStand = currentWitness?.has_witness;

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <Button
          variant={hasWitnessOnStand ? "default" : "outline"}
          size="sm"
          className={hasWitnessOnStand ? "bg-amber-600 hover:bg-amber-700" : ""}
        >
          {hasWitnessOnStand
            ? `📢 ${currentWitness?.witness_name}`
            : "Call Witness"}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="h-[85vh] flex flex-col">
        <DrawerHeader className="border-b">
          <DrawerTitle>
            {hasWitnessOnStand
              ? `Examining: ${currentWitness?.witness_name}`
              : "Call a Witness"}
          </DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            {!hasWitnessOnStand ? (
              /* Witness Selection */
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Select a party to call as a witness:
                </p>
                {isLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading witnesses...
                  </div>
                ) : witnesses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No parties available
                  </div>
                ) : (
                  witnesses.map((witness) => (
                    <div
                      key={witness.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {witness.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {witness.role === "applicant"
                            ? "Applicant"
                            : "Non-Applicant"}
                          {witness.has_testified && " • Previously testified"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleCallWitness(witness.id)}
                        disabled={isLoading}
                      >
                        Call
                      </Button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Active Witness Examination */
              <div className="space-y-4">
                {/* Witness Info */}
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">👤</span>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {currentWitness?.witness_name}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {currentWitness?.witness_role === "applicant"
                          ? "Applicant"
                          : "Non-Applicant"}
                        {" • Called by "}
                        {currentWitness?.called_by}
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI Examining Status */}
                {(examinationState === "ai_cross_examining" ||
                  examinationState === "ai_examining_first") &&
                  isCrossExamining && (
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full"></div>
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          {examinationState === "ai_examining_first"
                            ? "Opposition lawyer is examining the witness..."
                            : "Opposition lawyer is cross-examining the witness..."}
                        </p>
                      </div>
                    </div>
                  )}

                {/* Examination History */}
                <div className="space-y-3">
                  {currentWitness?.examination_history.map((item, index) => (
                    <div key={item.id || index} className="space-y-2">
                      {/* Question */}
                      <div
                        className={`flex ${
                          item.examiner === userRole
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] p-3 rounded-lg border-l-4 ${
                            item.examiner === userRole
                              ? "bg-blue-100 dark:bg-blue-900/20 border-blue-600"
                              : "bg-purple-100 dark:bg-purple-900/20 border-purple-600"
                          }`}
                        >
                          <p
                            className={`text-xs font-medium mb-1 ${
                              item.examiner === userRole
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-purple-600 dark:text-purple-400"
                            }`}
                          >
                            {item.examiner === userRole ? "You" : "AI Lawyer"}{" "}
                            asked:
                          </p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {item.question}
                          </p>
                        </div>
                      </div>

                      {/* Answer - Witness response with amber border and italic */}
                      <div className="flex justify-start">
                        <div className="max-w-[85%] p-3 bg-gray-100 dark:bg-zinc-800 rounded-lg border-l-4 border-amber-500">
                          <p className="text-xs font-medium mb-1 text-amber-600 dark:text-amber-400">
                            {currentWitness?.witness_name} responded:
                          </p>
                          <p className="text-sm text-gray-900 dark:text-white italic">
                            "{item.answer}"
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {hasWitnessOnStand && (
          <div className="p-4 border-t bg-white dark:bg-zinc-900 mt-auto">
            {/* Question Input - Only during user_questioning state */}
            {examinationState === "user_questioning" && (
              <div className="flex gap-2 items-start">
                <textarea
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask the witness a question..."
                  className="flex-1 p-3 border rounded-lg resize-none bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-24"
                  rows={1}
                  disabled={isExamining}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleExamineWitness();
                    }
                  }}
                />
                <div className="flex flex-col gap-2 shrink-0 w-40">
                  <Button
                    onClick={handleExamineWitness}
                    disabled={!question.trim() || isExamining}
                    className="w-full"
                  >
                    {isExamining ? "Asking..." : "Ask Question"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleNoMoreQuestions}
                    disabled={isExamining || isCrossExamining}
                    className="w-full border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20 text-xs h-9"
                  >
                    No More Questions
                  </Button>
                </div>
              </div>
            )}

            {/* User Choice after AI Cross-Examination (user-called witness) */}
            {examinationState === "awaiting_user_choice" && (
              <div className="space-y-3">
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  The opposition lawyer has finished their cross-examination.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAskMoreQuestions}
                    variant="outline"
                    className="flex-1"
                  >
                    Ask More Questions
                  </Button>
                  <Button
                    onClick={handleNoFurtherQuestions}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={isLoading}
                  >
                    {isLoading ? "Dismissing..." : "No Further Questions"}
                  </Button>
                </div>
              </div>
            )}

            {/* User Choice after AI Examination First (AI-called witness) */}
            {examinationState === "awaiting_user_cross" && (
              <div className="space-y-3">
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  The opposition lawyer has finished examining the witness.
                  Would you like to cross-examine?
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAskMoreQuestions}
                    variant="outline"
                    className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                  >
                    Cross-Examine
                  </Button>
                  <Button
                    onClick={handleNoFurtherQuestions}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={isLoading}
                  >
                    {isLoading ? "Dismissing..." : "No Questions — Dismiss"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
