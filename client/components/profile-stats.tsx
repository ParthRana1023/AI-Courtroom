"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  FileText,
  Flame,
  Loader2,
  MessageSquare,
  Scale,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { authAPI } from "@/lib/api";
import { getLogger } from "@/lib/logger";
import type { OutcomeCounts, UserStats } from "@/types";
import { OUTCOME_LABEL } from "@/components/outcome-badge";

const logger = getLogger("cases");

const SCORING_NOTE = {
  zero: "Partial wins count as losses",
  half: "Partial wins count as half a win",
  exclude: "Partial wins are left out",
} as const;

const CHIP_STYLE = {
  won: "bg-green-500",
  lost: "bg-red-500",
  partial: "bg-amber-500",
} as const;

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 ${className}`}
    >
      {children}
    </div>
  );
}

function WinRing({ rate }: { rate: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img">
      <title>{`Win rate ${rate}%`}</title>
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        strokeWidth="10"
        className="stroke-zinc-200 dark:stroke-zinc-700"
      />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - rate / 100)}
        transform="rotate(-90 50 50)"
        className="stroke-green-500 transition-all duration-700"
      />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        className="fill-zinc-800 dark:fill-zinc-100 text-[18px] font-bold"
      >
        {Math.round(rate)}%
      </text>
    </svg>
  );
}

function OutcomeBar({ counts }: { counts: OutcomeCounts }) {
  if (!counts.total) {
    return <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />;
  }
  const part = (n: number) => `${(100 * n) / counts.total}%`;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
      <div className="bg-green-500" style={{ width: part(counts.wins) }} />
      <div className="bg-amber-500" style={{ width: part(counts.partials) }} />
      <div className="bg-red-500" style={{ width: part(counts.losses) }} />
    </div>
  );
}

function RoleCard({
  title,
  icon,
  counts,
}: {
  title: string;
  icon: React.ReactNode;
  counts: OutcomeCounts;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {icon}
          {title}
        </span>
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {counts.total ? `${counts.win_rate}%` : "—"}
        </span>
      </div>
      <OutcomeBar counts={counts} />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {counts.wins} won · {counts.losses} lost · {counts.partials} partial
      </p>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </Card>
  );
}

function MonthlyTrend({ stats }: { stats: UserStats }) {
  const max = Math.max(
    1,
    ...stats.monthly.map((m) => m.wins + m.losses + m.partials),
  );
  const monthName = (key: string) =>
    new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
    });
  return (
    <Card>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
        Last 6 months
      </p>
      <div className="flex items-end justify-between gap-2 h-28">
        {stats.monthly.map((m) => {
          const total = m.wins + m.losses + m.partials;
          const height = (n: number) => `${(100 * n) / max}%`;
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center h-full"
            >
              <div
                className="w-full max-w-8 flex-1 flex flex-col justify-end"
                title={`${m.wins} won, ${m.losses} lost, ${m.partials} partial`}
              >
                <div
                  className="bg-red-500 rounded-t-sm"
                  style={{ height: height(m.losses) }}
                />
                <div
                  className="bg-amber-500"
                  style={{ height: height(m.partials) }}
                />
                <div
                  className="bg-green-500 rounded-b-sm"
                  style={{ height: height(m.wins) }}
                />
                {total === 0 && (
                  <div className="h-0.5 bg-zinc-200 dark:bg-zinc-700" />
                )}
              </div>
              <span className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                {monthName(m.month)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function ProfileStats() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    authAPI
      .getProfileStats()
      .then(setStats)
      .catch((err: unknown) => {
        logger.error("Failed to load profile stats", err as Error);
        setError("Could not load your stats. Please try again later.");
      });
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center">
        <AlertCircle className="h-5 w-5 mr-2 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-10 text-zinc-500 dark:text-zinc-400">
        <Loader2 className="animate-spin h-6 w-6 mr-2" />
        Loading your record...
      </div>
    );
  }

  const { overall, activity } = stats;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center text-zinc-800 dark:text-zinc-100">
        <Trophy className="h-5 w-5 mr-2 text-zinc-500 dark:text-zinc-400" />
        Your Record
      </h2>

      {stats.pending_outcomes > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          {stats.pending_outcomes} resolved{" "}
          {stats.pending_outcomes === 1 ? "case is" : "cases are"} waiting for
          an outcome. Opening a case&apos;s analysis decides it.
        </p>
      )}

      {overall.total === 0 ? (
        <Card className="text-center py-8">
          <p className="text-zinc-500 dark:text-zinc-400">
            No decided cases yet. Finish a case to start your record.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="flex items-center gap-4">
              <WinRing rate={overall.win_rate} />
              <div className="min-w-0">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Win rate
                </p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {overall.wins}W · {overall.losses}L · {overall.partials}P
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {overall.total} decided ·{" "}
                  {SCORING_NOTE[stats.partial_scoring]}
                </p>
              </div>
            </Card>
            <RoleCard
              title="As Plaintiff"
              icon={<Scale className="h-4 w-4" />}
              counts={stats.as_plaintiff}
            />
            <RoleCard
              title="As Defence"
              icon={<Shield className="h-4 w-4" />}
              counts={stats.as_defendant}
            />
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Stat
              icon={<Flame className="h-4 w-4" />}
              label="Current streak"
              value={stats.current_streak}
              sub={`Best: ${stats.best_streak}`}
            />
            <Stat
              icon={<MessageSquare className="h-4 w-4" />}
              label="Arguments made"
              value={activity.arguments}
              sub={`${activity.avg_arguments} per case`}
            />
            <Stat
              icon={<Users className="h-4 w-4" />}
              label="Witnesses examined"
              value={activity.witnesses_examined}
              sub={`${activity.conferences_held} client conferences`}
            />
            <Stat
              icon={<FileText className="h-4 w-4" />}
              label="Evidence handled"
              value={activity.evidence}
              sub={`${activity.avg_evidence} per case`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Recent form
              </p>
              <div className="flex flex-wrap gap-2">
                {stats.recent_form.map((r) => (
                  <Link
                    key={r.cnr}
                    href={`/dashboard/cases/${r.cnr}`}
                    title={`${r.title} — ${OUTCOME_LABEL[r.outcome]} as ${r.role}`}
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${CHIP_STYLE[r.outcome]} hover:opacity-80 transition-opacity`}
                  >
                    {OUTCOME_LABEL[r.outcome][0]}
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Newest first
              </p>
            </Card>
            <MonthlyTrend stats={stats} />
          </div>
        </>
      )}
    </div>
  );
}
