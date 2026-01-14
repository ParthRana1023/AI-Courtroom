"""
Google OAuth authentication service for verifying Google ID tokens,
managing Google-authenticated users, and OAuth security features.

Includes:
1. Token verification (ID tokens and Access tokens)
2. User creation/linking for Google users
3. State parameter generation/validation (CSRF protection)
4. RISC (Cross-Account Protection) token verification
5. Authorization code exchange
"""
import secrets
import time
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests
from fastapi import HTTPException, status
from datetime import date, timedelta
from typing import Optional, Dict, Any
from app.config import settings
from app.models.user import User
from app.services.auth import create_access_token
from app.logging_config import get_logger
import json
import urllib.request
import urllib.error

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
        "nonce": secrets.token_hex(16)
    }
    
    return jwt.encode(payload, settings.oauth_state_secret, algorithm=settings.algorithm)


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
        logger.warning(f"Invalid OAuth state token: {str(e)}")
        return False


async def verify_risc_token(token: str) -> Dict[str, Any]:
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
        claims = id_token.verify_oauth2_token(
            token, 
            requests.Request(), 
            audience=audience,
            clock_skew_in_seconds=60  # Allow 60 seconds of clock drift
        )
        
        # Verify the issuer is Google
        if claims.get('iss') not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Invalid issuer')
            
        return claims
        
    except Exception as e:
        logger.error(f"RISC token verification failed: {str(e)}")
        raise ValueError(f"Invalid RISC token: {str(e)}")


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
        logger.debug("Verifying Google ID token", extra={"client_id_set": bool(client_id), "token_received": bool(credential)})
        
        if not client_id:
            logger.error("GOOGLE_CLIENT_ID environment variable not set")
            raise ValueError("GOOGLE_CLIENT_ID environment variable is not set")
        
        idinfo = id_token.verify_oauth2_token(
            credential,
            requests.Request(),
            client_id,
            clock_skew_in_seconds=60  # Allow 60 seconds of clock drift
        )
        
        # Verify the issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            logger.warning("Invalid issuer in Google token", extra={"issuer": idinfo.get('iss')})
            raise ValueError('Invalid issuer')
        
        logger.info("Google ID token verified successfully", extra={"email": idinfo.get('email')})
        return idinfo
    except ValueError as e:
        logger.warning("Google token verification failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )


async def verify_google_access_token(access_token: str) -> dict:
    """
    Verify Google Access Token by calling UserInfo endpoint.
    
    Args:
        access_token: The Google Access Token from the frontend
        
    Returns:
        dict with user info (email, name, picture, sub)
    """
    try:
        logger.debug("Verifying Google Access Token", extra={"token_received": bool(access_token)})
        
        url = "https://www.googleapis.com/oauth2/v3/userinfo"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
        
        try:
            with urllib.request.urlopen(req) as response:
                if response.status != 200:
                    raise ValueError(f"Google API returned {response.status}")
                data = json.loads(response.read().decode('utf-8'))
                logger.info("Google Access Token verified successfully", extra={"email": data.get('email')})
                return data
        except urllib.error.HTTPError as e:
             raise ValueError(f"HTTP Error {e.code}: {e.reason}")
             
    except Exception as e:
        logger.warning("Google Access Token verification failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google access token: {str(e)}"
        )


async def exchange_code_for_token(code: str) -> dict:
    """
    Exchange authorization code for access/ID tokens.
    
    Args:
        code: The authorization code from Google OAuth
        
    Returns:
        dict containing access_token, id_token, etc.
    """
    import urllib.parse
    
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
        "grant_type": "authorization_code"
    }
    
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(token_url, data=data, method='POST')
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                raise ValueError(f"Google Token Endpoint returned {response.status}")
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        logger.error(f"Token exchange failed: {e.read().decode('utf-8')}")
        raise ValueError(f"Failed to exchange code: {e}")


# =============================================================================
# User Management Functions
# =============================================================================

async def get_or_create_google_user(google_info: dict) -> tuple[User, bool]:
    """
    Find existing user by email/google_id or create new user from Google profile.
    
    Args:
        google_info: Dict containing Google user info (email, name, sub, etc.)
        
    Returns:
        Tuple of (User object, is_new_user boolean)
    """
    email = google_info.get('email')
    google_id = google_info.get('sub')
    is_new_user = False
    
    logger.debug("Looking up user by Google ID", extra={"google_id": google_id})
    
    # First, try to find user by google_id
    user = await User.find_one(User.google_id == google_id)
    
    if not user:
        # Try to find by email (existing user signing in with Google)
        logger.debug("User not found by Google ID, checking by email", extra={"email": email})
        user = await User.find_one(User.email == email)
        
        if user:
            # Link Google account to existing user
            user.google_id = google_id
            await user.save()
            logger.info("Linked Google account to existing user", extra={"user_id": str(user.id), "email": email})
        else:
            # Create new user from Google profile
            is_new_user = True
            # Parse name from Google profile
            full_name = google_info.get('name', '')
            name_parts = full_name.split(' ', 1) if full_name else ['User', '']
            first_name = name_parts[0] if name_parts else 'User'
            last_name = name_parts[1] if len(name_parts) > 1 else ''
            
            user = User(
                first_name=first_name,
                last_name=last_name or 'User',
                date_of_birth=date(2000, 1, 1),  # Placeholder date
                phone_number='0000000000',  # Placeholder phone
                email=email,
                password_hash=None,  # No password for Google-only users
                google_id=google_id
            )
            await user.insert()
            logger.info("Created new user from Google profile", extra={"user_id": str(user.id), "email": email})
    else:
        logger.debug("Found existing user by Google ID", extra={"user_id": str(user.id)})
    
    return user, is_new_user


# =============================================================================
# Main Authentication Flow
# =============================================================================

async def authenticate_google_user(credential: Optional[str] = None, access_token: Optional[str] = None, remember_me: bool = False) -> dict:
    """
    Complete Google authentication flow: verify token, check user, generate JWT or return data.
    
    For existing users: Returns JWT token
    For new users: Returns Google user data to pre-fill registration form
    
    Args:
        credential: Google ID token (legacy)
        access_token: Google Access Token (new flow)
        remember_me: Whether to extend token expiration
        
    Returns:
        dict with access_token for existing users, or google_user_data for new users
    """
    logger.info("Starting Google authentication flow", extra={"has_credential": bool(credential), "has_access_token": bool(access_token), "remember_me": remember_me})
    
    # Verify the Google token (ID Token or Access Token)
    if credential:
        google_info = await verify_google_token(credential)
    elif access_token:
        google_info = await verify_google_access_token(access_token)
    else:
        logger.warning("No Google token provided for authentication")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either credential (ID Token) or access_token is required"
        )
    
    email = google_info.get('email')
    google_id = google_info.get('sub')
    
    # Check if user exists
    user = await User.find_one(User.google_id == google_id)
    
    if not user:
        # Try to find by email
        user = await User.find_one(User.email == email)
        
        if user:
            # Link Google account to existing user
            user.google_id = google_id
            # Update profile photo from Google if user doesn't have one
            google_picture = google_info.get('picture')
            if google_picture and not user.profile_photo_url:
                user.profile_photo_url = google_picture
            await user.save()
            logger.info("Linked Google account to existing user during auth", extra={"user_id": str(user.id), "email": email})
        else:
            # New user - return Google data for registration form
            full_name = google_info.get('name', '')
            name_parts = full_name.split(' ', 1) if full_name else ['', '']
            
            logger.info("New user detected, returning Google data for registration", extra={"email": email})
            return {
                "access_token": None,
                "token_type": "bearer",
                "is_new_user": True,
                "google_user_data": {
                    "first_name": name_parts[0] if name_parts else '',
                    "last_name": name_parts[1] if len(name_parts) > 1 else '',
                    "email": email,
                    "google_id": google_id,
                    "profile_photo_url": google_info.get('picture')  # Google profile picture
                }
            }
    
    # Existing user - update profile photo from Google if they don't have one
    google_picture = google_info.get('picture')
    if google_picture and not user.profile_photo_url:
        user.profile_photo_url = google_picture
        await user.save()
    
    # Create JWT token
    access_token_expires = timedelta(
        days=settings.extended_token_expire_days if remember_me else 0,
        minutes=settings.access_token_expire_minutes
    )
    
    jwt_token = create_access_token(
        data={"sub": str(user.email)},
        expires_delta=access_token_expires
    )
    
    logger.info("Google authentication successful, JWT issued", extra={"user_id": str(user.id), "email": email})
    
    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "is_new_user": False,
        "google_user_data": None
    }
