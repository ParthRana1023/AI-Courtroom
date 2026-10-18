"""Erasing deleted accounts 30 days after deletion (as the Privacy Policy and
Terms promise), the warning 3 days before, and erasing single cases.

Everything here is safe to run twice: a purge interrupted half-way just finishes
on the next run, because the user record is removed last. Cloudinary never
blocks a deletion: images it can't remove yet are queued and retried daily.
"""

import asyncio
import html
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from beanie.operators import GT, LTE, Eq, In, Or

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case
from app.models.case_memory import CaseMemoryChunk
from app.models.case_outcome import CaseOutcomeRecord
from app.models.client_log import ClientLog
from app.models.feedback import Feedback
from app.models.otp import OTP
from app.models.rate_limit import RateLimitEntry
from app.models.report import Report
from app.models.user import User
from app.models.user_session import UserSession
from app.services.cloudinary_service import (
    delete_case_images,
    delete_image,
    extract_public_id_from_url,
)
from app.services.email import send_email
from app.services.rag import delete_case_memory

logger = get_logger(__name__)

NOTICE_BEFORE = timedelta(days=3)


def as_utc(at: datetime) -> datetime:
    """MongoDB hands datetimes back naive (in UTC)."""
    return at if at.tzinfo else at.replace(tzinfo=UTC)


def _cleanups():
    """Images Cloudinary couldn't delete yet; the daily job retries them."""
    return Case.get_pymongo_collection().database["image_cleanups"]


def _deleter(kind: str) -> Callable[[str], None]:
    """Looked up on each call (not stored in a dict) so tests can replace them."""
    return delete_case_images if kind == "case" else delete_image


async def delete_or_queue(kind: str, ref: str) -> None:
    """Delete a case's image folder ("case", ref = CNR) or one image ("image",
    ref = public id). If Cloudinary fails (outage, revoked key), queue it for the
    daily job instead of failing the deletion the user asked for."""
    try:
        await asyncio.to_thread(_deleter(kind), ref)
    except Exception:  # any failure (network, auth, outage) queues it
        logger.warning(
            f"Cloudinary delete of {kind} {ref} failed; queued for retry",
            exc_info=True,
        )
        await _cleanups().update_one(
            {"_id": f"{kind}:{ref}"},
            {"$setOnInsert": {"kind": kind, "ref": ref, "since": datetime.now(UTC)}},
            upsert=True,
        )


async def retry_image_cleanups(now: datetime, dry_run: bool = False) -> dict[str, int]:
    """Daily step: try every queued image delete again; done ones leave the queue."""
    pending = await _cleanups().find({}).to_list(None)
    done = 0
    for item in pending:
        if dry_run:
            continue
        try:
            await asyncio.to_thread(_deleter(item["kind"]), item["ref"])
        except Exception:  # stays queued for the next run
            logger.warning(
                f"Cloudinary retry of {item['_id']} failed again", exc_info=True
            )
            continue
        await _cleanups().delete_one({"_id": item["_id"]})
        done += 1
    return {"image_cleanups_pending": len(pending), "image_cleanups_done": done}


async def purge_case(case: Case) -> None:
    """Remove a case for good: its evidence images (queued if Cloudinary is
    unavailable), its RAG memory, then the case."""
    if any(e.image_public_id or e.image_url for e in case.evidence):
        await delete_or_queue("case", case.cnr)
    await delete_case_memory(case)
    await case.delete()


def _identifiers(user: User) -> tuple[list[str], list[str]]:
    """(addresses the user can be reached or keyed by, phone numbers as stored)."""
    phones = [user.phone_number] if user.phone_number else []
    keys = [k for k in (user.email, user.pending_email, user.google_email) if k]
    if user.phone_code and user.phone_number:
        keys.append(f"+{user.phone_code}{user.phone_number}")
    return keys, phones


async def purge_user(user: User) -> None:
    """Erase one account and everything it owns, on time even if Cloudinary is
    down: its images are queued and the daily job finishes them."""
    assert user.id is not None
    photo = (
        extract_public_id_from_url(user.profile_photo_url)
        if user.profile_photo_url
        else None
    )
    if photo:
        await delete_or_queue("image", photo)
    for case in await Case.find(Case.user_id == user.id).to_list():
        await purge_case(case)

    uid = str(user.id)
    keys, phones = _identifiers(user)
    await CaseMemoryChunk.find(CaseMemoryChunk.user_id == user.id).delete()
    await CaseOutcomeRecord.find(CaseOutcomeRecord.user_id == user.id).delete()
    await UserSession.find(UserSession.user_id == user.id).delete()
    await Report.find(Report.user_id == user.id).delete()
    await ClientLog.find(ClientLog.user_id == uid).delete()
    await OTP.find(In(OTP.email, keys)).delete()
    await RateLimitEntry.find(In(RateLimitEntry.user_id, [uid, *keys])).delete()
    # Contact messages stay for support history, without anything that identifies them.
    await Feedback.find(
        Or(
            Feedback.user_id == uid,
            In(Feedback.email, keys),
            In(Feedback.account_identifier, keys),
            In(Feedback.phone_number, phones),
        )
    ).update_many(
        {
            "$set": {
                field: None
                for field in (
                    "user_id",
                    "first_name",
                    "last_name",
                    "name",
                    "email",
                    "phone_number",
                    "account_identifier",
                    "ip",
                    "deleted_on",
                )
            }
        }
    )
    await user.delete()


async def purge_due_users(now: datetime, dry_run: bool = False) -> dict[str, int]:
    """Erase every account deleted more than DELETION_GRACE ago."""
    due = await User.find(LTE(User.deleted_at, now - User.DELETION_GRACE)).to_list()
    purged = failed = 0
    for user in due:
        if dry_run:
            continue
        try:
            await purge_user(user)
            purged += 1
        except Exception:
            # No personal data in the log: the id is enough to find it again.
            logger.exception(f"Purge failed for user {user.id}; retrying next run")
            failed += 1
    return {"purge_due": len(due), "purged": purged, "purge_failed": failed}


async def send_purge_notices(now: datetime, dry_run: bool = False) -> dict[str, int]:
    """Email accounts that will be erased within NOTICE_BEFORE, once each."""
    window_start = now - User.DELETION_GRACE
    users = await User.find(
        LTE(User.deleted_at, window_start + NOTICE_BEFORE),
        GT(User.deleted_at, window_start),
        Eq(User.purge_notice_sent_at, None),
    ).to_list()
    sent = 0
    for user in users:
        if not user.email or dry_run:
            continue
        at = as_utc(user.recoverable_until or now)
        erase_on = f"{at.day} {at:%B %Y}"
        if await send_email(
            user.email,
            "Your account will be erased soon - AI Courtroom",
            _notice_body(erase_on),
        ):
            await User.find_one(User.id == user.id).update_one(
                {"$set": {"purge_notice_sent_at": now}}
            )
            sent += 1
    return {"purge_notices_due": len(users), "purge_notices_sent": sent}


def _notice_body(erase_on: str) -> str:
    site = settings.app_url_for(None)
    return f"""
    <html>
    <body>
        <h2>AI Courtroom - Your account will be erased</h2>
        <p>Your account was deleted and will be erased for good on
        <strong>{html.escape(erase_on)}</strong>, with its cases, profile and photos.</p>
        <p>To keep it, <a href="{site}/contact?cat=account_recovery">ask us to recover it</a>
        before then.</p>
        <p>If you meant to delete it, you don't need to do anything.</p>
    </body>
    </html>
    """
