import Link from "next/link";
import type { RouteItem, SettlementProfile } from "@/types";
import { cn } from "@/lib/utils";

const H2 = "m-0 font-display font-normal leading-[1.1]";
const RULE = "flex items-center justify-between gap-2.5 border-b-[3px] border-double border-ink pb-2.5";
const STAMP = "-rotate-3 border-[3px] border-double px-2.5 pt-1.25 pb-0.75 font-display text-[13px] leading-none tracking-[0.08em]";

/** The route the case allows: the provision, the court, each offence, and the rule that matters. */
export function RouteCard({ profile, sticky }: { profile: SettlementProfile; sticky: boolean }) {
  return (
    <section
      aria-labelledby="sd-route"
      className={cn("flex min-w-0 flex-col gap-3.5 self-start [grid-area:e]", sticky && "sticky top-0 pt-1")}
    >
      <div className={RULE}>
        <h2 id="sd-route" className={cn(H2, "text-[22px]")}>
          Route
        </h2>
        <span className={cn(STAMP, "border-[#3f6b3a] text-[#3f6b3a]")}>OPEN</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-display text-xl leading-[1.2]">{profile.title}</span>
        <span className="font-data text-xs leading-[1.4] font-medium text-ink-muted">{profile.court}</span>
      </div>
      <Items items={profile.offences} col="64px" />
      <p className="m-0 text-[13.5px] leading-[1.55] text-pretty text-[#2a2018]">
        <strong>{profile.must}</strong> {profile.must_detail}
      </p>
      {profile.footnote && <p className="m-0 text-[12.5px] leading-normal text-pretty text-ink-meta">{profile.footnote}</p>}
    </section>
  );
}

/** No route: why each one is shut, and the way back. */
export function ClosedRoutes({ profile, cnr }: { profile: SettlementProfile; cnr: string }) {
  return (
    <section aria-labelledby="sd-none" className="flex w-full max-w-195 flex-col gap-4.5">
      <div className={cn(RULE, "gap-3")}>
        <h2 id="sd-none" className={cn(H2, "text-2xl leading-[1.15] text-balance")}>
          No settlement route is open
        </h2>
        <span className={cn(STAMP, "flex-none border-seal text-seal")}>CLOSED</span>
      </div>
      <p className="m-0 max-w-[64ch] text-body leading-[1.6] text-pretty text-[#2a2018]">
        A route opens only when the offences and the stage of the case allow it. The case continues in court, and you prepare for the next
        hearing as usual.
      </p>
      <Items items={profile.closed} col="72px" closed />
      <p className="m-0 max-w-[64ch] text-meta leading-[1.55] text-pretty text-ink-meta">
        This page reopens if the case changes, for example if a charge is dropped or a petition is filed in the High Court.
      </p>
      <Link
        href={`/cases/${cnr}/case-prep`}
        className="flex h-11.5 items-center gap-2.5 self-start bg-ink px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-paper uppercase hover:bg-seal"
      >
        <span aria-hidden="true">←</span>
        <span>Back to Case Prep</span>
      </Link>
    </section>
  );
}

function Items({ items, col, closed }: { items: RouteItem[]; col: string; closed?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col border-t border-ink/15 p-0">
      {items.map((it) => (
        <li
          key={it.section + it.title}
          className={cn("grid items-baseline gap-x-3 gap-y-0.5 border-b border-ink/15", closed ? "gap-x-3.5 py-3" : "py-2.5")}
          style={{ gridTemplateColumns: closed ? `${col} minmax(0,1fr) auto` : `${col} minmax(0,1fr)` }}
        >
          <span className="font-data text-[12.5px] leading-[1.6] font-medium text-seal">{it.section}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className={cn("leading-[1.4] font-bold", closed ? "text-[14.5px]" : "text-sm")}>{it.title}</strong>
            <span className={cn("leading-normal text-pretty text-ink-label", closed ? "text-[13.5px]" : "text-meta")}>{it.note}</span>
          </span>
          {closed && (
            <span className="border-[1.5px] border-seal px-1.75 pt-0.5 pb-px text-[10px] font-bold tracking-[0.16em] whitespace-nowrap text-seal uppercase">
              Closed
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
