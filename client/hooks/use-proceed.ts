"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";
import { caseAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import { CaseStatus, type Case } from "@/types";

/**
 * The "Proceed to Courtroom" button on Case Prep and the settlement desk: opens the hearing
 * (the AI plaintiff's opening first when the user defends), or returns to it once it has begun.
 */
export function useProceed(cnr: string, kase: Case | null) {
  const router = useRouter();
  const online = useOnline();
  const [starting, setStarting] = useState(false);
  const role = kase?.user_role === "defendant" ? "defendant" : "plaintiff";
  const session = kase?.status === CaseStatus.ACTIVE ? "in session" : kase?.status === CaseStatus.RESOLVED ? "resolved" : "prep";

  const proceed = async () => {
    if (starting || !kase) return;
    if (session !== "prep") {
      router.push(`/cases/${cnr}/courtroom`);
      return;
    }
    if (!online) {
      toast("You’re offline. The courtroom opens when you’re back online.", { duration: 2800 });
      return;
    }
    setStarting(true);
    try {
      if (role === "defendant") await caseAPI.generatePlaintiffOpening(cnr);
      await caseAPI.updateCaseStatus(cnr, CaseStatus.ACTIVE);
      router.push(`/cases/${cnr}/courtroom`);
    } catch (e) {
      setStarting(false);
      toast.error(getErrorDetail(e) || "Couldn’t open the courtroom. Please try again.");
    }
  };

  const label = starting
    ? role === "defendant"
      ? "Preparing the opening statement…"
      : "Preparing courtroom…"
    : session === "resolved"
      ? "View Courtroom →"
      : session === "in session"
        ? "Return to Courtroom →"
        : "Proceed to Courtroom →";

  return { proceed, starting, label, off: starting || (!online && session === "prep") };
}
