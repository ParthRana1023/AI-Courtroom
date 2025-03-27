"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { submitArgument } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: string
  role: "user" | "ai" | "judge"
  content: string
  timestamp: Date
}

interface ChatInterfaceProps {
  caseId: string
  role: "defendant" | "plaintiff"
  caseData: any
}

export function ChatInterface({ caseId, role, caseData }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize with a welcome message
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "ai",
        content: `Welcome to the ${role === "defendant" ? "Defendant" : "Plaintiff"} argument submission. Please provide your arguments based on the case details.`,
        timestamp: new Date(),
      },
    ])
  }, [role])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSubmitting) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsSubmitting(true)

    try {
      const response = await submitArgument(caseId, role, input)

      // Add AI response
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: response.isVerdict ? "judge" : "ai",
        content: response.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])

      // Check if this is the final verdict
      if (response.isVerdict || response.isComplete) {
        setIsComplete(true)
      }
    } catch (error) {
      console.error("Error submitting argument:", error)

      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "ai",
        content: "There was an error processing your argument. Please try again.",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-[70vh] border rounded-md">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("flex gap-3 max-w-[80%]", message.role === "user" && "flex-row-reverse")}>
              <Avatar className={cn("h-8 w-8", message.role === "judge" && "bg-yellow-100")}>
                <AvatarFallback>
                  {message.role === "user" ? "U" : message.role === "judge" ? "J" : role === "defendant" ? "P" : "D"}
                </AvatarFallback>
              </Avatar>
              <Card
                className={cn(
                  "p-3",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.role === "judge"
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-muted",
                )}
              >
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                <div className="text-xs mt-1 opacity-70">{message.timestamp.toLocaleTimeString()}</div>
              </Card>
            </div>
          </div>
        ))}
        {isSubmitting && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[80%]">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{role === "defendant" ? "P" : "D"}</AvatarFallback>
              </Avatar>
              <Card className="p-3 bg-muted">
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm">Generating response...</span>
                </div>
              </Card>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isComplete ? "Argument phase complete" : "Type your argument..."}
            className="flex-1 resize-none"
            disabled={isSubmitting || isComplete}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isSubmitting || isComplete}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Send</span>
          </Button>
        </form>
        {isComplete && (
          <p className="text-sm text-muted-foreground mt-2 text-center">
            This argument phase is complete. The final verdict has been rendered.
          </p>
        )}
      </div>
    </div>
  )
}

