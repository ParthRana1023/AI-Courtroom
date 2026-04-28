"use client";

import { FileText } from "lucide-react";
import type { EvidenceItem } from "@/types";
import { Badge } from "@/components/ui/badge";

interface EvidencePanelProps {
  evidence?: EvidenceItem[];
}

const sideLabel: Record<string, string> = {
  plaintiff: "Plaintiff",
  defendant: "Defendant",
  both: "Both sides",
  unknown: "Neutral",
};

export default function EvidencePanel({ evidence = [] }: EvidencePanelProps) {
  if (evidence.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
            <FileText className="h-6 w-6 text-gray-500 dark:text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            No evidence available
          </h3>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Evidence has not been prepared for this case yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {evidence.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{item.exhibit_ref}</Badge>
            <Badge variant="outline">{item.evidence_type}</Badge>
            <Badge
              className={
                item.supports_side === "plaintiff"
                  ? "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                  : item.supports_side === "defendant"
                    ? "border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                    : "border-transparent bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-300"
              }
            >
              {sideLabel[item.supports_side] ?? "Neutral"}
            </Badge>
          </div>

          <h3 className="text-lg font-semibold leading-snug text-gray-900 dark:text-white">
            {item.title}
          </h3>

          {item.source && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Source: {item.source}
            </p>
          )}

          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-gray-700 dark:text-gray-200">
            {item.description}
          </p>

          {item.relevance && (
            <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm text-gray-700 dark:bg-zinc-800 dark:text-gray-200">
              <span className="font-medium">Relevance:</span> {item.relevance}
            </div>
          )}

          {item.ipc_sections.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.ipc_sections.map((section) => (
                <Badge key={section} variant="outline">
                  {section}
                </Badge>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
