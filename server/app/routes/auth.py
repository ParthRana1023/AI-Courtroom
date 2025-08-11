from fastapi import APIRouter, HTTPException, status, Depends, Request
from app.schemas.user import UserCreate, UserOut
from app.models.user import User
from app.models.user import TokenResponse
from app.services.auth import create_user, create_access_token, ph
from app.services.auth import VerifyMismatchError
from app.services.otp import verify_otp, create_otp
from app.config import settings
from datetime import timedelta
import motor.motor_asyncio
from app.models.otp import RegistrationVerifyRequest, LoginVerifyRequest
from app.dependencies import get_current_user

router = APIRouter(tags=["Authentication"])

@router.post("/register/initiate")
async def initiate_registration(user_data: UserCreate):
    # Add duplicate check
    existing_user = await User.find_one(User.email == user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    # Generate and send OTP
    await create_otp(user_data.email, is_registration=True)
    
    # Store user data temporarily (you might want to use Redis or a similar solution for this)
    # For simplicity, we'll return a success message and expect the client to send the data again
    return {"message": "OTP sent to your email for verification"}

@router.post("/register/verify", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
async def verify_registration(data: RegistrationVerifyRequest):
    # Verify OTP
    is_valid = await verify_otp(data.user_data.email, data.otp, is_registration=True)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )
    
    # Delete the OTP after successful verification
    client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.current_db_name]
    await db.get_collection("otp").delete_one({"email": data.user_data.email, "otp": data.otp})
    
    # Create the user
    try:
        user = await create_user(data.user_data)

        # Create access token for the newly registered user
        access_token_expires = timedelta(
            days=settings.extended_token_expire_days if data.remember_me else 0,
            minutes=settings.access_token_expire_minutes
        )

        access_token = create_access_token(
            data={"sub": str(user.email)},
            expires_delta=access_token_expires
        )

        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {str(e)}"
        )

@router.post("/login/initiate")
async def initiate_login(
    login_data: dict
):
    email = login_data.get("email")
    password = login_data.get("password")
    # Check if user exists and verify password
    user = await User.find_one(User.email == email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not registered"
        )
    
    # Verify password
    try:
        ph.verify(user.password_hash, password)
    except VerifyMismatchError:
        print(f"DEBUG: Password mismatch for user: {email}") # Added for debugging
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Generate and send OTP
    await create_otp(email, is_registration=False)
    
    return {"message": "OTP sent to your email for verification"}

@router.post("/login/verify", response_model=TokenResponse)
async def verify_login(request: Request):
    try:
        # Parse the request body manually
        request_data = await request.json()
        # Create LoginVerifyRequest object from the parsed data
        data = LoginVerifyRequest(**request_data)
        
        # Verify OTP
        is_valid = await verify_otp(data.email, data.otp, is_registration=False)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP"
            )
        
        # Delete the OTP after successful verification
        client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
        db = client[settings.current_db_name]
        await db.get_collection("otp").delete_one({"email": data.email, "otp": data.otp})
        
        # Get the user
        user = await User.find_one(User.email == data.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User not found"
            )
        
        # Create access token
        access_token_expires = timedelta(
            days=settings.extended_token_expire_days if data.remember_me 
            else 0,
            minutes=settings.access_token_expire_minutes
        )
        
        access_token = create_access_token(
            data={"sub": str(user.email)},
            expires_delta=access_token_expires
        )
        
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request format: {str(e)}"
        )

@router.get("/profile", response_model=UserOut)
async def profile(current_user: User = Depends(get_current_user)):
    return current_user
