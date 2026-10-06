"use client";

import NoticeSheet from "@/components/court/notice-sheet";
import { buttonClass } from "@/components/court/button";

/** "Something went wrong" sheet (Something Went Wrong.dc.html), without page chrome. */
export function ErrorSheet() {
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  return (
    <NoticeSheet
      form={["Order of the court", "Proceedings interrupted"]}
      word="ERROR"
      stamp="MISTRIAL"
      title="Something went wrong"
      actions={
        <>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass("seal")}>
            Refresh page
          </button>
          <button type="button" onClick={goBack} className={buttonClass("paper")}>
            Go back
          </button>
        </>
      }
    >
      We’ve been notified and are working on a fix. Please try refreshing the page.
    </NoticeSheet>
  );
}
