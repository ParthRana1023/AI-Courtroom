# app/services/auth.py
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status
from app.models.user import User
from app.models.otp import OTP
from app.schemas.user import UserCreate, UserOut
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt
from app.config import settings
from app.services.otp import verify_otp

ph = PasswordHasher()

async def create_user(user_data: UserCreate) -> UserOut:
    """Create new user with direct Motor operations"""
    existing_user = await User.find_one(User.email == user_data.email)
    if existing_user:
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
    return UserOut(**user.model_dump())

async def authenticate_user(email: str, password: str) -> User:
    user = await User.find_one(User.email == email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    try:
        ph.verify(user.password_hash, password)
    except VerifyMismatchError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    return user

# Add this function to your auth.py file
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a new JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

async def verify_login_otp(email: str, otp_code: str, remember_me: bool = False) -> dict:
    """Verify OTP for login and generate access token"""
    # Verify the OTP
    is_valid = await verify_otp(email, otp_code, is_registration=False)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Get the user
    user = await User.find_one(User.email == email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete the OTP after successful verification
    await OTP.find_one(OTP.email == email, OTP.otp == otp_code).delete()
    
    # Create access token with the same payload structure as regular login
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(days=30 if remember_me else 1)
    )
    
    return {"access_token": access_token, "token_type": "bearer"}