"use client";

import { useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useSettings } from "@/contexts/settings-context";
import { clearLLMTrace, getLLMTrace, getServerLLMTrace, subscribeLLMTrace } from "@/lib/llm-trace";
import { cn } from "@/lib/utils";

const ATTEMPT_LABEL = ["primary", "fallback", "fallback 2"];
const TAG = "text-[10.5px] font-bold uppercase tracking-[0.16em]";

// Developer mode: a paper chip in the bottom-left corner that opens the list of AI models
// that answered recent requests. Developers only (server allowlist), with the setting on.
export default function DevModelPanel() {
  const { user } = useAuth();
  const { devMode } = useSettings();
  const [open, setOpen] = useState(false);
  const entries = useSyncExternalStore(subscribeLLMTrace, getLLMTrace, getServerLLMTrace);

  if (!devMode || !user?.is_developer) return null;

  const latest = entries[0]?.calls.at(-1);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Developer mode: AI models used"
        className="fixed bottom-4 left-4 z-60 flex max-w-[calc(100vw-2rem)] cursor-pointer items-center gap-2 border-[1.5px] border-ink bg-paper px-3 py-2 font-type text-xs text-ink shadow-toast hover:bg-[#f8f3e7]"
      >
        <span className={cn(TAG, "flex-none text-seal")}>AI</span>
        <span className="truncate font-data">{latest ? `${latest.task}: ${latest.model}` : "No AI calls yet"}</span>
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="AI models"
      className="fixed bottom-4 left-4 z-60 flex w-[min(26rem,calc(100vw-2rem))] flex-col bg-paper font-type text-xs text-ink shadow-dialog"
    >
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-ink py-2 pr-2 pl-3.5">
        <span className={cn(TAG, "text-ink-label")}>AI models · developer mode</span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={clearLLMTrace}
            className="h-8 cursor-pointer border-[1.5px] border-ink bg-transparent px-2.5 text-[10.5px] font-bold tracking-[0.14em] text-ink uppercase hover:bg-[#f8f3e7]"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Minimise"
            className="h-8 w-8 cursor-pointer border-0 bg-ink text-lg leading-none text-paper hover:bg-seal"
          >
            ×
          </button>
        </span>
      </div>
      <ul data-scroller="" className="m-0 max-h-80 list-none overflow-y-auto p-0">
        {entries.length === 0 && (
          <li className="px-3.5 py-4 text-center text-ink-hint italic">No AI calls yet. Responses that used a model appear here.</li>
        )}
        {entries.map((entry) => (
          <li key={entry.id} className="border-b border-ink/15 px-3.5 py-2.5">
            <div className="flex justify-between gap-2 text-ink-meta">
              <span className="truncate font-data">
                {entry.method} {entry.path}
              </span>
              <span className="flex-none font-data">
                {new Date(entry.at).toLocaleTimeString()} · {entry.status}
              </span>
            </div>
            {entry.calls.map((call, i) => (
              <div key={i} className="mt-1.5 flex items-center gap-2">
                <span className="w-16 flex-none font-bold">{call.task}</span>
                <span className="min-w-0 flex-1 truncate font-data">
                  {call.provider}:{call.model}
                </span>
                <span
                  className={cn(
                    "flex-none border-[1.5px] px-1.5 pt-px text-[9.5px] font-bold tracking-[0.12em] uppercase",
                    call.attempt === 0 ? "border-green text-green" : "border-amber-deep text-amber-deep",
                  )}
                >
                  {ATTEMPT_LABEL[call.attempt] ?? `attempt ${call.attempt}`}
                </span>
                <span className="w-11 flex-none text-right font-data text-ink-meta">{(call.ms / 1000).toFixed(1)}s</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
