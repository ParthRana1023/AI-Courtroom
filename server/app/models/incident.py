from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import BaseModel, Field

from app.utils.datetime import get_current_datetime

# The services listed on the status page, in order.
COMPONENTS = ("web", "auth", "gen", "court", "analysis", "db")

Impact = Literal["degraded", "outage"]


class IncidentUpdate(BaseModel):
    at: datetime = Field(default_factory=get_current_datetime)
    kind: str  # Investigating, Identified, Monitoring or Resolved
    text: str


class Incident(Document):
    """A problem posted to the status page by support (POST /admin/incidents)."""

    title: str
    impact: Impact
    components: list[str] = Field(default_factory=list)
    updates: list[IncidentUpdate] = Field(default_factory=list)  # oldest first
    created_at: datetime = Field(default_factory=get_current_datetime)
    resolved_at: datetime | None = None

    class Settings:
        name = "incidents"
