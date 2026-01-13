# app/dependencies.py
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status
from jose import JWTError, jwt
from app.config import settings
from app.models.user import User
from typing import Optional
from beanie import PydanticObjectId
from app.logging_config import get_logger

logger = get_logger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            logger.warning("Token validation failed - no user_id in payload")
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"Token validation failed - JWT error: {str(e)}")
        raise credentials_exception
    
    # Try to find the user by email first (since sub might be email)
    user = await User.find_one(User.email == user_id)
    
    # If not found by email, try by ID
    if user is None:
        try:
            # Only convert to ObjectId if it's not an email
            if '@' not in user_id:
                user = await User.find_one(User.id == PydanticObjectId(user_id))
        except Exception as e:
            logger.warning(f"Token validation failed - user lookup error: {str(e)}")
            raise credentials_exception
    
    if user is None:
        logger.warning(f"Token validation failed - user not found: {user_id}")
        raise credentials_exception
    
    logger.debug(f"User authenticated via token: {user.email}")
    return user