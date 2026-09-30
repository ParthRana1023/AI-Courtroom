"""
Google OAuth authentication service for verifying Google ID tokens,
managing Google-authenticated users, and OAuth security features.

Includes:
1. ID token verification
2. User creation/linking for Google users
3. State parameter generation/validation (CSRF protection)
4. RISC (Cross-Account Protection) token verification
5. Authorization code exchange
"""

import asyncio
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta
from typing import Any

import jwt
from fastapi import HTTPException, status
from google.auth.transport import requests
from google.oauth2 import id_token

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case
from app.models.user import User
from app.services.auth import create_access_token, find_user_by_email

logger = get_logger(__name__)

# =============================================================================
# OAuth Security Functions (State Parameter & RISC)
# =============================================================================


def generate_state_token() -> str:
    """
    Generate a signed state token for OAuth CSRF protection.
    Contains a timestamp to enforce expiration.
    """
    payload = {
        "iat": int(time.time()),
        "exp": int(time.time()) + settings.oauth_state_token_expiry,
        "nonce": secrets.token_hex(16),
    }

    return jwt.encode(
        payload, settings.oauth_state_secret, algorithm=settings.algorithm
    )


def validate_state_token(token: str) -> bool:
    """
    Validate an OAuth state token.
    Returns True if valid, False if invalid.
    """
    try:
        jwt.decode(token, settings.oauth_state_secret, algorithms=[settings.algorithm])
        return True
    except jwt.ExpiredSignatureError:
        logger.warning("OAuth state token expired")
        return False
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid OAuth state token: {e!s}")
        return False


# Long enough to fill in the registration form after Google sign-in.
GOOGLE_SIGNUP_TOKEN_TTL_SECONDS = 30 * 60


def create_google_signup_token(google_id: str, email: str) -> str:
    """Proof, signed by us, that Google verified this email and Google account."""
    payload = {
        "purpose": "google_signup",
        "sub": google_id,
        "email": email,
        "exp": int(time.time()) + GOOGLE_SIGNUP_TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def read_google_signup_token(token: str) -> dict[str, Any] | None:
    """Claims of a valid, unexpired sign-up token, or None."""
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.InvalidTokenError:
        return None
    return claims if claims.get("purpose") == "google_signup" else None


async def verify_risc_token(token: str) -> dict[str, Any]:
    """
    Verify a RISC security event token from Google.

    Args:
        token: The standard JWT token received from Google

    Returns:
        The decoded claims if valid

    Raises:
        ValueError: If token is invalid
    """
    try:
        # RISC tokens are signed by Google, so we verify using Google's public keys
        audience = settings.google_client_id

        # Verify the token signature and claims
        claims = await asyncio.to_thread(
            id_token.verify_oauth2_token,
            token,
            requests.Request(),
            audience=audience,
            clock_skew_in_seconds=60,  # Allow 60 seconds of clock drift
        )

        # Verify the issuer is Google
        if claims.get("iss") not in [
            "accounts.google.com",
            "https://accounts.google.com",
        ]:
            raise ValueError("Invalid issuer")

        return dict(claims)

    except Exception as e:
        logger.error(f"RISC token verification failed: {e!s}")
        raise ValueError(f"Invalid RISC token: {e!s}") from e


# =============================================================================
# Google Token Verification Functions
# =============================================================================


async def verify_google_token(credential: str) -> dict:
    """
    Verify Google ID token and return user info.

    Args:
        credential: The Google ID token from the frontend

    Returns:
        dict with user info (email, name, picture, sub)

    Raises:
        HTTPException if token is invalid
    """
    try:
        client_id = settings.google_client_id
        logger.debug(
            "Verifying Google ID token",
            extra={
                "client_id_set": bool(client_id),
                "token_received": bool(credential),
            },
        )

        if not client_id:
            logger.error("GOOGLE_CLIENT_ID environment variable not set")
            raise ValueError("GOOGLE_CLIENT_ID environment variable is not set")

        idinfo = await asyncio.to_thread(
            id_token.verify_oauth2_token,
            credential,
            requests.Request(),
            client_id,
            clock_skew_in_seconds=60,  # Allow 60 seconds of clock drift
        )

        # Verify the issuer
        if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
            logger.warning(
                "Invalid issuer in Google token", extra={"issuer": idinfo.get("iss")}
            )
            raise ValueError("Invalid issuer")

        logger.info(
            "Google ID token verified successfully",
            extra={"email": idinfo.get("email")},
        )
        return dict(idinfo)
    except ValueError as e:
        logger.warning("Google token verification failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token.",
        )


def _post_token_request(req: urllib.request.Request) -> dict:
    with urllib.request.urlopen(req) as response:
        if response.status != 200:
            raise ValueError(f"Google Token Endpoint returned {response.status}")
        return json.loads(response.read().decode("utf-8"))


async def exchange_code_for_token(code: str) -> dict:
    """
    Exchange authorization code for access/ID tokens.

    Args:
        code: The authorization code from Google OAuth

    Returns:
        dict containing access_token, id_token, etc.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValueError("Google OAuth credentials not configured")

    # For 'postmessage' flow (common in React Google Login):
    redirect_uri = "postmessage"

    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(token_url, data=data, method="POST")

    try:
        return await asyncio.to_thread(_post_token_request, req)
    except urllib.error.HTTPError as e:
        logger.error(f"Token exchange failed: {e.read().decode('utf-8')}")
        raise ValueError(f"Failed to exchange code: {e}")


# =============================================================================
# User Management Functions
# =============================================================================


# =============================================================================
# Main Authentication Flow
# =============================================================================


async def authenticate_google_user(
    credential: str | None = None,
    remember_me: bool = False,
) -> dict:
    """
    Complete Google authentication flow: verify token, check user, generate JWT or return data.

    For existing users: Returns JWT token
    For new users: Returns Google user data to pre-fill registration form

    Args:
        credential: Google ID token (from the web code flow or native sign-in)
        remember_me: Whether to extend token expiration

    Returns:
        dict with access_token for existing users, or google_user_data for new users
    """
    logger.info(
        "Starting Google authentication flow",
        extra={
            "has_credential": bool(credential),
            "remember_me": remember_me,
        },
    )

    # Only ID tokens: their audience is checked against our client ID. Access
    # tokens were dropped because one issued to any other app would be accepted.
    if not credential:
        logger.warning("No Google ID token provided for authentication")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A Google ID token (credential) or authorization code is required",
        )
    google_info = await verify_google_token(credential)

    # Without a verified email, anyone could claim an address they don't own and
    # get linked to that account. Google sends a bool; tolerate "true" strings.
    if str(google_info.get("email_verified")).lower() != "true":
        logger.warning(
            "Google account email is not verified",
            extra={"email": google_info.get("email")},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your Google account email is not verified.",
        )

    # Verified Google ID tokens always carry both claims.
    email = google_info["email"].lower()
    google_id = google_info["sub"]

    # Check if user exists
    user = await User.find_one(User.google_id == google_id)

    if not user:
        # Try to find by email
        user = await find_user_by_email(email)

        if user:
            # Link Google account to existing user
            user.google_id = google_id
            # Update profile photo from Google if user doesn't have one
            google_picture = google_info.get("picture")
            if google_picture and not user.profile_photo_url:
                user.profile_photo_url = google_picture
            await user.save()
            logger.info(
                "Linked Google account to existing user during auth",
                extra={"user_id": str(user.id), "email": email},
            )
        else:
            # New user - return Google data for registration form
            full_name = google_info.get("name", "")
            name_parts = full_name.split(" ", 1) if full_name else ["", ""]

            logger.info(
                "New user detected, returning Google data for registration",
                extra={"email": email},
            )
            return {
                "access_token": None,
                "token_type": "bearer",
                "is_new_user": True,
                "google_user_data": {
                    "first_name": name_parts[0] if name_parts else "",
                    "last_name": name_parts[1] if len(name_parts) > 1 else "",
                    "email": email,
                    "google_id": google_id,
                    "profile_photo_url": google_info.get(
                        "picture"
                    ),  # Google profile picture
                    # Required by /auth/register/initiate to create a Google account.
                    "google_signup_token": create_google_signup_token(google_id, email),
                },
            }

    # Existing user - update profile photo from Google if they don't have one
    google_picture = google_info.get("picture")
    if google_picture and not user.profile_photo_url:
        user.profile_photo_url = google_picture
        await user.save()

    # Hearings still running belong to a session that ended (e.g. expired).
    await Case.adjourn_abandoned_cases(user.id)

    # Create JWT token
    access_token_expires = timedelta(
        days=settings.extended_token_expire_days if remember_me else 0,
        minutes=settings.access_token_expire_minutes,
    )

    jwt_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    logger.info(
        "Google authentication successful, JWT issued",
        extra={"user_id": str(user.id), "email": email},
    )

    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "is_new_user": False,
        "google_user_data": None,
    }
