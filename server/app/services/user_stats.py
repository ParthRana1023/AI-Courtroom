"""Win/loss and activity stats for the profile page, from the case_outcomes ledger."""

from app.models.case import Case, CaseOutcome, CaseStatus, Roles
from app.models.case_outcome import CaseOutcomeRecord
from app.models.user import PartialScoring, User
from app.schemas.stats import (
    ActivityStats,
    MonthlyOutcomes,
    OutcomeCounts,
    RecentOutcome,
    UserStatsOut,
)
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import ensure_ist_timezone

RECENT_FORM_SIZE = 10
TREND_MONTHS = 6


def win_rate(wins: int, losses: int, partials: int, scoring: PartialScoring) -> float:
    """Win percentage, counting partial successes as the user chose."""
    if scoring == "exclude":
        won, decided = wins, wins + losses
    else:
        won = wins + (0.5 * partials if scoring == "half" else 0)
        decided = wins + losses + partials
    return round(100 * won / decided, 1) if decided else 0.0


def count_outcomes(
    records: list[CaseOutcomeRecord], scoring: PartialScoring
) -> OutcomeCounts:
    wins = sum(r.outcome == CaseOutcome.WON for r in records)
    losses = sum(r.outcome == CaseOutcome.LOST for r in records)
    partials = sum(r.outcome == CaseOutcome.PARTIAL for r in records)
    return OutcomeCounts(
        wins=wins,
        losses=losses,
        partials=partials,
        total=len(records),
        win_rate=win_rate(wins, losses, partials, scoring),
    )


def win_streaks(records: list[CaseOutcomeRecord]) -> tuple[int, int]:
    """(current, best) runs of wins, oldest record first. A partial ends a run."""
    current = best = 0
    for record in records:
        current = current + 1 if record.outcome == CaseOutcome.WON else 0
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


async def compute_user_stats(user: User) -> UserStatsOut:
    # ponytail: loads every outcome row for the user; fine for hundreds of cases.
    # Switch to a $facet aggregation if a user ever has thousands.
    records = (
        await CaseOutcomeRecord.find(CaseOutcomeRecord.user_id == user.id)
        .sort("decided_at")
        .to_list()
    )
    scoring = user.partial_scoring
    current, best = win_streaks(records)

    # Deleted cases count too; only cases with a verdict can be decided.
    pending = await Case.find(
        Case.user_id == user.id,
        Case.status == CaseStatus.RESOLVED,
        Case.outcome == None,
        Case.verdict != None,
    ).count()

    return UserStatsOut(
        partial_scoring=scoring,
        overall=count_outcomes(records, scoring),
        as_plaintiff=count_outcomes(
            [r for r in records if r.role == Roles.PLAINTIFF], scoring
        ),
        as_defendant=count_outcomes(
            [r for r in records if r.role == Roles.DEFENDANT], scoring
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
    )
