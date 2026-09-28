# app/dependencies.py

from dataclasses import dataclass
from datetime import UTC, datetime

import jwt
from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from app import messages
from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case, CaseStatus
from app.models.user import User
from app.utils.locks import case_lock

logger = get_logger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            logger.warning("Token validation failed - no user_id in payload")
            raise credentials_exception
    except jwt.InvalidTokenError as e:
        logger.warning(f"Token validation failed - JWT error: {e!s}")
        raise credentials_exception

    # Try to find the user by email first (since sub might be email)
    user = await User.find_one(User.email == user_id)

    # If not found by email, try by ID
    if user is None:
        try:
            # Only convert to ObjectId if it's not an email
            if "@" not in user_id:
                user = await User.find_one(User.id == PydanticObjectId(user_id))
        except Exception as e:
            logger.warning(f"Token validation failed - user lookup error: {e!s}")
            raise credentials_exception from e

    if user is None:
        logger.warning(f"Token validation failed - user not found: {user_id}")
        raise credentials_exception

    logger.debug(f"User authenticated via token: {user.email}")
    return user


@dataclass(frozen=True)
class Session:
    """The login session behind a request (one per device login)."""

    id: str | None  # None for tokens issued before sessions existed
    expires_at: datetime


def get_session(token: str = Depends(oauth2_scheme)) -> Session:
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    return Session(payload.get("sid"), datetime.fromtimestamp(payload["exp"], UTC))


async def get_owned_case(cnr: str, user: User, *filters) -> Case:
    """Load a case by CNR that belongs to ``user``: 404 if missing, 403 if not theirs.

    A hearing whose login session has expired is adjourned on the way.
    """
    case = await Case.find_one(Case.cnr == cnr, *filters)
    if not case:
        raise HTTPException(status_code=404, detail=messages.CASE_NOT_FOUND)
    if str(case.user_id) != str(user.id):
        logger.warning(f"User {user.email} denied access to case {cnr}")
        raise HTTPException(status_code=403, detail=messages.CASE_FORBIDDEN)
    if case.status == CaseStatus.ACTIVE and case.session_expired():
        logger.info(f"Adjourning case {cnr}: its login session expired")
        case.adjourn(by_session_end=True)
        await case.save()
    return case


async def courtroom_control(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """For routes that change a hearing: one request per case at a time, and
    only from the device running the hearing (other devices must take over).

    An unclaimed running hearing is claimed for this device.
    """
    cnr = request.path_params.get("cnr") or request.path_params["case_cnr"]
    async with case_lock(cnr):
        case = await Case.find_one(Case.cnr == cnr)
        if (
            case
            and str(case.user_id) == str(current_user.id)
            and case.status == CaseStatus.ACTIVE
            and not case.session_expired()
        ):
            if case.active_session_id is None:
                await Case.find_one(Case.id == case.id).update_one(
                    {
                        "$set": {
                            "active_session_id": session.id,
                            "active_session_expires_at": session.expires_at,
                        }
                    }
                )
            elif case.active_session_id != session.id:
                raise HTTPException(
                    status_code=409, detail=messages.HEARING_ON_OTHER_DEVICE
                )
        yield
