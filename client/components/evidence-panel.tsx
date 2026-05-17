"use client";

import { FileText, ImageIcon, Loader2, Trash2, TriangleAlert } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EvidenceItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EvidencePanelProps {
  evidence?: EvidenceItem[];
  onDelete?: (evidenceId: string) => void | Promise<void>;
  deletingEvidenceId?: string | null;
}

export default function EvidencePanel({
  evidence = [],
  onDelete,
  deletingEvidenceId,
}: EvidencePanelProps) {
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
          className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={`${item.exhibit_ref} ${item.title}`}
              className="h-52 w-full object-cover"
            />
          ) : item.media_status === "pending" ? (
            <div className="flex h-52 items-center justify-center bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing exhibit image
              </div>
            </div>
          ) : item.media_status === "failed" ? (
            <div className="flex h-52 items-center justify-center bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2 text-sm">
                <TriangleAlert className="h-4 w-4" />
                Image generation failed
              </div>
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center bg-gray-50 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}

          <div className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{item.exhibit_ref}</Badge>
              <Badge variant="outline">{item.evidence_type}</Badge>
              {item.media_status !== "not_requested" && (
                <Badge
                  variant={
                    item.media_status === "generated" ? "default" : "secondary"
                  }
                >
                  {item.media_status.replace("_", " ")}
                </Badge>
              )}
              {onDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                  disabled={deletingEvidenceId === item.id}
                  onClick={() => onDelete(item.id)}
                  aria-label={`Delete ${item.title}`}
                >
                  {deletingEvidenceId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            <h3 className="text-lg font-semibold leading-snug text-gray-900 dark:text-white">
              {item.title}
            </h3>

            {item.source && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Source: {item.source}
              </p>
            )}

            <div className="prose prose-sm mt-4 max-w-none text-gray-700 dark:prose-invert dark:text-gray-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.description}
              </ReactMarkdown>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
