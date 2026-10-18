from datetime import datetime

from beanie import Document
from pydantic import Field

from app.utils.datetime import get_current_datetime


class JobRun(Document):
    """One run of the daily jobs: counts and error summaries only, never personal data."""

    started_at: datetime = Field(default_factory=get_current_datetime)
    finished_at: datetime | None = None
    dry_run: bool = False
    trigger: str = "script"  # script or http
    counts: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)

    class Settings:
        name = "job_runs"
