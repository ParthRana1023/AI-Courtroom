"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { caseAPI, partiesAPI } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  type PersonInvolved,
  type ChatMessage,
  type PartiesListResponse,
  PersonRole,
  CaseStatus,
} from "@/types";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownRenderer from "@/components/markdown-renderer";
import ChatMarkdownRenderer from "@/components/chat-markdown-renderer";
import { formatToLocaleString } from "@/lib/datetime";
import GavelLoader from "@/components/gavel-loader";
import {
  useRenderLogger,
  useLifecycleLogger,
} from "@/hooks/use-performance-logger";
import { getLogger } from "@/lib/logger";

const logger = getLogger("cases");

// Helper function to strip markdown formatting from text (for plain text display)
const stripMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
    .replace(/\*(.*?)\*/g, "$1") // Italic
    .replace(/__(.*?)__/g, "$1") // Bold alt
    .replace(/_(.*?)_/g, "$1") // Italic alt
    .replace(/~~(.*?)~~/g, "$1") // Strikethrough
    .replace(/`(.*?)`/g, "$1") // Inline code
    .trim();
};

export default function PartiesPage({
  params,
}: {
  params: Promise<{ cnr: string }>;
}) {
  useRenderLogger("PartiesPage", 32);
  useLifecycleLogger("PartiesPage");

  const { cnr } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [parties, setParties] = useState<PersonInvolved[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  const [canAccessCourtroom, setCanAccessCourtroom] = useState(false);
  const [isInCourtroomSession, setIsInCourtroomSession] = useState(false);
  const [caseStatus, setCaseStatus] = useState<string>("not_started");
  const [selectedPerson, setSelectedPerson] = useState<PersonInvolved | null>(
    null
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingPerson, setIsLoadingPerson] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch parties on mount
  useEffect(() => {
    const fetchParties = async () => {
      try {
        // DEV DELAY - Remove in production
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const data: PartiesListResponse = await partiesAPI.getParties(cnr);
        setParties(data.parties);
        setUserRole(data.user_role);
        setCanAccessCourtroom(data.can_access_courtroom);
        setIsInCourtroomSession(data.is_in_courtroom);
        setCaseStatus(data.case_status || "not_started");
      } catch (error) {
        setError("Failed to load parties. Please try again later.");
        logger.error("Failed to fetch parties", error as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchParties();
  }, [cnr]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const handleSelectPerson = async (person: PersonInvolved) => {
    setIsLoadingPerson(true);
    setSelectedPerson(person);
    setShowChat(true);

    try {
      // Fetch person details (this also generates bio if not present)
      const details = await partiesAPI.getPartyDetails(cnr, person.id);
      setSelectedPerson(details);

      // Fetch chat history
      const history = await partiesAPI.getPartyChatHistory(cnr, person.id);
      setChatMessages(history.messages || []);
    } catch (error) {
      logger.error("Failed to fetch party details", error as Error);
      setError("Failed to load party details");
    } finally {
      setIsLoadingPerson(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedPerson || isSending) return;

    setIsSending(true);
    try {
      const response = await partiesAPI.chatWithParty(
        cnr,
        selectedPerson.id,
        newMessage
      );

      // Add both messages to chat
      setChatMessages((prev) => [
        ...prev,
        response.user_message,
        response.party_response,
      ]);
      setNewMessage("");

      // Auto-focus the input for next message
      setTimeout(() => chatInputRef.current?.focus(), 100);
    } catch (error) {
      logger.error("Failed to send message", error as Error);
      setError("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <GavelLoader message="Loading parties details..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 mt-4 max-w-7xl mx-auto w-full px-4 pb-8">
        {/* Header */}
        <div className="bg-white dark:bg-zinc-900 shadow-sm py-4 px-6 rounded-lg border border-gray-200 dark:border-zinc-700 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Parties Involved
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Case #{cnr} • You are the{" "}
                <span className="font-medium capitalize">{userRole}</span>{" "}
                Lawyer
              </p>
            </div>
            <Button
              onClick={async () => {
                try {
                  // Only set status to ACTIVE if case is NOT resolved
                  if (caseStatus !== "resolved") {
                    await caseAPI.updateCaseStatus(cnr, CaseStatus.ACTIVE);
                  }
                  router.push(`/dashboard/cases/${cnr}/courtroom`);
                } catch (error) {
                  logger.error(
                    "Failed to start courtroom session",
                    error as Error
                  );
                  setError(
                    "Failed to start courtroom session. Please try again."
                  );
                }
              }}
            >
              {caseStatus === "resolved"
                ? "View Courtroom"
                : "Proceed to Courtroom"}
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-700 dark:text-red-400">{error}</p>
            <button
              onClick={() => setError("")}
              className="text-sm text-red-600 dark:text-red-300 underline mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Info Banner - Only show during courtroom session */}
        {isInCourtroomSession && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
            <p className="text-amber-700 dark:text-amber-300 text-sm">
              <strong>⚠️ Courtroom in Session:</strong> You cannot chat with
              parties during an active courtroom session. Please complete or
              adjourn your case in the courtroom to resume chatting.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/cases/${cnr}/courtroom`)}
              >
                Return to Courtroom
              </Button>
            </div>
          </div>
        )}
        {/* Left/Right Layout */}
        {parties.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
            <p className="text-gray-500 dark:text-gray-400">
              No parties found in this case.
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Generate a new case to see parties involved.
            </p>
          </div>
        ) : (
          <div className="flex gap-6 h-[calc(100vh-200px)]">
            {/* Left Sidebar - Parties List */}
            <div className="w-80 shrink-0">
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 h-full overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    Parties Involved
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Select a person to view details
                  </p>
                </div>
                <ScrollArea className="h-[calc(100%-60px)]">
                  <div className="p-2 space-y-2">
                    {parties.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => {
                          setSelectedPerson(person);
                          // Fetch person details if not already loaded
                          if (!person.bio) {
                            setIsLoadingPerson(true);
                            partiesAPI
                              .getPartyDetails(cnr, person.id)
                              .then((details) => {
                                setSelectedPerson(details);
                                setIsLoadingPerson(false);
                              })
                              .catch(() => setIsLoadingPerson(false));
                          }
                        }}
                        title={
                          !person.can_chat
                            ? `As a ${userRole} lawyer, you can only chat with ${
                                userRole === "plaintiff"
                                  ? "Applicants"
                                  : "Non-Applicants"
                              }`
                            : undefined
                        }
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          selectedPerson?.id === person.id
                            ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                            : "hover:bg-gray-50 dark:hover:bg-zinc-800"
                        } ${
                          !person.can_chat
                            ? "opacity-60 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 dark:text-white text-sm truncate flex-1 min-w-0">
                            {stripMarkdown(person.name)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                              person.role === PersonRole.APPLICANT
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                : "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                            }`}
                          >
                            {person.role === PersonRole.APPLICANT ? "A" : "NA"}
                          </span>
                        </div>
                        {person.occupation && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate w-full">
                            {person.occupation}
                          </p>
                        )}
                        {/* Only show "Not your client" when NOT in courtroom session and can't chat */}
                        {!person.can_chat && !isInCourtroomSession && (
                          <p className="text-xs text-orange-500 dark:text-orange-400 mt-1">
                            Not your client
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Right Panel - Person Details */}
            <div className="flex-1 bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
              {selectedPerson ? (
                <div className="h-full flex flex-col">
                  {/* Person Header */}
                  <div className="p-6 border-b border-gray-200 dark:border-zinc-700">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {stripMarkdown(selectedPerson.name)}
                          </h2>
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                              selectedPerson.role === PersonRole.APPLICANT
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                            }`}
                          >
                            {selectedPerson.role === PersonRole.APPLICANT
                              ? "Applicant"
                              : "Non-Applicant"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {selectedPerson.occupation && (
                            <span>📋 {selectedPerson.occupation}</span>
                          )}
                          {selectedPerson.age && (
                            <span>🎂 {selectedPerson.age} years old</span>
                          )}
                          {selectedPerson.address && (
                            <span>📍 {selectedPerson.address}</span>
                          )}
                        </div>
                      </div>
                      {/* Show Chat button if can chat, or View Chat History if in session but is user's client */}
                      {selectedPerson.can_chat ? (
                        <Button
                          onClick={() => handleSelectPerson(selectedPerson)}
                        >
                          💬 Chat
                        </Button>
                      ) : (
                        /* Show read-only chat access when in courtroom session for user's clients */
                        isInCourtroomSession &&
                        ((userRole === "plaintiff" &&
                          selectedPerson.role === PersonRole.APPLICANT) ||
                          (userRole === "defendant" &&
                            selectedPerson.role ===
                              PersonRole.NON_APPLICANT)) && (
                          <Button
                            variant="outline"
                            onClick={() => handleSelectPerson(selectedPerson)}
                          >
                            👁️ View Chat History
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Person Bio/Background */}
                  <ScrollArea className="flex-1 p-6">
                    {isLoadingPerson ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Loading details...
                          </p>
                        </div>
                      </div>
                    ) : selectedPerson.bio ? (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Background & Story
                        </h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <MarkdownRenderer markdown={selectedPerson.bio} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        <p>No background information available yet.</p>
                        <p className="text-sm mt-1">
                          Click Chat to start a conversation!
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-gray-400 dark:text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <p className="font-medium">Select a person</p>
                    <p className="text-sm mt-1">
                      Choose someone from the list to view their details
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Chat Drawer - Outside main, slides up from bottom with snap points */}
      <Drawer open={showChat} onOpenChange={setShowChat}>
        <DrawerContent size="panel" className="flex flex-col">
          <DrawerHeader className="border-b dark:border-zinc-700 shrink-0">
            <DrawerTitle>
              Chat with {stripMarkdown(selectedPerson?.name || "Person")}
            </DrawerTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selectedPerson?.role === PersonRole.APPLICANT
                ? "Applicant"
                : "Non-Applicant"}
              {selectedPerson?.occupation && ` • ${selectedPerson.occupation}`}
            </p>
          </DrawerHeader>

          {/* Chat Messages - takes remaining space minus input */}
          <ScrollArea className="flex-1 p-4 min-h-0">
            {isLoadingPerson ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <p>No messages yet.</p>
                <p className="text-sm mt-1">
                  Start a conversation with{" "}
                  {stripMarkdown(selectedPerson?.name || "them")}!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages
                  .filter((msg) => msg && msg.sender)
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.sender === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg p-3 ${
                          msg.sender === "user"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        <div className="text-xs font-medium mb-1 opacity-80">
                          {msg.sender === "user"
                            ? "You"
                            : stripMarkdown(selectedPerson?.name || "Person")}
                        </div>
                        <ChatMarkdownRenderer markdown={msg.content} />
                        {msg.timestamp && (
                          <div className="text-xs mt-1 opacity-60">
                            {formatToLocaleString(msg.timestamp)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Message Input - always at bottom, hidden in read-only mode */}
          <div className="border-t dark:border-zinc-700 p-4 bg-white dark:bg-zinc-900 shrink-0">
            {caseStatus === "resolved" ? (
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                <p>📋 Read-only mode - Case has been resolved</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This case has concluded. You can view the chat history but
                  cannot send new messages.
                </p>
              </div>
            ) : isInCourtroomSession ? (
              <div className="text-center text-sm text-amber-600 dark:text-amber-400">
                <p>📋 Read-only mode - Courtroom is in session</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Return to courtroom or wait for session to end to send new
                  messages
                </p>
              </div>
            ) : (
              <div className="flex gap-2">
                <textarea
                  ref={chatInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={`Ask ${stripMarkdown(
                    selectedPerson?.name?.split(" ")[0] || "them"
                  )} about the case...`}
                  className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  rows={1}
                  disabled={isSending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isSending}
                  className="self-end"
                >
                  {isSending ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                      Sending
                    </span>
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
