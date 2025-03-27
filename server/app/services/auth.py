# app/services/auth.py
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status
from app.models.user import User
from app.schemas.user import UserCreate, UserOut

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