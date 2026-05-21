"use client";

import {
  FileText,
  ImageIcon,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EvidenceItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EvidencePanelProps {
  evidence?: EvidenceItem[];
  onRegenerateImage?: (evidenceId: string) => void | Promise<void>;
  regeneratingEvidenceId?: string | null;
}

export default function EvidencePanel({
  evidence = [],
  onRegenerateImage,
  regeneratingEvidenceId,
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
            <div className="flex h-52 items-center justify-center bg-amber-50 p-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex flex-col items-center gap-3 text-center text-sm">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4" />
                  Image generation failed
                </div>
                {onRegenerateImage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-amber-300 bg-white/80 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-950/40 dark:text-amber-200 dark:hover:bg-amber-950"
                    disabled={regeneratingEvidenceId === item.id}
                    onClick={() => onRegenerateImage(item.id)}
                  >
                    {regeneratingEvidenceId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Regenerate
                  </Button>
                )}
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
