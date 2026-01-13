# app/services/auth.py
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status
from app.models.user import User
from app.models.otp import OTP
from app.schemas.user import UserCreate, UserOut
from datetime import timedelta
from typing import Optional
from jose import jwt
from app.config import settings
from app.services.otp import verify_otp
from app.utils.datetime import create_jwt_expiry
from app.logging_config import get_logger

logger = get_logger(__name__)

ph = PasswordHasher()

async def create_user(user_data: UserCreate) -> User:
    """Create new user with direct Motor operations"""
    logger.info(f"Creating user: {user_data.email}")
    
    existing_user = await User.find_one(User.email == user_data.email)
    if existing_user:
        logger.warning(f"User creation failed - email already registered: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    hashed_password = ph.hash(user_data.password)
    user = User(
        **user_data.model_dump(exclude={"password"}),
        password_hash=hashed_password
    )
    await user.insert()
    logger.info(f"User created successfully: {user_data.email}")
    return user

async def authenticate_user(email: str, password: str) -> User:
    logger.debug(f"Authenticating user: {email}")
    
    user = await User.find_one(User.email == email)
    if not user:
        logger.warning(f"Authentication failed - user not found: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    try:
        ph.verify(user.password_hash, password)
        logger.info(f"User authenticated successfully: {email}")
    except VerifyMismatchError:
        logger.warning(f"Authentication failed - password mismatch: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a new JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = create_jwt_expiry(expires_delta)
    else:
        expire = create_jwt_expiry()
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    logger.debug(f"Access token created for: {data.get('sub', 'unknown')}")
    return encoded_jwt

async def verify_login_otp(email: str, otp_code: str, remember_me: bool = False) -> dict:
    """Verify OTP for login and generate access token"""
    logger.info(f"Verifying login OTP for: {email}")
    
    # Verify the OTP
    is_valid = await verify_otp(email, otp_code, is_registration=False)
    if not is_valid:
        logger.warning(f"Login OTP verification failed for: {email}")
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Get the user
    user = await User.find_one(User.email == email)
    if not user:
        logger.error(f"User not found after OTP verification: {email}")
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete the OTP after successful verification
    await OTP.find_one(OTP.email == email, OTP.otp == otp_code).delete()
    logger.debug(f"OTP deleted after verification for: {email}")
    
    # Create access token with the same payload structure as regular login
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(days=30 if remember_me else 1)
    )
    
    logger.info(f"Login OTP verified successfully for: {email}")
    return {"access_token": access_token, "token_type": "bearer"}