# app/dependencies.py

import jwt
from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app import messages
from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case
from app.models.user import User

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


async def get_owned_case(cnr: str, user: User, *filters) -> Case:
    """Load a case by CNR that belongs to ``user``: 404 if missing, 403 if not theirs."""
    case = await Case.find_one(Case.cnr == cnr, *filters)
    if not case:
        raise HTTPException(status_code=404, detail=messages.CASE_NOT_FOUND)
    if str(case.user_id) != str(user.id):
        logger.warning(f"User {user.email} denied access to case {cnr}")
        raise HTTPException(status_code=403, detail=messages.CASE_FORBIDDEN)
    return case
