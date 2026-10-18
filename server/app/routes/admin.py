# app/routes/admin.py
"""Support tools, open only to developer accounts (DEV_MODE_EMAILS)."""

import secrets

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl, field_validator

from app.config import settings
from app.dependencies import get_current_user
from app.logging_config import get_logger
from app.models.announcement import Announcement
from app.models.incident import COMPONENTS, Impact, Incident, IncidentUpdate
from app.models.user import User
from app.services import announcements
from app.services.auth import find_user_by_email
from app.services.daily_jobs import run_daily_jobs
from app.services.email import send_security_alert
from app.utils.datetime import get_current_datetime
from app.utils.llm_trace import is_developer

logger = get_logger(__name__)

router = APIRouter()


def require_developer(user: User = Depends(get_current_user)) -> User:
    if not is_developer(user.email):
        raise HTTPException(status_code=404, detail="Not Found")
    return user


def require_jobs_token(authorization: str = Header("")) -> None:
    """The scheduler's bearer token (JOBS_TOKEN). Without one configured the
    endpoint doesn't exist."""
    expected = settings.jobs_token
    given = authorization.removeprefix("Bearer ").strip()
    if not expected:
        raise HTTPException(status_code=404, detail="Not Found")
    if not secrets.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid jobs token.")


@router.post("/jobs/daily", dependencies=[Depends(require_jobs_token)])
async def daily_jobs(dry_run: bool = False):
    """Purge notices, the 30-day purge, hearing reminders and product-update
    batches. Called once a day by GitHub Actions; 409 if a run is in progress,
    500 if a step failed (so the workflow run shows red)."""
    run = await run_daily_jobs(dry_run=dry_run, trigger="http")
    if run is None:
        raise HTTPException(
            status_code=409, detail="The daily jobs are already running."
        )
    body = {"id": str(run.id), "counts": run.counts, "errors": run.errors}
    return JSONResponse(body, status_code=500 if run.errors else 200)


class AnnouncementIn(BaseModel):
    subject: str = Field(..., min_length=3, max_length=120)
    # Plain text; blank lines separate paragraphs. Escaped before sending.
    body: str = Field(..., min_length=10, max_length=5000)
    link_url: HttpUrl | None = None  # defaults to the Changelog
    link_text: str = Field("Read the changelog", max_length=60)


@router.post("/announcements", status_code=201)
async def post_announcement(
    body: AnnouncementIn,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_developer),
):
    """Email a product update to everyone with "Product updates" on. The first
    batch goes now; the rest go out with the daily jobs."""
    assert admin.id is not None
    announcement = Announcement(
        subject=body.subject,
        body_html=announcements.render_body(
            body.body, str(body.link_url) if body.link_url else None, body.link_text
        ),
        created_by=admin.id,
    )
    await announcement.insert()
    logger.info(f"Announcement {announcement.id} posted by {admin.id}")
    background_tasks.add_task(
        announcements.send_batch, announcement, settings.announcement_batch_size
    )
    return {"id": str(announcement.id)}


@router.post("/accounts/{account}/restore")
async def restore_account(
    account: str,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_developer),
):
    """Restore a deleted account within its 30 days. ``account`` is the user id
    or, as recovery requests arrive by email, the account's email."""
    if "@" in account:
        user = await find_user_by_email(account)
    else:
        try:
            user = await User.get(PydanticObjectId(account))
        except InvalidId:
            user = None
    if user is None or user.deleted_at is None:
        raise HTTPException(status_code=404, detail="No deleted account found.")
    until = user.recoverable_until
    if until is not None and get_current_datetime() > until:
        raise HTTPException(
            status_code=410, detail="The 30 days to recover it are over."
        )
    user.deleted_at = None
    user.purge_notice_sent_at = None  # a later deletion warns again
    await user.save()
    logger.info(f"Account {user.id} restored by {admin.id}")
    # Contact's recovery copy promises an email once the account is back.
    if user.email:
        background_tasks.add_task(
            send_security_alert,
            user.email,
            "Your account is back",
            [
                "Your deleted AI Courtroom account has been restored, with every case.",
                "You can sign in again as before.",
            ],
        )
    return {"restored": True, "id": str(user.id), "email": user.email}


class IncidentUpdateIn(BaseModel):
    kind: str = Field("Investigating", max_length=40)  # ... Monitoring, Resolved
    text: str = Field(..., min_length=1, max_length=1000)


class IncidentIn(IncidentUpdateIn):
    title: str = Field(..., min_length=1, max_length=200)
    impact: Impact
    components: list[str] = []

    @field_validator("components")
    @classmethod
    def known(cls, v: list[str]) -> list[str]:
        unknown = set(v) - set(COMPONENTS)
        if unknown:
            raise ValueError(f"Unknown components: {sorted(unknown)}; use {COMPONENTS}")
        return v


@router.post("/incidents", status_code=201)
async def post_incident(body: IncidentIn, admin: User = Depends(require_developer)):
    """Post an incident to the status page, with its first update."""
    incident = Incident(
        title=body.title,
        impact=body.impact,
        components=body.components,
        updates=[IncidentUpdate(kind=body.kind, text=body.text)],
    )
    await incident.insert()
    logger.info(f"Incident {incident.id} posted by {admin.id}")
    return {"id": str(incident.id)}


@router.post("/incidents/{incident_id}/updates")
async def update_incident(
    incident_id: str, body: IncidentUpdateIn, admin: User = Depends(require_developer)
):
    """Add an update; kind "Resolved" closes the incident."""
    try:
        incident = await Incident.get(PydanticObjectId(incident_id))
    except InvalidId:
        incident = None
    if incident is None:
        raise HTTPException(status_code=404, detail="No such incident.")
    update = IncidentUpdate(kind=body.kind, text=body.text)
    changes: dict = {"$push": {"updates": update.model_dump()}}
    if body.kind.lower() == "resolved":
        changes["$set"] = {"resolved_at": update.at}
    await Incident.find_one(Incident.id == incident.id).update_one(changes)
    logger.info(f"Incident {incident.id} updated ({body.kind}) by {admin.id}")
    return {"id": str(incident.id), "resolved": "$set" in changes}
