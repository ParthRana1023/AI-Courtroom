"use client";

import { useState, useSyncExternalStore } from "react";
import { Cpu, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useSettings } from "@/contexts/settings-context";
import {
  clearLLMTrace,
  getLLMTrace,
  getServerLLMTrace,
  subscribeLLMTrace,
} from "@/lib/llm-trace";

const ATTEMPT_LABEL = ["primary", "fallback", "fallback 2"];

// Floating list of the AI models that answered recent requests.
// Shown only to developers (server allowlist) with developer mode on.
export default function DevModelPanel() {
  const { user } = useAuth();
  const { devMode } = useSettings();
  const [open, setOpen] = useState(false);
  const entries = useSyncExternalStore(
    subscribeLLMTrace,
    getLLMTrace,
    getServerLLMTrace,
  );

  if (!devMode || !user?.is_developer) return null;

  const latest = entries[0]?.calls.at(-1);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-60 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-zinc-300 bg-white/95 px-3 py-2 text-xs font-medium text-zinc-700 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200"
        title="Developer mode: AI models used"
      >
        <Cpu className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="truncate">
          {latest ? `${latest.task}: ${latest.model}` : "No AI calls yet"}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-60 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-zinc-300 bg-white/95 text-xs text-zinc-700 shadow-xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <span className="flex items-center gap-2 font-semibold">
          <Cpu className="h-4 w-4 text-blue-500" />
          AI models (developer mode)
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearLLMTrace}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Clear"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Minimise"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <ul className="max-h-80 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
        {entries.length === 0 && (
          <li className="px-3 py-4 text-center text-zinc-500">
            No AI calls yet. Responses that used a model appear here.
          </li>
        )}
        {entries.map((entry) => (
          <li key={entry.id} className="px-3 py-2">
            <div className="flex justify-between gap-2 text-zinc-500 dark:text-zinc-400">
              <span className="truncate font-mono">
                {entry.method} {entry.path}
              </span>
              <span className="shrink-0">
                {new Date(entry.at).toLocaleTimeString()} · {entry.status}
              </span>
            </div>
            {entry.calls.map((call, i) => (
              <div key={i} className="mt-1 flex items-center gap-2">
                <span className="w-16 shrink-0 font-medium">{call.task}</span>
                <span className="min-w-0 flex-1 truncate font-mono">
                  {call.provider}:{call.model}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                    call.attempt === 0
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}
                >
                  {ATTEMPT_LABEL[call.attempt] ?? `attempt ${call.attempt}`}
                </span>
                <span className="w-12 shrink-0 text-right text-zinc-500">
                  {(call.ms / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
