# app/routes/notifications.py
"""Unsubscribing from optional emails, with the signed token every one carries.
No sign-in: the /unsubscribe page and mail apps' one-click button (RFC 8058,
which POSTs "List-Unsubscribe=One-Click") both call POST."""

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from app.models.user import User
from app.services.notifications import LABELS, read_unsubscribe_token

router = APIRouter()

INVALID = (
    "This unsubscribe link is invalid or has expired. Change your emails in Settings."
)


async def _resolve(token: str) -> tuple[User | None, str]:
    found = read_unsubscribe_token(token)
    if found is None:
        raise HTTPException(status_code=400, detail=INVALID)
    user_id, kind = found
    try:
        user = await User.get(PydanticObjectId(user_id))
    except InvalidId:
        raise HTTPException(status_code=400, detail=INVALID) from None
    return user, kind


@router.get("/unsubscribe")
async def unsubscribe_status(token: str = Query(...)):
    """What the link would turn off, and whether it's still on."""
    user, kind = await _resolve(token)
    on = bool(user and getattr(user.notification_prefs, kind))
    return {"kind": kind, "label": LABELS[kind], "subscribed": on}


@router.post("/unsubscribe")
async def unsubscribe(token: str = Query(...)):
    """Turn that email off. Already off, or the account gone, still succeeds."""
    user, kind = await _resolve(token)
    if user is not None:
        # Atomic, so it can't undo a Settings save made at the same moment.
        await User.find_one(User.id == user.id).update_one(
            {"$set": {f"notification_prefs.{kind}": False}}
        )
    return {"kind": kind, "label": LABELS[kind], "subscribed": False}
