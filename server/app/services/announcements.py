"""Product-update emails: an announcement goes to everyone who switched
"Product updates" on, a batch per run so a mailbox's daily limit is respected."""

import html
from datetime import datetime

from beanie import PydanticObjectId

from app.config import settings
from app.logging_config import get_logger
from app.models.announcement import Announcement
from app.models.user import User
from app.services.notifications import send_optional_email
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)


def render_body(text: str, link_url: str | None, link_text: str) -> str:
    """Plain text to email HTML: blank lines split paragraphs; everything is
    escaped, so a developer's text can't inject markup."""
    paragraphs = [p.strip() for p in text.replace("\r\n", "\n").split("\n\n")]
    body = "".join(
        f"<p>{html.escape(p).replace(chr(10), '<br>')}</p>" for p in paragraphs if p
    )
    url = link_url or f"{settings.app_url_for(None)}/changelog"
    return f'{body}<p><a href="{html.escape(url, quote=True)}">{html.escape(link_text)}</a></p>'


async def _recipients(after: PydanticObjectId | None, limit: int) -> list[User]:
    """Opted-in, live accounts with an email, in id order after ``after``."""
    query: dict = {
        "deleted_at": None,
        "notification_prefs.product_updates": True,
        "email": {"$ne": None},
    }
    if after is not None:
        query["_id"] = {"$gt": after}
    return await User.find(query).sort("_id").limit(limit).to_list()


async def send_batch(announcement: Announcement, budget: int) -> int:
    """Send up to ``budget`` emails, saving progress after each so a crash resumes;
    returns how many were attempted."""
    users = await _recipients(announcement.last_user_id, budget)
    content = f"<h2>AI Courtroom - {html.escape(announcement.subject)}</h2>{announcement.body_html}"
    for user in users:
        if await send_optional_email(
            user, "product_updates", announcement.subject, content
        ):
            announcement.sent += 1
        else:
            announcement.failed += 1
        announcement.last_user_id = user.id
        await announcement.save()
    if len(users) < budget:
        announcement.finished_at = get_current_datetime()
        await announcement.save()
        logger.info(
            f"Announcement {announcement.id} finished: {announcement.sent} sent, "
            f"{announcement.failed} failed"
        )
    return len(users)


async def send_pending(now: datetime, dry_run: bool = False) -> dict[str, int]:
    """The daily share: unfinished announcements, oldest first, within the batch size."""
    pending = (
        await Announcement.find({"finished_at": None}).sort("created_at").to_list()
    )
    budget = settings.announcement_batch_size
    attempted = 0
    for announcement in pending:
        if dry_run or budget <= 0:
            break
        done = await send_batch(announcement, budget)
        budget -= done
        attempted += done
    return {"announcements_pending": len(pending), "announcement_emails": attempted}
