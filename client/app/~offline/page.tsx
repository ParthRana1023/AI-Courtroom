"use client";

import Link from "next/link";
import { useState } from "react";
import DeskPage from "@/components/chrome/desk-page";
import NoticeSheet from "@/components/court/notice-sheet";
import { buttonClass } from "@/components/court/button";

export default function OfflinePage() {
  const [checking, setChecking] = useState(false);

  const retry = () => {
    setChecking(true);
    window.setTimeout(() => {
      if (navigator.onLine) window.location.reload();
      else setChecking(false);
    }, 700);
  };

  return (
    <DeskPage>
      <NoticeSheet
        form={["Notice of recess", "No connection"]}
        word="RECESS"
        stamp="ADJOURNED"
        title="You’re offline"
        actions={
          <>
            <button type="button" onClick={retry} className={buttonClass("seal")}>
              {checking ? "Checking…" : "Try again"}
            </button>
            <Link href="/" className={buttonClass("paper")}>
              Back to Home
            </Link>
          </>
        }
      >
        The court is in recess until your connection returns. Check your Wi-Fi or mobile data, then
        try again.
      </NoticeSheet>
    </DeskPage>
  );
}
