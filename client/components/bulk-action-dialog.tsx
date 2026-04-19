"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BulkActionDialogProps {
  triggerIcon: React.ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  isDisabled?: boolean;
  title: string;
  warningMessage?: string;
  description: string;
  actionLabel: string;
  actionClassName?: string;
  onConfirm: () => void;
}

export function BulkActionDialog({
  triggerIcon,
  triggerLabel,
  triggerClassName = "bg-blue-600 hover:bg-blue-700 text-white",
  isDisabled = false,
  title,
  warningMessage,
  description,
  actionLabel,
  actionClassName = "bg-blue-600 hover:bg-blue-700 text-white",
  onConfirm,
}: BulkActionDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          disabled={isDisabled}
          className={`px-3 py-1.5 text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors ${triggerClassName}`}
        >
          {triggerIcon}
          {triggerLabel}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {warningMessage && (
            <AlertDialogDescription className="text-red-600 font-medium">
              {warningMessage}
            </AlertDialogDescription>
          )}
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={actionClassName}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
