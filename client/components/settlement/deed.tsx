"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Signature from "@/components/court/signature";
import { longDate, type Phase, type ROUTE_COPY } from "@/lib/settlement";
import { SIG_SPACING, caseFonts, handOf } from "@/lib/signature";
import { cn } from "@/lib/utils";
import type { SettlementDeed } from "@/types";

/** Signing on this visit: the user's side draws, then the other side; done once all have drawn. */
export type SignStage = "you" | "them" | "done" | null;

type Signer = SettlementDeed["signatories"][number];

const BTN = "h-11.5 cursor-pointer self-end border-0 px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap uppercase";
export const DRAW_MS = 2000; // a signature takes this long to draw

/** "Complainant 3 of 11": complainants after the first sign in a block of their own. */
const isExtra = (s: Signer) => {
  const n = /^Complainant (\d+) of/.exec(s.role)?.[1];
  return !!n && n !== "1";
};

/** The deed, its signatures, and signing and filing it. */
export default function Deed({
  cnr,
  deed,
  copy,
  phase,
  stage,
  signedBefore,
  hearingDate,
  readOnly,
  filing,
  onSign,
  onFile,
}: {
  cnr: string;
  deed: SettlementDeed | null;
  copy: (typeof ROUTE_COPY)[keyof typeof ROUTE_COPY];
  phase: Phase;
  stage: SignStage;
  signedBefore: boolean; // already signed when the page opened
  hearingDate: string | null;
  readOnly: boolean;
  filing: boolean;
  onSign: () => void;
  onFile: () => void;
}) {
  const [othersOpen, setOthersOpen] = useState(false);
  const signers = deed?.signatories ?? [];
  const main = signers.filter((s) => !isExtra(s));
  const others = signers.filter(isExtra);
  const mainKey = main.map((s) => s.name).join("|");
  const otherKey = others.map((s) => s.name).join("|");
  const mainFonts = useMemo(() => (mainKey ? caseFonts(cnr, mainKey.split("|")) : {}), [cnr, mainKey]);
  const otherFonts = useMemo(() => (otherKey ? caseFonts(cnr, otherKey.split("|")) : {}), [cnr, otherKey]);

  const signed = (s: Signer) => (stage === "you" ? s.side === "user" : stage ? true : signedBefore);
  const othersSigned = others.length > 0 && others.every(signed);
  const status = !deed
    ? { t: "Not drafted", c: "#6b5d4b" }
    : stage === "you"
      ? { t: "Signed by your client", c: "#3f6b3a" }
      : phase === "agreed" && !stage
        ? { t: "Draft · not signed", c: "#7a4a0c" }
        : { t: "Signed by both sides", c: "#3f6b3a" };

  return (
    <section aria-labelledby="sd-deed" className="flex min-w-0 flex-col gap-3.5 [grid-area:d]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-2 border-b-[3px] border-double border-ink pb-2.5">
        <h2 id="sd-deed" className="m-0 font-display text-[22px] leading-[1.1] font-normal">
          {copy.deedH}
        </h2>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: status.c }}>
          {status.t}
        </span>
      </div>

      {!deed ? (
        <div className="flex flex-col gap-1.5 border border-dashed border-ink/45 px-4 py-4.5">
          <span className="font-display text-lg leading-[1.25]">Drafted once both sides agree</span>
          <span className="text-[13.5px] leading-[1.55] text-pretty text-ink-label">{copy.noDeedT}</span>
        </div>
      ) : (
        <>
          <article
            aria-label={copy.deedH}
            className="flex flex-col gap-3 border border-ink/25 bg-[#f8f3e7] px-5.5 pt-5.5 pb-5 shadow-[0_18px_40px_-24px_rgba(18,13,9,.5)]"
          >
            <div className="flex flex-col items-center gap-0.5 text-center font-data text-[11px] leading-normal font-medium tracking-[0.06em] text-balance text-ink-muted uppercase">
              {deed.header.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            <h3 className="m-0 text-center font-display text-2xl leading-[1.15] font-normal">{deed.title}</h3>
            <p className="m-0 text-sm leading-[1.6] text-pretty text-[#2a2018]">{deed.parties}</p>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {deed.clauses.map((c, i) => (
                <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-sm leading-[1.6] text-ink">
                  <span className="font-data text-[12.5px] leading-[1.8] font-medium text-seal">{i + 1}.</span>
                  <span className="text-pretty">{c}</span>
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4 pt-1.5">
              {main.map((s) => {
                const on = signed(s);
                return (
                  <div key={s.name} className="flex flex-col gap-1">
                    <span className={cn("flex h-11.5 items-end border-b-[1.5px] pb-0.5", on ? "border-ink" : "border-ink/35")}>
                      {on && mainFonts[s.name] && (
                        <Signature
                          name={s.name}
                          font={mainFonts[s.name]}
                          instant={!stage}
                          duration={DRAW_MS}
                          className="h-full w-full max-w-52.5 origin-bottom-left -rotate-2"
                        />
                      )}
                    </span>
                    <span className="text-[13.5px] leading-[1.35] font-bold">{s.name}</span>
                    <span className="text-[12.5px] leading-[1.4]" style={{ color: on ? "#3f6b3a" : "#6b5d4b" }}>
                      {s.role} · {on ? "Signed" : "Not signed"}
                    </span>
                  </div>
                );
              })}
            </div>
            {others.length > 0 && (
              <div className="flex flex-col border-y border-ink/20">
                <button
                  type="button"
                  onClick={() => setOthersOpen((o) => !o)}
                  aria-expanded={othersOpen}
                  aria-controls="sd-others"
                  className="flex min-h-11 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-ink hover:text-seal"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-5.5 flex-none place-items-center border-[1.5px] border-current font-data text-sm leading-none font-bold"
                  >
                    {othersOpen ? "−" : "+"}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] leading-[1.35] font-bold">
                    {others.length} other complainant{others.length > 1 ? "s" : ""}
                  </span>
                  <span className="flex-none text-[12.5px] leading-[1.4]" style={{ color: othersSigned ? "#3f6b3a" : "#6b5d4b" }}>
                    {othersSigned ? `Signed ${others.length} of ${others.length}` : "Not signed"}
                  </span>
                </button>
                {othersOpen && (
                  <div id="sd-others" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-3.5 pt-1 pb-4">
                    {others.map((s, i) => {
                      const on = signed(s);
                      const hand = handOf(s.name);
                      const font = otherFonts[s.name];
                      return (
                        <div key={s.name} className="flex flex-col gap-0.75">
                          <span className={cn("flex h-9 items-end border-b-[1.5px] pb-0.5", on ? "border-ink" : "border-ink/35")}>
                            {on && font && (
                              <Signature
                                name={s.name}
                                font={font}
                                instant={!stage}
                                delay={i * 160}
                                duration={1400}
                                stroke={hand.stroke}
                                spacing={SIG_SPACING[font] + hand.spacing}
                                className="h-full w-full max-w-45 origin-bottom-left"
                                style={{ transform: `rotate(${hand.tilt}deg)` }}
                              />
                            )}
                          </span>
                          <span className="text-[12.5px] leading-[1.35] font-bold">{s.name}</span>
                          <span className="text-[11.5px] leading-[1.4]" style={{ color: on ? "#3f6b3a" : "#6b5d4b" }}>
                            {s.role} · {on ? "Signed" : "Not signed"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </article>

          {stage === "you" && (
            <span role="status" className="flex items-center gap-2 text-sm leading-normal text-ink-meta italic">
              <span>Waiting for the other side to sign…</span>
              <span aria-hidden="true" className="inline-block h-0.5 w-2 animate-[ac-cursor_1s_steps(1)_infinite] bg-seal" />
            </span>
          )}
          {!readOnly && phase === "agreed" && !stage && (
            <button type="button" onClick={onSign} className={cn(BTN, "bg-ink text-paper hover:bg-seal")}>
              Sign for your client
            </button>
          )}
          {!readOnly && phase === "signed" && (!stage || stage === "done") && (
            <button
              type="button"
              onClick={onFile}
              disabled={filing}
              className={cn(BTN, "text-cream", filing ? "cursor-wait bg-ink-disabled" : "bg-seal hover:bg-seal-hover")}
            >
              {filing ? "Filing…" : deed.file_label}
            </button>
          )}
          {phase === "filed" && hearingDate && (
            <div className="flex flex-col items-start gap-2.5 border-[1.5px] border-[#3f6b3a] px-4 py-3.5">
              <strong className="text-[10.5px] font-bold tracking-[0.18em] text-[#3f6b3a] uppercase">{copy.filedK}</strong>
              <span className="text-sm leading-[1.55] text-pretty text-[#2a2018]">{copy.filedT(longDate(hearingDate))}</span>
              <Link
                href={`/cases/${cnr}/settlement/hearing`}
                className="flex h-12 items-center justify-center gap-2.5 self-stretch bg-seal px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase hover:bg-seal-hover"
              >
                <span>{copy.hearL}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
