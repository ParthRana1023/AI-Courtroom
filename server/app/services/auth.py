# app/services/auth.py
import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status

from app.config import settings
from app.logging_config import get_logger
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.user import UserCreate
from app.utils.datetime import create_jwt_expiry, get_current_datetime

logger = get_logger(__name__)

ph = PasswordHasher()


async def find_user_by_email(email: str) -> User | None:
    """Find a user by email regardless of case.

    New emails are stored lowercase; accounts created earlier may not be.
    """
    normalized = email.strip().lower()
    user = await User.find_one(User.email == normalized)
    if user is None:
        user = await User.find_one(
            {"email": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}}
        )
    return user


async def create_user(user_data: UserCreate) -> User:
    """Create a new user."""
    logger.info(f"Creating user: {user_data.email}")

    existing_user = await find_user_by_email(user_data.email)
    if existing_user:
        logger.warning(
            f"User creation failed - email already registered: {user_data.email}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    hashed_password = ph.hash(user_data.password)
    user = User(
        **user_data.model_dump(
            exclude={"password", "google_signup_token", "confirm_adult"}
        ),
        password_hash=hashed_password,
        auth_method="google" if user_data.google_id else "email",
    )
    await user.insert()
    logger.info(f"User created successfully: {user_data.email}")
    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Create a new JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = create_jwt_expiry(expires_delta)
    else:
        expire = create_jwt_expiry()

    # A fresh id per login lets hearings be tied to the device's session.
    to_encode.setdefault("sid", secrets.token_urlsafe(16))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.secret_key, algorithm=settings.algorithm
    )
    logger.debug(f"Access token created for: {data.get('sub', 'unknown')}")
    return encoded_jwt


@dataclass(frozen=True)
class Device:
    """Where a sign-in came from, shown later in the list of signed-in devices."""

    ip: str | None = None
    user_agent: str | None = None


def token_lifetime(remember_me: bool) -> timedelta:
    """How long a sign-in lasts: longer with "Keep me signed in"."""
    return timedelta(
        days=settings.extended_token_expire_days if remember_me else 0,
        minutes=settings.access_token_expire_minutes,
    )


async def issue_token(
    user: User, remember_me: bool = False, device: Device | None = None
) -> str:
    """Sign ``user`` in on a device: record the session and return its JWT."""
    assert user.id is not None
    device = device or Device()
    lifetime = token_lifetime(remember_me)
    now = get_current_datetime()
    sid = secrets.token_urlsafe(16)
    await UserSession(
        sid=sid,
        user_id=user.id,
        created_at=now,
        last_active=now,
        expires_at=now + lifetime,
        user_agent=(device.user_agent or "")[:300] or None,
        ip=device.ip,
    ).insert()
    return create_access_token(
        data={"sub": str(user.id), "sid": sid}, expires_delta=lifetime
    )


async def revoke_sessions(
    user_id: PydanticObjectId, keep_sid: str | None = None
) -> int:
    """Sign the user out on every device (except ``keep_sid``); returns how many."""
    query: dict = {"user_id": user_id, "revoked": False}
    if keep_sid:
        query["sid"] = {"$ne": keep_sid}
    result = await UserSession.get_pymongo_collection().update_many(
        query, {"$set": {"revoked": True}}
    )
    return result.modified_count


def _password_fingerprint(user: User) -> str:
    """Changes whenever the password does, so a used reset link stops working."""
    return hashlib.sha256((user.password_hash or "").encode()).hexdigest()[:16]


def create_password_reset_token(user: User) -> str:
    """Signed, short-lived proof that whoever holds it can set a new password."""
    payload = {
        "purpose": "password_reset",
        "sub": str(user.id),
        "email": user.email,  # shown on the "Set a new password" form
        "pwf": _password_fingerprint(user),
        "exp": create_jwt_expiry(
            timedelta(minutes=settings.password_reset_expire_minutes)
        ),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


async def user_from_reset_token(token: str) -> User | None:
    """The user a reset link is for, or None if it is invalid, expired or used."""
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.InvalidTokenError:
        return None
    if claims.get("purpose") != "password_reset":
        return None
    try:
        user = await User.get(PydanticObjectId(claims["sub"]))
    except (KeyError, InvalidId):
        return None
    if user is None or claims.get("pwf") != _password_fingerprint(user):
        return None
    return user
