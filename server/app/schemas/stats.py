# app/schemas/stats.py
from datetime import datetime

from pydantic import BaseModel

from app.models.case import CaseOutcome, Roles
from app.models.user import PartialScoring, SettledScoring


class OutcomeCounts(BaseModel):
    wins: int = 0
    losses: int = 0
    partials: int = 0
    settled: int = (
        0  # compromises the court recorded; in win_rate as settled_scoring says
    )
    total: int = 0
    win_rate: float = (
        0.0  # percent, 0-100, using the user's partial and settled scoring
    )


class RecentOutcome(BaseModel):
    cnr: str
    title: str
    role: Roles
    outcome: CaseOutcome
    decided_at: datetime


class MonthlyOutcomes(BaseModel):
    month: str  # "YYYY-MM"
    wins: int = 0
    losses: int = 0
    partials: int = 0
    settled: int = 0


class ActivityStats(BaseModel):
    arguments: int = 0
    witnesses_examined: int = 0
    conferences_held: int = 0
    evidence: int = 0
    avg_arguments: float = 0.0
    avg_witnesses_examined: float = 0.0
    avg_conferences_held: float = 0.0
    avg_evidence: float = 0.0


class NegotiatorStats(BaseModel):
    """The negotiator rating: the average of the last ten negotiation scores."""

    score: int | None = None
    tier: str | None = None
    scored: int = 0  # every case with a negotiation score
    factors: dict[str, int] = {}  # each factor, averaged over the same ten
    deals: int = 0  # scored negotiations that ended in a deal the court recorded
    offers_to_deal: float | None = None  # the user's offers per deal, on average
    days_to_settle: float | None = None  # first offer to the last signature, on average
    pending: int = 0  # resolved cases with talks whose analysis isn't generated yet


class UserStatsOut(BaseModel):
    partial_scoring: PartialScoring
    settled_scoring: SettledScoring = "exclude"
    overall: OutcomeCounts
    as_plaintiff: OutcomeCounts
    as_defendant: OutcomeCounts
    current_streak: int = 0
    best_streak: int = 0
    recent_form: list[RecentOutcome] = []
    monthly: list[MonthlyOutcomes] = []
    activity: ActivityStats
    # Resolved cases whose outcome has not been decided yet
    pending_outcomes: int = 0
    negotiator: NegotiatorStats = NegotiatorStats()
