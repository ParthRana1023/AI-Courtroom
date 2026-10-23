"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { formatDate, sideLabel, type CaseRow } from "@/components/cases/kit";
import CourtModelLoader from "@/components/court/court-model-loader";
import EditProfile, { GENDERS } from "@/components/profile/edit-profile";
import { useAuth } from "@/contexts/auth-context";
import { useViewport } from "@/hooks/use-viewport";
import { authAPI, caseAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CaseOutcome, NegotiatorStats, OutcomeCounts, PartialScoring, User, UserStats } from "@/types";

// Profile.dc.html: identity card, record, recent cases and the Edit profile panel.

const TAG = "text-[10.5px] font-bold uppercase tracking-[0.18em]";
const SHEET = "bg-paper text-ink shadow-sheet";
const HEAD =
  "flex items-baseline justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 pt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-label";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WIN = "#3f6b3a";
const PART = "#b07a1a";
const LOSS = "#8e1f19";
const SETTLED = "#6b5d4b";

const SCORING: Record<PartialScoring, string> = {
  half: "Partial wins count as half a win",
  zero: "Partial wins count as losses",
  exclude: "Partial wins are left out",
};
const RESULT: Record<CaseOutcome, [string, string, string]> = {
  won: ["W", "Won", WIN],
  lost: ["L", "Lost", LOSS],
  partial: ["P", "Partly won", PART],
  settled: ["S", "Settled", SETTLED],
};

/** Status stamp for a case: the outcome once decided, else where the hearing stands. */
function stamp(c: CaseRow): [string, string] {
  if (c.status === "resolved") {
    if (c.outcome) return [RESULT[c.outcome][1], c.outcome === "partial" ? "#9a5b12" : RESULT[c.outcome][2]];
    return ["Resolved", "#120d09"];
  }
  if (c.status === "active") return ["In session", WIN];
  if (c.status === "adjourned") return ["Adjourned", "#9a5b12"];
  return ["Not started", "#4a3e30"];
}

/** "4 May 1995" from a stored "1995-05-04", without a time-zone shift. */
function bornOn(dob: string) {
  const [y, m, d] = dob.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function phoneText(u: User) {
  const code = u.phone_code || "91";
  const n = u.phone_number ?? "";
  return `+${code} ${code === "91" && n.length === 10 ? `${n.slice(0, 5)} ${n.slice(5)}` : n}`;
}

const FACTORS = [
  ["terms", "Terms won", 50],
  ["closed", "Deal closed", 25],
  ["offers", "Offers used", 15],
  ["conditions", "Conditions", 10],
] as const;
const TIER_COLOR: Record<string, string> = { Exceptional: WIN, Strong: WIN, Capable: "#7a4a0c", Developing: LOSS };
const PROVISIONAL_UNDER = 5; // scores before the rating firms up
const ORDINAL = ["first", "second", "third"];
const tierOf = (n: number) => (n >= 85 ? "Exceptional" : n >= 70 ? "Strong" : n >= 40 ? "Capable" : "Developing");

/** One line under each factor's bar, read from the averages. */
function factorNote(key: (typeof FACTORS)[number][0], v: number, n: NegotiatorStats) {
  if (key === "terms")
    return v >= 75
      ? "Final terms moved most of the way toward your client’s position."
      : v >= 50
        ? "Final terms moved about half way or more toward your client’s position."
        : "Final terms stayed close to the other side’s first offer.";
  if (key === "closed") return `${n.deals} of ${n.scored} negotiation${n.scored === 1 ? "" : "s"} ended in a deal the court accepted.`;
  if (key === "offers")
    return n.offers_to_deal
      ? `You usually settle by your ${ORDINAL[Math.min(2, Math.max(0, Math.round(n.offers_to_deal) - 1))]} offer.`
      : "No deal yet, so no offers to count.";
  return v >= 60 ? "You keep most of your client’s conditions on the table." : "You often give up conditions to close the deal.";
}

const pct = (n: number, t: number) => (t ? `${(n / t) * 100}%` : "0%");

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { w } = useViewport();
  const mob = w < 560;
  const two = w >= 980;
  const three = w >= 1320;
  const roomy = w >= 700;
  const [stats, setStats] = useState<UserStats | null>(null);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const recRef = useRef<HTMLElement>(null);
  const rateRef = useRef<HTMLSpanElement>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([authAPI.getProfileStats(), caseAPI.listCases()])
      .then(([s, c]: [UserStats, CaseRow[]]) => {
        setStats(s);
        setCases(c);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const loaded = !!(user && stats && cases);

  // The bars grow in and the win rate counts up once the record arrives.
  useEffect(() => {
    const root = recRef.current;
    if (!loaded || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ease = "cubic-bezier(.2,.8,.2,1)";
    root.querySelectorAll<HTMLElement>('[data-grow="x"]').forEach((el, i) =>
      el.animate?.(
        [
          { transform: "scaleX(0)", transformOrigin: "left" },
          { transform: "none", transformOrigin: "left" },
        ],
        {
          duration: 700,
          delay: 150 + (i % 3) * 120,
          easing: ease,
          fill: "backwards",
        },
      ),
    );
    root.querySelectorAll<HTMLElement>('[data-grow="y"]').forEach((el, i) =>
      el.animate?.(
        [
          { transform: "scaleY(0)", transformOrigin: "bottom" },
          { transform: "none", transformOrigin: "bottom" },
        ],
        {
          duration: 600,
          delay: 250 + i * 80,
          easing: ease,
          fill: "backwards",
        },
      ),
    );
    const el = rateRef.current;
    if (!el) return;
    const to = parseInt(el.textContent ?? "", 10) || 0;
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(to);
    };
  }, [loaded]);

  const px = mob ? "px-4" : "px-6";

  return (
    <div
      data-pscroll=""
      className={cn("mx-auto flex w-full max-w-7xl flex-col", mob ? "gap-3 px-3 pt-3.5 pb-6" : "gap-4.5 px-[3vw] pt-5.5 pb-8")}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2.5">
        <div className="flex flex-col gap-1.5">
          <span className={cn(TAG, "text-desk-muted")}>Your profile</span>
          <h1 className={cn("m-0 font-display font-normal text-desk-ink", mob ? "text-[30px]/[1.05]" : "text-[42px]/[1.05]")}>
            Good to see you, {user?.nickname || user?.first_name}.
          </h1>
        </div>
        <Link
          href="/cases/new"
          className={cn(
            "flex h-11.5 items-center justify-center bg-seal px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase hover:bg-seal-hover hover:text-white",
            mob && "flex-[1_1_100%]",
          )}
        >
          New case →
        </Link>
      </div>

      {!loaded && (
        <div className={cn(SHEET, "flex min-h-105 items-center justify-center px-3 py-6")}>
          {failed ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="font-display text-[22px]">Couldn’t load your record.</span>
              <button
                type="button"
                onClick={load}
                className="h-11.5 cursor-pointer border-[1.5px] border-ink bg-transparent px-4.5 text-xs font-bold tracking-[0.14em] text-ink uppercase hover:bg-[#f8f3e7]"
              >
                Try again
              </button>
            </div>
          ) : (
            <CourtModelLoader status="Loading your record…" tone="paper" />
          )}
        </div>
      )}

      {loaded && user && stats && cases && (
        <>
          <div
            className={cn(
              "grid items-stretch",
              mob ? "gap-3" : "gap-4.5",
              three ? "grid-cols-[320px_minmax(0,1fr)_340px]" : two ? "grid-cols-[360px_minmax(0,1fr)]" : "grid-cols-1",
            )}
          >
            <Identity user={user} cases={cases} mob={mob} onEdit={() => setEditing(true)} />
            <Record stats={stats} mob={mob} roomy={roomy} recRef={recRef} rateRef={rateRef} />
            {three && <Negotiator n={stats.negotiator} mob={mob} side />}
          </div>
          {!three && <Negotiator n={stats.negotiator} mob={mob} side={false} />}
          <RecentCases cases={cases} px={px} mob={mob} />
        </>
      )}

      {user && <EditProfile user={user} open={editing} onClose={() => setEditing(false)} onSaved={refreshUser} w={w} />}
    </div>
  );
}

function Identity({ user: u, cases, mob, onEdit }: { user: User; cases: CaseRow[]; mob: boolean; onEdit: () => void }) {
  const px = mob ? "px-4" : "px-6";
  const mx = mob ? "mx-4" : "mx-6";
  const ini = `${u.first_name[0] ?? ""}${u.last_name[0] ?? ""}`.toUpperCase();
  const since = u.member_since ? new Date(u.member_since) : null;
  const gender = GENDERS.find(([v]) => v === u.gender)?.[1];
  const details: [string, string][] = [
    ["Email", u.email || "Not added"],
    ...(u.phone_number ? [["Phone", phoneText(u)] as [string, string]] : []),
    ["Practises", [u.city, u.state, u.country].filter(Boolean).join(", ") || "Not set"],
    ...(gender ? [["Gender", gender] as [string, string]] : []),
    ...(u.date_of_birth ? [["Born", bornOn(u.date_of_birth)] as [string, string]] : []),
  ];
  const resolved = cases.filter((c) => c.status === "resolved").length;
  const counts: [number, string][] = [
    [cases.length, "Cases"],
    [cases.length - resolved, "Active"],
    [resolved, "Resolved"],
  ];
  const resume = cases.filter((c) => c.status !== "resolved").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const asks: [string, unknown][] = [
    ["Nickname", u.nickname],
    ["Gender", u.gender],
    ["Date of birth", u.date_of_birth],
    ["Phone", u.phone_number],
  ];
  const missing = asks.filter(([, v]) => !v);

  return (
    <section aria-label="Your details" className={cn(SHEET, "flex flex-col")}>
      <div className={cn(HEAD, px)}>
        <span>Counsel</span>
        {since && (
          <span className="font-data font-medium tracking-[0.04em]">Since {`${MONTHS[since.getMonth()]} ${since.getFullYear()}`}</span>
        )}
      </div>
      <div className={cn("flex flex-col items-center gap-3.5 pt-5.5 pb-4.5 text-center", px)}>
        <div className="relative h-28 w-28">
          {u.profile_photo_url ? (
            <span
              role="img"
              aria-label="Profile photo"
              className="block h-28 w-28 rounded-full border-[3px] border-double border-ink bg-ink bg-cover bg-center"
              style={{ backgroundImage: `url("${u.profile_photo_url}")` }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-28 w-28 items-center justify-center rounded-full bg-ink font-display text-[40px] tracking-[0.04em] text-paper"
            >
              {ini}
            </span>
          )}
          <span
            aria-hidden="true"
            className="absolute -right-1.5 bottom-0.5 -rotate-6 border-[1.5px] border-seal bg-paper px-2 pt-1 pb-0.75 text-[10.5px] font-bold tracking-[0.14em] text-seal"
          >
            ENROLLED
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-display text-[26px] leading-[1.15]">
            {u.first_name} {u.last_name}
          </span>
          {u.nickname && <span className="text-[13.5px] text-ink-muted">Goes by {u.nickname}</span>}
        </div>
        <dl className="m-0 flex w-full flex-col border-t border-ink/20 text-left">
          {details.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 border-b border-ink/15 py-2.25">
              <dt className={cn(TAG, "pt-0.5 text-ink-meta")}>{k}</dt>
              <dd className="m-0 text-sm leading-[1.45] wrap-anywhere text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid w-full grid-cols-3 border-[1.5px] border-ink">
          {counts.map(([n, t], i) => (
            <Link
              key={t}
              href="/cases"
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-2.5 text-ink hover:bg-[#f8f3e7] hover:text-ink",
                i > 0 && "border-l border-ink/30",
              )}
            >
              <span className="font-display text-[26px] leading-none">{n}</span>
              <span className={cn(TAG, "text-ink-muted")}>{t}</span>
            </Link>
          ))}
        </div>
      </div>
      {resume && (
        <Link
          href={`/cases/${resume.cnr}`}
          className={cn(
            "mb-4.5 flex items-center justify-between gap-3 border-[1.5px] border-ink px-3.5 py-3 text-left text-ink hover:bg-[#f8f3e7] hover:text-ink",
            mx,
          )}
        >
          <span className="flex min-w-0 flex-col gap-0.75">
            <span className={cn(TAG, "text-seal")}>Pick up where you left off</span>
            <span className="truncate font-display text-[17px] leading-tight">{resume.title}</span>
            <span className="font-data text-[11.5px] font-medium text-ink-meta">
              {resume.cnr} · {sideLabel(resume.user_role)} · {stamp(resume)[0]}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none font-display text-[22px] text-seal">
            →
          </span>
        </Link>
      )}
      {missing.length > 0 && (
        <div className={cn("mb-4.5 flex flex-col gap-2.5 border-[1.5px] border-dashed border-ink/45 px-3.5 pt-3.5 pb-3", mx)}>
          <div className="flex items-baseline justify-between gap-2.5">
            <span className={cn(TAG, "text-ink-muted")}>Complete your profile</span>
            <span className="font-data text-[11.5px] font-medium text-ink-muted">{4 - missing.length} of 4 added</span>
          </div>
          <div aria-hidden="true" className="grid grid-cols-4 gap-1">
            {asks.map(([k, v]) => (
              <span key={k} className={cn("h-1", v ? "bg-ink" : "bg-ink/18")} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map(([k]) => (
              <button
                key={k}
                type="button"
                onClick={onEdit}
                className="min-h-8.5 cursor-pointer border border-ink/45 bg-transparent px-3 text-[13px] text-ink hover:border-ink hover:bg-[#f8f3e7]"
              >
                + {k}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={cn("mt-auto flex gap-2 pb-4.5", px)}>
        <button
          type="button"
          onClick={onEdit}
          className="h-11.5 flex-1 cursor-pointer border-0 bg-ink text-xs font-bold tracking-[0.14em] whitespace-nowrap text-paper uppercase hover:bg-seal"
        >
          Edit profile
        </button>
        <Link
          href="/settings"
          className="flex h-11.5 flex-none items-center border-[1.5px] border-ink px-4 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-ink uppercase hover:bg-[#f8f3e7] hover:text-ink"
        >
          Settings
        </Link>
      </div>
    </section>
  );
}

function Record({
  stats,
  mob,
  roomy,
  recRef,
  rateRef,
}: {
  stats: UserStats;
  mob: boolean;
  roomy: boolean;
  recRef: RefObject<HTMLElement | null>;
  rateRef: RefObject<HTMLSpanElement | null>;
}) {
  const px = mob ? "px-4" : "px-6";
  const o = stats.overall;
  const a = stats.activity;
  const pending = stats.pending_outcomes;
  const role = (t: string, c: OutcomeCounts) => ({
    t,
    rate: `${Math.round(c.win_rate)}%`,
    w: pct(c.wins, c.total),
    p: pct(c.partials, c.total),
    l: pct(c.losses, c.total),
    sub: `${c.wins} won · ${c.losses} lost · ${c.partials} partial`,
  });
  const tiles: [string, string, string][] = [
    ["Current streak", String(stats.current_streak), `Best: ${stats.best_streak}`],
    ["Arguments made", String(a.arguments), `${a.avg_arguments.toFixed(1)} per case`],
    ["Witnesses examined", String(a.witnesses_examined), `${a.conferences_held} client conferences`],
    ["Evidence handled", String(a.evidence), `${a.avg_evidence.toFixed(1)} per case`],
  ];
  // The last six months, oldest first; empty months show as gaps.
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = stats.monthly.find((x) => x.month === key);
    return { m: MONTHS[d.getMonth()], w: m?.wins ?? 0, l: m?.losses ?? 0, p: m?.partials ?? 0 };
  });
  const most = Math.max(1, ...months.map((m) => m.w + m.l + m.p));
  const bar = (n: number) => `${(n / most) * 112}px`;

  return (
    <section ref={recRef} aria-label="Your record" className={cn(SHEET, "flex min-w-0 flex-col")}>
      <div className={cn(HEAD, px)}>
        <span>Your record</span>
        <span className="text-[12.5px] font-normal tracking-normal text-ink-muted normal-case">{SCORING[stats.partial_scoring]}</span>
      </div>
      {pending > 0 && (
        <div
          className={cn(
            "mt-3.5 border border-[rgba(176,122,26,.5)] bg-[#f3e6c6] px-3 py-2.25 text-[13.5px] leading-[1.45] text-[#5a3608]",
            mob ? "mx-4" : "mx-6",
          )}
        >
          {pending} resolved case{pending === 1 ? " is" : "s are"} waiting for an outcome. Opening a case’s analysis decides it.
        </div>
      )}
      {o.total === 0 ? (
        <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-3.5 px-5 py-8 text-center">
          <span className="font-display text-[26px] leading-[1.2]">No decided cases yet.</span>
          <span className="max-w-[40ch] text-[15px] leading-[1.55] text-ink-label">Finish a case to start your record.</span>
          <Link
            href="/cases/new"
            className="flex h-11.5 items-center bg-seal px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase hover:bg-seal-hover hover:text-white"
          >
            Generate your first case →
          </Link>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "grid flex-1 items-center gap-x-8 gap-y-5 pt-5 pb-5.5",
              px,
              roomy ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
            )}
          >
            <div className="flex flex-col gap-1.5">
              <span className={cn(TAG, "text-ink-muted")}>Win rate</span>
              <span className="flex items-baseline gap-1">
                <span ref={rateRef} className={cn("font-display text-ink", mob ? "text-[84px]/[0.9]" : "text-[108px]/[0.9]")}>
                  {Math.round(o.win_rate)}
                </span>
                <span className="font-display text-[30px] text-ink">%</span>
              </span>
              <span className="text-[15px] font-bold">
                {o.wins}W · {o.losses}L · {o.partials}P
              </span>
              <span className="text-[13px] text-ink-muted">
                {o.total} decided{o.settled ? ` · ${o.settled} settled` : ""}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {[role("As Plaintiff", stats.as_plaintiff), role("As Defence", stats.as_defendant)].map((r) => (
                <div key={r.t} className="flex flex-col gap-1.75">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-sm font-bold">{r.t}</span>
                    <span className="font-display text-xl">{r.rate}</span>
                  </div>
                  <div aria-hidden="true" className="flex h-2.5 overflow-hidden bg-ink/12">
                    <span data-grow="x" style={{ width: r.w, background: WIN }} />
                    <span data-grow="x" style={{ width: r.p, background: PART }} />
                    <span data-grow="x" style={{ width: r.l, background: LOSS }} />
                  </div>
                  <span className="text-[12.5px] text-ink-muted">{r.sub}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={cn("grid border-y border-ink/25", roomy ? "grid-cols-4" : "grid-cols-2")}>
            {tiles.map(([k, v, sub], i) => (
              <div
                key={k}
                className={cn(
                  "flex flex-col gap-0.75 py-3.5",
                  px,
                  (roomy ? i : i % 2) > 0 && "border-l border-ink/25",
                  !roomy && i > 1 && "border-t border-ink/25",
                )}
              >
                <span className={cn(TAG, "text-ink-muted")}>{k}</span>
                <span className="font-display text-[30px] leading-[1.05]">{v}</span>
                <span className="text-[12.5px] text-ink-muted">{sub}</span>
              </div>
            ))}
          </div>
          <div className={cn("grid flex-1 items-center gap-x-8 gap-y-5.5 pt-4.5 pb-5.5", px, roomy ? "grid-cols-2" : "grid-cols-1")}>
            <div className="flex min-w-0 flex-col gap-2.5">
              <span className={cn(TAG, "text-ink-muted")}>
                Recent form <span className="font-normal tracking-[0.06em] normal-case">· newest first</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {stats.recent_form.slice(0, 10).map((r) => {
                  const [letter, word, color] = RESULT[r.outcome];
                  const tip = `${r.title}: ${word} as ${r.role === "plaintiff" ? "plaintiff" : "defence"}`;
                  return (
                    <Link
                      key={r.cnr}
                      href={`/cases/${r.cnr}`}
                      title={tip}
                      aria-label={tip}
                      className="flex h-8.5 w-8.5 items-center justify-center font-data text-[13px] font-bold text-cream transition-transform duration-150 hover:-translate-y-0.5 hover:text-white"
                      style={{ background: color }}
                    >
                      {letter}
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3.5 text-xs text-ink-muted">
                {[["Won", WIN], ["Partial", PART], ["Lost", LOSS], ...(o.settled ? [["Settled", SETTLED]] : [])].map(([t, c]) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className="h-2.25 w-2.25" style={{ background: c }} />
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              <span className={cn(TAG, "text-ink-muted")}>Last 6 months</span>
              <div className="flex h-30 items-end gap-2.5 border-b-[1.5px] border-ink">
                {months.map((m) => (
                  <div
                    key={m.m}
                    title={`${m.m}: ${m.w} won, ${m.l} lost, ${m.p} partial`}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <div data-grow="y" className="flex w-[min(100%,30px)] flex-col">
                      <span style={{ height: bar(m.l), background: LOSS }} />
                      <span style={{ height: bar(m.p), background: PART }} />
                      <span style={{ height: bar(m.w), background: WIN }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5">
                {months.map((m) => (
                  <span key={m.m} className="flex-1 text-center font-data text-[11px] font-medium text-ink-muted">
                    {m.m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function RecentCases({ cases, px, mob }: { cases: CaseRow[]; px: string; mob: boolean }) {
  const recent = [...cases].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  return (
    <section aria-label="Recent cases" className={SHEET}>
      <div className={cn(HEAD, px)}>
        <span>Recent cases</span>
        <Link href="/cases" className="border-b border-seal tracking-[0.16em] text-seal hover:text-ink">
          All cases →
        </Link>
      </div>
      {recent.length === 0 && (
        <p className={cn("m-0 py-6 text-[15px] text-ink-hint italic", px)}>No cases yet. Your newest five will be listed here.</p>
      )}
      {recent.map((c) => {
        const [label, color] = stamp(c);
        return (
          <Link
            key={c.cnr}
            href={`/cases/${c.cnr}`}
            className={cn(
              "grid items-center gap-x-4.5 gap-y-1 border-b border-ink/14 py-3 text-ink hover:bg-[#f8f3e7] hover:text-ink",
              px,
              mob ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto_130px]",
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.75">
              <span className="truncate font-display text-[17px] leading-tight">{c.title}</span>
              <span className="font-data text-[11.5px] font-medium text-ink-meta">
                {c.cnr} · {sideLabel(c.user_role)}
              </span>
            </span>
            {!mob && <span className="text-[13px] whitespace-nowrap text-ink-muted">{formatDate(c.created_at)}</span>}
            <span className="flex flex-wrap items-center justify-end gap-1.5 justify-self-end">
              <span className={cn(TAG, "border-[1.5px] px-2 pt-0.75 pb-0.5 whitespace-nowrap")} style={{ borderColor: color, color }}>
                {label}
              </span>
              {c.negotiation_score != null && (
                <span
                  title="Negotiation score"
                  className="border-[1.5px] border-dashed px-1.75 pt-0.5 pb-px font-data text-[11px] font-medium whitespace-nowrap"
                  style={{ borderColor: TIER_COLOR[tierOf(c.negotiation_score)], color: TIER_COLOR[tierOf(c.negotiation_score)] }}
                >
                  Neg {c.negotiation_score}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

/** Profile v2.dc.html, negotiator rating: the average of the last ten negotiation scores. */
function Negotiator({ n, mob, side }: { n: NegotiatorStats; mob: boolean; side: boolean }) {
  const [how, setHow] = useState(false);
  const px = mob ? "px-4" : "px-6";
  const mx = mob ? "mx-4" : "mx-6";
  const provisional = n.scored < PROVISIONAL_UNDER;
  const tier = n.tier ?? "";
  const stampColor = provisional ? SETTLED : TIER_COLOR[tier];
  const days = n.days_to_settle == null ? null : Math.max(1, Math.round(n.days_to_settle));
  const stats: [string, string, string][] = [
    ["Deals closed", `${n.deals} of ${n.scored}`, "accepted by the court"],
    ["Offers to a deal", n.offers_to_deal?.toFixed(1) ?? "—", "on average"],
    ["Time to settle", days == null ? "—" : `${days} day${days > 1 ? "s" : ""}`, "first offer to signing"],
  ];

  return (
    <section aria-label="Negotiator rating" className={cn(SHEET, "flex min-w-0 flex-col")}>
      <div className={cn(HEAD, px)}>
        <span>Negotiator rating</span>
        <button
          type="button"
          onClick={() => setHow(!how)}
          aria-expanded={how}
          className="cursor-pointer border-0 border-b border-seal bg-transparent p-0 text-[10.5px] font-bold tracking-[0.16em] text-seal uppercase hover:text-ink"
        >
          How it’s scored
        </button>
      </div>
      {how && (
        <div
          className={cn(
            "mt-4 flex flex-col gap-2 border border-ink/20 bg-[#f8f3e7] px-4 py-3.5 text-[13.5px] leading-[1.55] text-[#2a2018]",
            mx,
          )}
        >
          <span>
            Each case with settlement talks gets a score out of 100 from its negotiation analysis, once the case is decided. Your rating is
            the average of your last ten scores.
          </span>
          <span>
            <strong>Terms won (50%)</strong> measures how far the final terms moved in your client’s favour from the other side’s first
            offer. <strong>Deal closed (25%)</strong> is full marks when the court accepts the settlement, partial when terms are agreed but
            the court refuses or adjourns, and zero when talks end. <strong>Offers used (15%)</strong> rewards reaching terms in fewer
            offers. <strong>Conditions (10%)</strong> counts conditions that favour your client.
          </span>
          <span className="text-ink-label">Developing 0–39 · Capable 40–69 · Strong 70–84 · Exceptional 85–100</span>
        </div>
      )}
      {n.pending > 0 && (
        <div
          className={cn(
            "mt-3.5 border border-[rgba(176,122,26,.5)] bg-[#f3e6c6] px-3 py-2.25 text-[13.5px] leading-[1.45] text-[#5a3608]",
            mx,
          )}
        >
          {n.pending} decided case{n.pending === 1 ? " has" : "s have"} settlement talks waiting for a score. Opening a case’s negotiation
          analysis scores it.
        </div>
      )}
      {n.score == null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-8.5 text-center">
          <span className="font-display text-2xl leading-[1.2]">No negotiations yet.</span>
          <span className="max-w-[46ch] text-[15px] leading-[1.55] text-ink-label">
            Settle a case, or try to, and your first negotiation score appears here.
          </span>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "grid flex-1 items-center gap-x-8 gap-y-5 pt-5 pb-5.5",
              px,
              side || mob ? "grid-cols-1" : "grid-cols-[auto_minmax(0,1fr)]",
            )}
          >
            <div className="flex flex-col gap-1.5">
              <span className={cn(TAG, "text-ink-label")}>Rating</span>
              <span className="flex items-baseline gap-1">
                <span className={cn("font-display", mob ? "text-[72px]/[0.9]" : "text-[84px]/[0.9]")}>{n.score}</span>
                <span className="font-display text-[26px]">/100</span>
              </span>
              <span
                className="-rotate-2 self-start border-[3px] border-double px-2.5 pt-1 pb-0.75 font-display text-[15px] leading-none tracking-[0.08em] uppercase"
                style={{ borderColor: stampColor, color: stampColor }}
              >
                {provisional ? "Provisional" : tier}
              </span>
              <span className="text-[13px] text-ink-label">
                {provisional ? `${n.scored} of ${PROVISIONAL_UNDER} cases scored · reads as ${tier} so far` : `${n.scored} cases scored`}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-3.5">
              {FACTORS.map(([key, label, weight]) => {
                const v = n.factors[key] ?? 0;
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2.5">
                      <span className="text-sm font-bold">
                        {label} <span className="font-data text-[11px] font-medium text-ink-meta">· {weight}%</span>
                      </span>
                      <span className="font-display text-xl">{v}</span>
                    </div>
                    <div aria-hidden="true" className="h-2 bg-ink/12">
                      <span className="block h-full" style={{ width: `${v}%`, background: v >= 70 ? WIN : v >= 40 ? PART : LOSS }} />
                    </div>
                    <span className="text-[12.5px] leading-[1.4] text-ink-label">{factorNote(key, v, n)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-ink/25">
            {stats.map(([k, v, sub], i) => (
              <div
                key={k}
                className={cn("flex min-w-0 flex-col gap-0.75 py-3.5", mob ? "px-3" : "px-4", i > 0 && "border-l border-ink/20")}
              >
                <span className={cn(TAG, "text-ink-label")}>{k}</span>
                <span className="font-display text-[26px] leading-[1.05]">{v}</span>
                <span className="text-[12.5px] leading-[1.4] text-ink-label">{sub}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
