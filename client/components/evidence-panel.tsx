"use client";

import { FileText } from "lucide-react";
import type { EvidenceItem } from "@/types";
import { Badge } from "@/components/ui/badge";

interface EvidencePanelProps {
  evidence?: EvidenceItem[];
}

export default function EvidencePanel({ evidence = [] }: EvidencePanelProps) {
  if (evidence.length === 0) {
    return (
      <div className="flex min-h-70 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
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
        </article>
      ))}
    </div>
  );
}
