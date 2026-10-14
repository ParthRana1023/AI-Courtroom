# app/routes/status.py
"""The public status page: each service's health and the last 90 days' incidents."""

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app.logging_config import get_logger
from app.models.incident import COMPONENTS, Incident
from app.services import health
from app.utils.datetime import get_current_datetime
from app.utils.llm import task_configured

logger = get_logger(__name__)

router = APIRouter()

COMPONENT_TASKS = {
    "gen": ("drafter",),
    "court": ("lawyer", "judge", "party", "witness"),
    "analysis": ("analyzer", "outcome"),
}
INCIDENT_DAYS = 90
_RANK = {"ok": 0, "degraded": 1, "outage": 2}


def _iso(at: datetime) -> str:
    """MongoDB returns naive UTC; say so, or browsers read it as local time."""
    return (at if at.tzinfo else at.replace(tzinfo=UTC)).isoformat()


def _worse(a: str, b: str) -> str:
    return a if _RANK[a] >= _RANK[b] else b


async def _db_ok() -> bool:
    try:
        await asyncio.wait_for(Incident.find_one(), timeout=3)
        return True
    except Exception:
        logger.exception("Status check: database unreachable")
        return False


@router.get("")
async def get_status():
    # Answering at all means the website and app are up.
    states = {c: "ok" if c == "web" else health.state(c) for c in COMPONENTS}
    for component, tasks in COMPONENT_TASKS.items():
        if not all(task_configured(task) for task in tasks):
            states[component] = "outage"

    if not await _db_ok():
        # Every service reads or writes the database.
        states = {c: "degraded" if c == "web" else "outage" for c in COMPONENTS}
        incidents: list[Incident] = []
    else:
        since = get_current_datetime() - timedelta(days=INCIDENT_DAYS)
        incidents = (
            await Incident.find(
                {"$or": [{"resolved_at": None}, {"created_at": {"$gte": since}}]}
            )
            .sort("-created_at")
            .to_list()
        )

    for incident in incidents:
        if incident.resolved_at is None:
            for c in incident.components:
                if c in states:
                    states[c] = _worse(states[c], incident.impact)

    return {
        "updated_at": get_current_datetime().isoformat(),
        "components": [{"id": c, "status": states[c]} for c in COMPONENTS],
        "incidents": [
            {
                "id": str(i.id),
                "title": i.title,
                "impact": i.impact,
                "status": i.updates[-1].kind if i.updates else "Investigating",
                "resolved": i.resolved_at is not None,
                "updates": [
                    {"at": _iso(u.at), "kind": u.kind, "text": u.text}
                    for u in reversed(i.updates)
                ],
            }
            for i in incidents
        ],
    }
