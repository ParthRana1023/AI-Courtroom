# app/routes/admin.py
"""Support tools, open only to developer accounts (DEV_MODE_EMAILS)."""

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.logging_config import get_logger
from app.models.user import User
from app.services.auth import find_user_by_email
from app.utils.datetime import get_current_datetime
from app.utils.llm_trace import is_developer

logger = get_logger(__name__)

router = APIRouter()


def require_developer(user: User = Depends(get_current_user)) -> User:
    if not is_developer(user.email):
        raise HTTPException(status_code=404, detail="Not Found")
    return user


@router.post("/accounts/{account}/restore")
async def restore_account(account: str, admin: User = Depends(require_developer)):
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
    await user.save()
    logger.info(f"Account {user.id} restored by {admin.id}")
    return {"restored": True, "id": str(user.id), "email": user.email}
