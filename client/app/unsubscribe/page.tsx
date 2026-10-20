"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import DeskPage from "@/components/chrome/desk-page";
import NoticeSheet from "@/components/court/notice-sheet";
import { buttonClass } from "@/components/court/button";
import { notificationsAPI, type UnsubscribeState } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";

type View = { k: "loading" } | { k: "ask"; s: UnsubscribeState } | { k: "done"; s: UnsubscribeState } | { k: "bad"; why: string };

const BAD = "This unsubscribe link is invalid or has expired. You can change your emails in Settings.";

/**
 * The page behind "Unsubscribe" in optional emails. Opening it changes nothing (mail
 * scanners follow links); the button does. Mail apps' one-click button calls the API.
 */
export default function UnsubscribePage() {
  const token = useSearchParams().get("token") ?? "";
  const [view, setView] = useState<View>(token ? { k: "loading" } : { k: "bad", why: BAD });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    notificationsAPI
      .status(token)
      .then((s) => live && setView(s.subscribed ? { k: "ask", s } : { k: "done", s }))
      .catch((e) => live && setView({ k: "bad", why: getErrorDetail(e) ?? BAD }));
    return () => {
      live = false;
    };
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      setView({ k: "done", s: await notificationsAPI.unsubscribe(token) });
    } catch (e) {
      setView({ k: "bad", why: getErrorDetail(e) ?? BAD });
    } finally {
      setBusy(false);
    }
  };

  const settings = (
    <Link href="/settings#notify" className={buttonClass("paper")}>
      Email settings
    </Link>
  );

  return (
    <DeskPage>
      {view.k === "ask" ? (
        <NoticeSheet
          form={["Notice", "Correspondence"]}
          word="MAIL"
          stamp="ON FILE"
          title={`Stop “${view.s.label}” emails?`}
          actions={
            <>
              <button type="button" onClick={confirm} disabled={busy} className={buttonClass("seal")}>
                {busy ? "Unsubscribing…" : "Unsubscribe"}
              </button>
              {settings}
            </>
          }
        >
          You’ll stop getting “{view.s.label}” emails. Other emails, and security alerts, carry on.
        </NoticeSheet>
      ) : view.k === "done" ? (
        <NoticeSheet form={["Notice", "Correspondence"]} word="MAIL" stamp="STRUCK OFF" title="You’re unsubscribed" actions={settings}>
          You won’t get “{view.s.label}” emails any more. You can turn them back on in Settings.
        </NoticeSheet>
      ) : view.k === "bad" ? (
        <NoticeSheet form={["Notice", "Correspondence"]} word="MAIL" stamp="RETURNED" title="This link doesn’t work" actions={settings}>
          {view.why}
        </NoticeSheet>
      ) : (
        <NoticeSheet form={["Notice", "Correspondence"]} word="MAIL" stamp="ON FILE" title="Checking your link…" actions={null}>
          <span role="status">One moment.</span>
        </NoticeSheet>
      )}
    </DeskPage>
  );
}
