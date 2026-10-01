# app/schemas/stats.py
from datetime import datetime

from pydantic import BaseModel

from app.models.case import CaseOutcome, Roles
from app.models.user import PartialScoring


class OutcomeCounts(BaseModel):
    wins: int = 0
    losses: int = 0
    partials: int = 0
    total: int = 0
    win_rate: float = 0.0  # percent, 0-100, using the user's partial scoring


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


class ActivityStats(BaseModel):
    arguments: int = 0
    witnesses_examined: int = 0
    conferences_held: int = 0
    evidence: int = 0
    avg_arguments: float = 0.0
    avg_witnesses_examined: float = 0.0
    avg_conferences_held: float = 0.0
    avg_evidence: float = 0.0


class UserStatsOut(BaseModel):
    partial_scoring: PartialScoring
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
