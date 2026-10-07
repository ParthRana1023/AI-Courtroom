"use client";

import { AlertDialog } from "radix-ui";
import { buttonClass } from "./button";
import { cn } from "@/lib/utils";

export interface ConfirmCopy {
  kicker: string;
  count?: string;
  title: string;
  warn?: string;
  body: string;
  cta: string;
  /** "danger" = red confirm button, "ink" = dark, "green" = restore. */
  tone: "danger" | "ink" | "green";
}

/** Paper confirmation dialog: Escape or Cancel closes, the confirm button gets focus. */
export default function ConfirmDialog({
  copy,
  onConfirm,
  onClose,
}: {
  copy: ConfirmCopy | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog.Root open={!!copy} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-[var(--scrim)] [animation:ac-fade_.2s_ease_both]" />
        {copy && (
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[61] flex w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 bg-paper px-[26px] pb-[22px] pt-[26px] font-type text-ink shadow-dialog outline-none">
            <div className="flex justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 text-label font-bold uppercase tracking-[0.2em] text-ink-label">
              <span>{copy.kicker}</span>
              <span>{copy.count}</span>
            </div>
            <AlertDialog.Title className="m-0 font-display text-h2 font-normal leading-[1.15]">
              {copy.title}
            </AlertDialog.Title>
            {copy.warn && <span className="text-body font-bold text-seal">{copy.warn}</span>}
            <AlertDialog.Description className="m-0 text-pretty text-body leading-[1.55] text-ink-label">
              {copy.body}
            </AlertDialog.Description>
            <div className="flex flex-wrap justify-end gap-2.5 pt-1">
              <AlertDialog.Cancel className={buttonClass("paper", "md", "px-[18px]")}>Cancel</AlertDialog.Cancel>
              <AlertDialog.Action
                onClick={onConfirm}
                className={cn(
                  buttonClass("seal", "md", "px-5"),
                  copy.tone === "ink" && "bg-ink hover:bg-ink-label",
                  copy.tone === "green" && "bg-green hover:bg-[#245730]",
                )}
              >
                {copy.cta}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        )}
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
