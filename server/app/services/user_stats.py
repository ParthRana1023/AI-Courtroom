"""Win/loss and activity stats for the profile page, from the case_outcomes ledger."""

from app.models.case import Case, CaseOutcome, CaseStatus, Roles
from app.models.case_outcome import CaseOutcomeRecord
from app.models.user import PartialScoring, SettledScoring, User
from app.schemas.stats import (
    ActivityStats,
    MonthlyOutcomes,
    NegotiatorStats,
    OutcomeCounts,
    RecentOutcome,
    UserStatsOut,
)
from app.services.case_outcomes import record_negotiation
from app.services.llm.settlement import tier
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import ensure_ist_timezone

RECENT_FORM_SIZE = 10
TREND_MONTHS = 6
RATING_SIZE = 10  # the negotiator rating averages this many latest scores
SCORE_FOR_WIN = 70  # settled_scoring "score": a settled case at or above it is a win


def win_rate(wins: int, losses: int, partials: int, scoring: PartialScoring) -> float:
    """Win percentage, counting partial successes as the user chose."""
    if scoring == "exclude":
        won, decided = wins, wins + losses
    else:
        won = wins + (0.5 * partials if scoring == "half" else 0)
        decided = wins + losses + partials
    return round(100 * won / decided, 1) if decided else 0.0


def counted_as(
    record: CaseOutcomeRecord, settled: SettledScoring
) -> CaseOutcome | None:
    """What a case counts as in the win rate and streaks; None leaves it out.

    A settled case is left out, always a win, or a win or loss by its negotiator
    score (left out until the negotiation analysis scores it).
    """
    if record.outcome != CaseOutcome.SETTLED:
        return record.outcome
    if settled == "win":
        return CaseOutcome.WON
    if settled == "score" and record.negotiation_score is not None:
        won = record.negotiation_score >= SCORE_FOR_WIN
        return CaseOutcome.WON if won else CaseOutcome.LOST
    return None


def count_outcomes(
    records: list[CaseOutcomeRecord],
    scoring: PartialScoring,
    settled: SettledScoring = "exclude",
) -> OutcomeCounts:
    counted = [counted_as(r, settled) for r in records]
    wins = counted.count(CaseOutcome.WON)
    losses = counted.count(CaseOutcome.LOST)
    partials = counted.count(CaseOutcome.PARTIAL)
    return OutcomeCounts(
        wins=wins,
        losses=losses,
        partials=partials,
        settled=sum(r.outcome == CaseOutcome.SETTLED for r in records),
        total=len(records),
        win_rate=win_rate(wins, losses, partials, scoring),
    )


def win_streaks(
    records: list[CaseOutcomeRecord], settled: SettledScoring = "exclude"
) -> tuple[int, int]:
    """(current, best) runs of wins, oldest record first. A partial ends a run;
    a settled case left out of the win rate neither extends nor ends one."""
    current = best = 0
    for record in records:
        outcome = counted_as(record, settled)
        if outcome is None:
            continue
        current = current + 1 if outcome == CaseOutcome.WON else 0
        best = max(best, current)
    return current, best


def last_months(count: int) -> list[str]:
    """The last ``count`` months as "YYYY-MM", oldest first, ending this month."""
    now = get_current_datetime()
    year, month = now.year, now.month
    months = []
    for _ in range(count):
        months.append(f"{year:04d}-{month:02d}")
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return months[::-1]


def monthly_trend(records: list[CaseOutcomeRecord]) -> list[MonthlyOutcomes]:
    buckets = {
        month: MonthlyOutcomes(month=month) for month in last_months(TREND_MONTHS)
    }
    field = {
        CaseOutcome.WON: "wins",
        CaseOutcome.LOST: "losses",
        CaseOutcome.PARTIAL: "partials",
        CaseOutcome.SETTLED: "settled",
    }
    for record in records:
        bucket = buckets.get(ensure_ist_timezone(record.decided_at).strftime("%Y-%m"))
        if bucket:
            name = field[record.outcome]
            setattr(bucket, name, getattr(bucket, name) + 1)
    return list(buckets.values())


def activity(records: list[CaseOutcomeRecord]) -> ActivityStats:
    totals = {
        "arguments": sum(r.arguments_count for r in records),
        "witnesses_examined": sum(r.witnesses_examined for r in records),
        "conferences_held": sum(r.conferences_held for r in records),
        "evidence": sum(r.evidence_count for r in records),
    }
    n = len(records)
    averages = {
        f"avg_{name}": round(value / n, 1) if n else 0.0
        for name, value in totals.items()
    }
    return ActivityStats(**totals, **averages)


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def negotiator(records: list[CaseOutcomeRecord], pending: int) -> NegotiatorStats:
    """The negotiator rating from the scored cases, oldest record first."""
    scored = [r for r in records if r.negotiation_score is not None]
    if not scored:
        return NegotiatorStats(pending=pending)
    latest = scored[-RATING_SIZE:]
    score = round(sum(r.negotiation_score or 0 for r in latest) / len(latest))
    keys = {key for r in latest for key in r.negotiation_factors}
    deals = [r for r in scored if r.outcome == CaseOutcome.SETTLED]
    return NegotiatorStats(
        score=score,
        tier=tier(score),
        scored=len(scored),
        factors={
            key: round(
                _mean(
                    [
                        r.negotiation_factors[key]
                        for r in latest
                        if key in r.negotiation_factors
                    ]
                )
                or 0
            )
            for key in sorted(keys)
        },
        deals=len(deals),
        offers_to_deal=_mean(
            [r.offers_to_deal for r in deals if r.offers_to_deal is not None]
        ),
        days_to_settle=_mean(
            [r.days_to_settle for r in deals if r.days_to_settle is not None]
        ),
        pending=pending,
    )


async def _records(user: User) -> list[CaseOutcomeRecord]:
    return (
        await CaseOutcomeRecord.find(CaseOutcomeRecord.user_id == user.id)
        .sort("decided_at")
        .to_list()
    )


async def compute_user_stats(user: User) -> UserStatsOut:
    # ponytail: loads every outcome row for the user; fine for hundreds of cases.
    # Switch to a $facet aggregation if a user ever has thousands.
    records = await _records(user)
    # A score generated before the ledger kept scores (or whose copy failed) is
    # copied in now, so the rating never misses a scored case.
    unscored = [r.case_id for r in records if r.negotiation_score is None]
    missed = await Case.find(
        {"_id": {"$in": unscored}, "negotiation": {"$ne": None}}
    ).to_list()
    for case in missed:
        await record_negotiation(case)
    if missed:
        records = await _records(user)
    scoring = user.partial_scoring
    settled = user.settled_scoring
    current, best = win_streaks(records, settled)

    # Deleted cases count too; only cases with a verdict can be decided.
    pending = await Case.find(
        Case.user_id == user.id,
        Case.status == CaseStatus.RESOLVED,
        Case.outcome == None,
        Case.verdict != None,
    ).count()
    # Talks the user took part in, on a decided case not yet scored. Opening the
    # negotiation analysis scores it; an archived case can't be opened.
    unscored = await Case.find(
        Case.user_id == user.id,
        Case.status == CaseStatus.RESOLVED,
        Case.negotiation == None,
        {"settlements.entries.by": "user", "is_deleted": {"$ne": True}},
    ).count()

    return UserStatsOut(
        partial_scoring=scoring,
        settled_scoring=settled,
        overall=count_outcomes(records, scoring, settled),
        as_plaintiff=count_outcomes(
            [r for r in records if r.role == Roles.PLAINTIFF], scoring, settled
        ),
        as_defendant=count_outcomes(
            [r for r in records if r.role == Roles.DEFENDANT], scoring, settled
        ),
        current_streak=current,
        best_streak=best,
        recent_form=[
            RecentOutcome(
                cnr=r.cnr,
                title=r.title,
                role=r.role,
                outcome=r.outcome,
                decided_at=r.decided_at,
            )
            for r in reversed(records[-RECENT_FORM_SIZE:])
        ],
        monthly=monthly_trend(records),
        activity=activity(records),
        pending_outcomes=pending,
        negotiator=negotiator(records, unscored),
    )
