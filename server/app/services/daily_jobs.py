"""The daily jobs, run once a day by .github/workflows/daily-jobs.yml (through
POST /admin/jobs/daily) or by hand with `python -m scripts.daily_jobs`:

1. warn accounts 3 days before they are erased;
2. erase accounts deleted more than 30 days ago;
3. remind owners of cases adjourned for 7 days;
4. catch settlement payments up (settlement_progress), telling owners what happened;
5. send the day's share of product-update emails.

Every step only acts on what is still due, so running twice is harmless; a lock
keeps two runs from overlapping.
"""

import html
import uuid
from datetime import datetime, timedelta

from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case, CaseStatus
from app.models.job_run import JobRun
from app.models.user import User
from app.services import announcements, purge, settlement_progress
from app.services.notifications import send_optional_email
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)

REMIND_AFTER = timedelta(days=7)
LOCK_TTL = timedelta(hours=1)  # a crashed run frees the lock after this


def _locks():
    return JobRun.get_pymongo_collection().database["job_locks"]


async def _acquire_lock(now: datetime) -> str | None:
    """Take the lock unless another run holds a live one, and return this run's
    token for it. The upsert can only insert when no lock document exists, so a
    held lock raises DuplicateKeyError."""
    owner = uuid.uuid4().hex
    try:
        await _locks().update_one(
            {"_id": "daily", "until": {"$lt": now}},
            {"$set": {"until": now + LOCK_TTL, "owner": owner}},
            upsert=True,
        )
        return owner
    except DuplicateKeyError:
        return None


async def _renew_lock(owner: str) -> None:
    """Keep the lock while a long run goes on, so no second run starts mid-way."""
    await _locks().update_one(
        {"_id": "daily", "owner": owner},
        {"$set": {"until": get_current_datetime() + LOCK_TTL}},
    )


async def _release_lock(owner: str) -> None:
    # Deleted rather than set to "now": MongoDB keeps milliseconds, so a run
    # starting in the same millisecond would still see the lock as held. Only this
    # run's: one that overran its lock mustn't free the next run's.
    await _locks().delete_one({"_id": "daily", "owner": owner})


def last_activity(case: Case) -> datetime | None:
    """When the record last moved: its newest proceeding (argument, ruling or the
    court's own adjournment line)."""
    times = [purge.as_utc(e.timestamp) for e in case.courtroom_proceedings]
    return max(times) if times else None


async def send_hearing_reminders(
    now: datetime, dry_run: bool = False
) -> dict[str, int]:
    """One reminder per adjournment, once the record has been idle REMIND_AFTER."""
    cases = await Case.find(
        Case.status == CaseStatus.ADJOURNED, Case.is_deleted == False
    ).to_list()
    owners: dict[str, User | None] = {}
    due = sent = 0
    site = settings.app_url_for(None)
    for case in cases:
        last = last_activity(case)
        if last is None or now - last < REMIND_AFTER:
            continue
        if case.reminder_sent_at and purge.as_utc(case.reminder_sent_at) >= last:
            continue  # already reminded since the court last sat
        due += 1
        if dry_run:
            continue
        key = str(case.user_id)
        if key not in owners:
            owners[key] = await User.get(case.user_id)
        user = owners[key]
        if user is None:
            continue
        content = f"""
            <h2>AI Courtroom - Your hearing is waiting</h2>
            <p><strong>{html.escape(case.title or case.cnr)}</strong> has been adjourned since
            {last.day} {last:%B %Y}. The court will sit again whenever you're ready.</p>
            <p><a href="{site}/cases/{case.cnr}/courtroom">Resume hearing &rarr;</a></p>
        """
        if await send_optional_email(
            user,
            "hearing_reminders",
            f"Your hearing is waiting: {case.title or case.cnr}",
            content,
            site,
        ):
            # Atomic: a full save could undo an argument the user files meanwhile.
            await Case.find_one(Case.id == case.id).update_one(
                {"$set": {"reminder_sent_at": now}}
            )
            sent += 1
    return {"reminders_due": due, "reminders_sent": sent}


STEPS = (
    ("purge_notices", purge.send_purge_notices),
    ("purge", purge.purge_due_users),
    ("image_cleanups", purge.retry_image_cleanups),
    ("hearing_reminders", send_hearing_reminders),
    ("settlement_payments", settlement_progress.progress_settlements),
    ("announcements", announcements.send_pending),
)


async def run_daily_jobs(
    dry_run: bool = False, trigger: str = "script"
) -> JobRun | None:
    """Run every step; None if another run holds the lock. A failing step is
    recorded (by name and error type, no personal data) and the rest still run."""
    now = get_current_datetime()
    owner = await _acquire_lock(now)
    if owner is None:
        logger.warning("Daily jobs already running; skipped")
        return None
    run = JobRun(dry_run=dry_run, trigger=trigger, started_at=now)
    await run.insert()
    try:
        for name, step in STEPS:
            await _renew_lock(owner)
            try:
                run.counts.update(await step(now, dry_run))
            except Exception as e:
                logger.exception(f"Daily job step {name} failed")
                run.errors.append(f"{name}: {type(e).__name__}")
        run.finished_at = get_current_datetime()
        await run.save()
        logger.info(f"Daily jobs done: {run.counts} errors={run.errors}")
        return run
    finally:
        await _release_lock(owner)
