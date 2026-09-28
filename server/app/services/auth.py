# app/services/auth.py
import re
import secrets
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from fastapi import HTTPException, status

from app.config import settings
from app.logging_config import get_logger
from app.models.user import User
from app.schemas.user import UserCreate
from app.utils.datetime import create_jwt_expiry

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
    """Create new user with direct Motor operations"""
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
        **user_data.model_dump(exclude={"password", "google_signup_token"}),
        password_hash=hashed_password,
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
