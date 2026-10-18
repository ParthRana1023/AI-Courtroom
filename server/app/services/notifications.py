"""Optional emails (case ready, hearing reminders, product updates): who gets
them, and the one-click way out.

Each one carries a signed unsubscribe token for one user and one kind of email,
used by the /unsubscribe page and by mail apps' one-click button (RFC 8058).
Security alerts are not sent through here: they always go out.
"""

import html
import os
import time
from typing import Literal, cast

import jwt

from app.config import settings
from app.models.user import User
from app.services.email import send_email

Kind = Literal["case_ready", "hearing_reminders", "product_updates"]
LABELS: dict[str, str] = {
    "case_ready": "Case ready",
    "hearing_reminders": "Hearing reminders",
    "product_updates": "Product updates",
}
UNSUBSCRIBE_TTL_SECONDS = 365 * 24 * 3600


def unsubscribe_token(user: User, kind: Kind) -> str:
    claims = {
        "purpose": "unsubscribe",
        "sub": str(user.id),
        "kind": kind,
        "exp": int(time.time()) + UNSUBSCRIBE_TTL_SECONDS,
    }
    return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)


def read_unsubscribe_token(token: str) -> tuple[str, Kind] | None:
    """(user id, kind) from a valid, unexpired unsubscribe token, or None."""
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.InvalidTokenError:
        return None
    if claims.get("purpose") != "unsubscribe" or claims.get("kind") not in LABELS:
        return None
    return str(claims["sub"]), cast(Kind, claims["kind"])


def api_base() -> str:
    """This API's public address, for the one-click unsubscribe link. Render sets
    RENDER_EXTERNAL_URL; PUBLIC_API_URL overrides it."""
    url = settings.public_api_url or os.environ.get("RENDER_EXTERNAL_URL")
    return (url or "http://localhost:8000").strip().rstrip("/")


def one_line(text: str) -> str:
    """Header-safe: AI-written titles must not carry line breaks into a subject."""
    return " ".join(text.split())


async def send_optional_email(
    user: User, kind: Kind, subject: str, content: str, site: str | None = None
) -> bool:
    """Send ``content`` (trusted HTML: escape anything user- or AI-written first)
    if this user has an email, isn't deleted and has ``kind`` switched on."""
    if not user.email or user.deleted_at or not getattr(user.notification_prefs, kind):
        return False
    site = site or settings.app_url_for(None)
    token = unsubscribe_token(user, kind)
    body = f"""
    <html>
    <body>
        {content}
        <p style="color:#6b5d4b;font-size:13px">You get this because "{LABELS[kind]}" is on.
        <a href="{site}/unsubscribe?token={token}">Unsubscribe</a> &middot;
        <a href="{site}/settings">Email settings</a></p>
    </body>
    </html>
    """
    one_click = f"{api_base()}/notifications/unsubscribe?token={token}"
    return await send_email(
        user.email,
        f"{one_line(subject)} - AI Courtroom",
        body,
        headers={
            "List-Unsubscribe": f"<{one_click}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )


async def send_case_ready_email(user: User, title: str, cnr: str, site: str) -> bool:
    """A generated case has finished drafting."""
    content = f"""
        <h2>AI Courtroom - Your case is ready</h2>
        <p><strong>{html.escape(title)}</strong> ({html.escape(cnr)}) has finished drafting.</p>
        <p><a href="{site}/cases/{cnr}">Open the case file</a></p>
    """
    return await send_optional_email(
        user, "case_ready", f"Your case is ready: {title}", content, site
    )
