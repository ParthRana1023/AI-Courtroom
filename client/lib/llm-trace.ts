// Developer mode: which AI model answered each API request.
// The server adds an X-LLM-Models header (JSON) for allowlisted developers;
// the axios interceptor in lib/api.ts passes every response here.

export const LLM_TRACE_HEADER = "x-llm-models";
const MAX_ENTRIES = 30;

export interface LLMCall {
  task: string;
  provider: string;
  model: string;
  attempt: number; // 0 = primary, 1 = fallback, 2 = second fallback
  ms: number;
}

export interface LLMTraceEntry {
  id: number;
  at: number; // epoch ms
  method: string;
  path: string;
  status: number;
  calls: LLMCall[];
}

let entries: LLMTraceEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function recordLLMTrace(
  headerValue: unknown,
  method: string | undefined,
  url: string | undefined,
  status: number,
) {
  if (typeof headerValue !== "string" || !headerValue) return;
  let calls: LLMCall[];
  try {
    calls = JSON.parse(headerValue);
  } catch {
    return;
  }
  if (!Array.isArray(calls) || calls.length === 0) return;
  entries = [
    {
      id: nextId++,
      at: Date.now(),
      method: (method ?? "get").toUpperCase(),
      path: (url ?? "").split("?")[0],
      status,
      calls,
    },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  listeners.forEach((listener) => listener());
}

export function clearLLMTrace() {
  entries = [];
  listeners.forEach((listener) => listener());
}

export function subscribeLLMTrace(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLLMTrace(): LLMTraceEntry[] {
  return entries;
}

const EMPTY: LLMTraceEntry[] = [];
export function getServerLLMTrace(): LLMTraceEntry[] {
  return EMPTY;
}
