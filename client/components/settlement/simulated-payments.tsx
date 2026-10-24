"use client";

import { useState } from "react";
import { DEFAULT_COPY, inr, longDate } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import type { PaymentStage, Settlement, SettlementPayment, SettlementProfile } from "@/types";

const TAG = "border-[1.5px] px-1.75 pt-0.5 pb-px text-[10px] font-bold tracking-[0.16em] whitespace-nowrap uppercase";
const BTN = "h-11 cursor-pointer self-start border-0 px-4 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase";
const BOX = "flex flex-col gap-2 border-[1.5px] px-4 py-3.5";
const KICK = "text-[10.5px] font-bold tracking-[0.18em] uppercase";
const BODY = "text-[13.5px] leading-[1.55] text-pretty text-[#2a2018]";

const PAY: Record<SettlementPayment["status"], [string, string]> = {
  paid: ["Paid", "#3f6b3a"],
  late: ["Paid late", "#7a4a0c"],
  due: ["Due today", "#7a4a0c"],
  upcoming: ["Upcoming", "#6b5d4b"],
  missed: ["In notice", "#8e1f19"],
  defaulted: ["Defaulted", "#8e1f19"],
  held: ["Held up", "#6b5d4b"],
};
const short = (iso: string) => longDate(iso).replace(/ (\w{3})\w* /, " $1 ");
/** Today where the court sits, as the server counts days. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** The payments under a simulated order: the accused pays on their own, an instalment a day, and a
 * missed one gets notice. Past that, what the complainants did about it and what the court ordered. */
export default function SimulatedPayments({
  attempt,
  profile,
  userDefends,
  interest,
  busy,
  onFile,
  onHear,
  onNextDay,
}: {
  attempt: Settlement;
  profile: SettlementProfile;
  userDefends: boolean; // the user's client is the accused, who pays
  interest: boolean; // the last instalment carries interest
  busy: "file" | "hear" | "day" | null;
  onFile: () => void;
  onHear: (submission: string) => void;
  onNextDay?: () => void; // developer mode
}) {
  const [said, setSaid] = useState("");
  const route = profile.route === "none" ? "quash" : profile.route;
  const copy = DEFAULT_COPY[route];
  const pays = attempt.payments;
  const stage: PaymentStage = attempt.stage ?? "paying";
  const now = today();
  const day = Math.min(pays.filter((p) => p.due <= now).length, pays.length);
  const who = userDefends ? "Your client" : profile.accused;
  const e = attempt.enforcement ?? null;
  const unpaid = e ? pays[e.instalment] : pays.find((p) => p.status === "defaulted" || p.status === "missed");
  const missedAt = unpaid ? pays.indexOf(unpaid) + 1 : 0;
  const hearNow = !!e?.listed_for && !e.hearing && e.listed_for <= now;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className={cn(KICK, "whitespace-nowrap text-ink-meta")}>
          {stage === "closed" ? "Paid in full" : `Day ${day} of ${pays.length}`}
        </span>
        <span className="text-right text-[11.5px] leading-snug text-ink-muted">Simulated: an instalment falls due each day</span>
      </div>

      <ol className="m-0 flex list-none flex-col border-t border-ink/15 p-0">
        {pays.map((p, i) => {
          const [label, c] = PAY[p.status];
          return (
            <li
              key={`${p.due}-${i}`}
              className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-1 border-b border-ink/15 py-2.5"
            >
              <span className="font-data text-xs font-medium text-seal">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-data text-sm font-medium">
                  {inr(p.amount)}
                  {interest && i === pays.length - 1 && <span className="text-ink-meta"> incl. interest</span>}
                </span>
                <span className="text-[12.5px] leading-[1.4] text-ink-muted">
                  {p.paid_on
                    ? p.paid_on === p.due
                      ? `Paid on the day, ${short(p.paid_on)}`
                      : `Paid ${short(p.paid_on)} · due ${short(p.due)}`
                    : p.notice_until
                      ? `Missed ${short(p.due)} · notice until ${short(p.notice_until)}`
                      : `Due ${short(p.due)}`}
                </span>
              </span>
              <span className={TAG} style={{ borderColor: c, color: c }}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {stage === "paying" && (
        <p className="m-0 text-[12.5px] leading-normal text-pretty text-ink-meta">
          {who} pays each instalment on its due date. A missed one gets notice under the deed; only a default left unpaid after it can go
          further.
        </p>
      )}

      {stage === "notice" && unpaid && (
        <div role="status" className={cn(BOX, "border-amber bg-[rgba(233,163,58,.1)]")}>
          <strong className={cn(KICK, "text-amber")}>Instalment {missedAt} missed</strong>
          <span className={BODY}>
            {who} didn’t pay {inr(unpaid.amount)} due on {longDate(unpaid.due)}. Notice has gone out under the deed: it must be paid by{" "}
            {unpaid.notice_until ? longDate(unpaid.notice_until) : "the end of the notice"}. Paid by then, nothing more comes of it.
          </span>
        </div>
      )}

      {stage === "defaulted" && unpaid && (
        <div role="status" className={cn(BOX, "border-seal bg-[rgba(142,31,25,.06)]")}>
          <strong className={cn(KICK, "text-seal")}>Instalment {missedAt} unpaid after notice</strong>
          <span className={BODY}>
            {who} didn’t pay {inr(unpaid.amount)}, even after notice. {userDefends ? copy.you : copy.them}
          </span>
          {!userDefends && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={onFile}
              className={cn(BTN, "bg-seal hover:bg-seal-hover disabled:cursor-wait")}
            >
              {busy === "file" ? "Filing…" : copy.file}
            </button>
          )}
        </div>
      )}

      {stage === "enforcement" && e && (
        <div role="status" className={cn(BOX, "border-seal bg-[rgba(142,31,25,.06)]")}>
          <strong className={cn(KICK, "text-seal")}>
            {copy.kind} · {e.hearing ? copy.orders[e.hearing.outcome] : `listed ${e.listed_for ? short(e.listed_for) : ""}`}
          </strong>
          {!e.hearing && (
            <span className={BODY}>
              {userDefends ? copy.you : `You filed it on ${longDate(e.filed_on)}.`} The court hears it on{" "}
              {e.listed_for ? longDate(e.listed_for) : "the day listed"}.
            </span>
          )}
          {hearNow && (
            <>
              <label htmlFor="sp-said" className={cn(KICK, "text-ink-meta")}>
                Your submission to the court
              </label>
              <textarea
                id="sp-said"
                value={said}
                onChange={(ev) => setSaid(ev.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={
                  userDefends
                    ? "Why the instalment went unpaid, and how your client will pay…"
                    : "Why the breach is wilful, and what the court should direct…"
                }
                className="min-h-24 w-full resize-y border-[1.5px] border-ink/40 bg-paper px-3 py-2 text-sm leading-normal text-ink outline-none focus:border-ink"
              />
              <button
                type="button"
                disabled={busy !== null || said.trim().length < 10}
                onClick={() => onHear(said.trim())}
                className={cn(BTN, "bg-ink hover:bg-seal disabled:cursor-not-allowed disabled:opacity-60")}
              >
                {busy === "hear" ? "The court is hearing it…" : "Address the court"}
              </button>
            </>
          )}
          {e.hearing && (
            <>
              <span className={cn(BODY, "italic")}>“{e.hearing.ruling}”</span>
              <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-normal text-[#2a2018]">
                {e.hearing.order.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
              {e.pay_by && (
                <span className="text-[12.5px] text-ink-muted">
                  The balance is to be {e.hearing.outcome === "warrant" ? "levied" : "paid"} by {longDate(e.pay_by)}.
                </span>
              )}
            </>
          )}
        </div>
      )}

      {stage === "punished" && (
        <div role="status" className={cn(BOX, "border-seal bg-[rgba(142,31,25,.06)]")}>
          <strong className={cn(KICK, "text-seal")}>Sentenced for contempt</strong>
          <span className={BODY}>
            {who} didn’t pay as the court directed. The court held the breach wilful and passed sentence under the Contempt of Courts Act.
            What is still owed can only be recovered by a suit on the deed.
          </span>
        </div>
      )}

      {stage === "suit" && (
        <div role="status" className={cn(BOX, "border-ink/40 bg-[rgba(18,13,9,.04)]")}>
          <strong className={cn(KICK, "text-ink-meta")}>Left to a civil suit</strong>
          <span className={BODY}>
            {e?.result === "civil"
              ? "The court closed the application: contempt isn’t a way to recover money. The complainants can sue on the deed in a civil court."
              : userDefends
                ? copy.you
                : "You can sue on the deed in a civil court for what is unpaid. This case stays closed."}
          </span>
        </div>
      )}

      {stage === "closed" && (
        <div role="status" className={cn(BOX, "border-[#3f6b3a] bg-[rgba(63,107,58,.08)]")}>
          <strong className={cn(KICK, "text-[#3f6b3a]")}>Fully closed</strong>
          <span className={BODY}>
            {e?.result === "recovered"
              ? "The balance was recovered under the court’s warrant."
              : e?.result === "paid"
                ? "The balance was paid as the court directed."
                : "Every instalment is paid."}
            {attempt.closed_on ? ` The order was satisfied on ${longDate(attempt.closed_on)}.` : ""}
          </span>
        </div>
      )}

      {onNextDay && !attempt.payments_done && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={onNextDay}
          title="Developer mode: move every date under the order a day back"
          className="min-h-9 cursor-pointer self-start border-[1.5px] border-dashed border-ink/50 bg-transparent px-3 font-mono text-[11.5px] text-ink-muted hover:border-ink hover:text-ink disabled:cursor-wait"
        >
          {busy === "day" ? "…" : "dev · next day →"}
        </button>
      )}
    </div>
  );
}
