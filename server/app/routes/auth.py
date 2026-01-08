from fastapi import APIRouter, HTTPException, status, Depends, Request, UploadFile, File
from app.schemas.user import UserCreate, UserOut
from app.schemas.auth import GoogleLoginRequest, ProfileUpdateRequest
from app.models.user import User
from app.models.user import TokenResponse
from app.services.auth import create_user, create_access_token, ph
from app.services.auth import VerifyMismatchError
from app.services.otp import verify_otp, create_otp
from app.services.google_auth import authenticate_google_user
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
    
    # If registering via Google, skip OTP and directly create user
    # Google has already verified the email
    if user_data.google_id:
        try:
            user = await create_user(user_data)
            
            # Create access token for the newly registered user
            access_token_expires = timedelta(
                minutes=settings.access_token_expire_minutes
            )
            
            access_token = create_access_token(
                data={"sub": str(user.email)},
                expires_delta=access_token_expires
            )
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "skip_otp": True
            }
        except HTTPException as e:
            raise e
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating user: {str(e)}"
            )
    
    # Generate and send OTP for regular registrations
    await create_otp(user_data.email, is_registration=True)
    
    # Store user data temporarily (you might want to use Redis or a similar solution for this)
    # For simplicity, we'll return a success message and expect the client to send the data again
    return {"message": "OTP sent to your email for verification", "skip_otp": False}

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
    
    # Check if this is a Google-only user (no password set)
    if user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In. Please use the 'Continue with Google' button to log in."
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

@router.put("/profile", response_model=UserOut)
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Update user profile with phone number and date of birth."""
    from datetime import datetime
    
    try:
        # Parse date string to date object
        dob = datetime.strptime(data.date_of_birth, "%Y-%m-%d").date()
        
        # Update user
        current_user.phone_number = data.phone_number
        current_user.date_of_birth = dob
        current_user.nickname = data.nickname  # Update nickname
        await current_user.save()
        
        return current_user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {str(e)}"
        )


@router.post("/google")
async def google_login(data: GoogleLoginRequest):
    """
    Authenticate user with Google OAuth.
    
    Receives the Google ID token from the frontend, verifies it,
    and returns a JWT access token.
    """
    try:
        result = await authenticate_google_user(
            credential=data.credential,
            access_token=data.access_token,
            remember_me=data.remember_me
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google authentication failed: {str(e)}"
        )


@router.post("/profile/photo", response_model=UserOut)
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload or update user's profile photo."""
    from app.services.cloudinary_service import (
        upload_profile_photo as cloudinary_upload,
        extract_public_id_from_url
    )
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    file_bytes = await file.read()
    if len(file_bytes) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5MB limit"
        )
    
    try:
        # Get existing public_id if user has a photo
        existing_public_id = None
        if current_user.profile_photo_url:
            existing_public_id = extract_public_id_from_url(current_user.profile_photo_url)
        
        # Upload to Cloudinary
        secure_url, public_id = await cloudinary_upload(
            file_bytes=file_bytes,
            user_id=str(current_user.id),
            existing_public_id=existing_public_id
        )
        
        # Update user profile
        current_user.profile_photo_url = secure_url
        await current_user.save()
        
        return current_user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload profile photo: {str(e)}"
        )


@router.delete("/profile/photo", response_model=UserOut)
async def delete_profile_photo(
    current_user: User = Depends(get_current_user)
):
    """Remove user's profile photo."""
    from app.services.cloudinary_service import (
        delete_profile_photo as cloudinary_delete,
        extract_public_id_from_url
    )
    
    if not current_user.profile_photo_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile photo to delete"
        )
    
    try:
        # Extract public_id and delete from Cloudinary
        public_id = extract_public_id_from_url(current_user.profile_photo_url)
        if public_id:
            await cloudinary_delete(public_id)
        
        # Update user profile
        current_user.profile_photo_url = None
        await current_user.save()
        
        return current_user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete profile photo: {str(e)}"
        )

