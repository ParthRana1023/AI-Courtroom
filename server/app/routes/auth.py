# app/routes/auth.py
from fastapi import APIRouter, HTTPException, status, Depends, Request, UploadFile, File
from app.schemas.user import UserCreate, UserOut, CaseLocationPreferenceUpdate
from app.schemas.auth import GoogleLoginRequest, ProfileUpdateRequest
from app.models.user import User
from app.models.user import TokenResponse
from app.services.auth import create_user, create_access_token, ph
from app.services.auth import VerifyMismatchError
from app.services.otp import verify_otp, create_otp
from app.services.google_auth import (
    authenticate_google_user, 
    exchange_code_for_token,
    generate_state_token, 
    validate_state_token, 
    verify_risc_token
)
from app.config import settings
from app.logging_config import get_logger
from datetime import timedelta
import motor.motor_asyncio
from app.models.otp import RegistrationVerifyRequest, LoginVerifyRequest
from app.dependencies import get_current_user

logger = get_logger(__name__)

router = APIRouter(tags=["Authentication"])

@router.post("/register/initiate")
async def initiate_registration(user_data: UserCreate):
    logger.info(f"Registration initiated for email: {user_data.email}")
    
    # Add duplicate check
    existing_user = await User.find_one(User.email == user_data.email)
    if existing_user:
        logger.warning(f"Registration failed - email already registered: {user_data.email}")
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    # If registering via Google, skip OTP and directly create user
    # Google has already verified the email
    if user_data.google_id:
        logger.info(f"Google registration detected for: {user_data.email}")
        try:
            user = await create_user(user_data)
            logger.info(f"User created successfully via Google: {user_data.email}")
            
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
            logger.error(f"Google registration failed for {user_data.email}: {e.detail}")
            raise e
        except Exception as e:
            logger.error(f"Unexpected error during Google registration for {user_data.email}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating user: {str(e)}"
            )
    
    # Generate and send OTP for regular registrations
    await create_otp(user_data.email, is_registration=True)
    logger.info(f"OTP sent for registration: {user_data.email}")
    
    # Store user data temporarily (you might want to use Redis or a similar solution for this)
    # For simplicity, we'll return a success message and expect the client to send the data again
    return {"message": "OTP sent to your email for verification", "skip_otp": False}

@router.post("/register/verify", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
async def verify_registration(data: RegistrationVerifyRequest):
    logger.info(f"Registration verification attempted for: {data.user_data.email}")
    
    # Verify OTP
    is_valid = await verify_otp(data.user_data.email, data.otp, is_registration=True)
    if not is_valid:
        logger.warning(f"Invalid OTP for registration: {data.user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )
    
    # Delete the OTP after successful verification
    client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.current_db_name]
    await db.get_collection("otp").delete_one({"email": data.user_data.email, "otp": data.otp})
    logger.debug(f"OTP deleted after verification for: {data.user_data.email}")
    
    # Create the user
    try:
        user = await create_user(data.user_data)
        logger.info(f"User created successfully: {data.user_data.email}")

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
        logger.error(f"Registration verification failed for {data.user_data.email}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error during registration for {data.user_data.email}: {str(e)}", exc_info=True)
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
    logger.info(f"Login initiated for: {email}")
    
    # Check if user exists and verify password
    user = await User.find_one(User.email == email)
    if not user:
        logger.warning(f"Login failed - email not registered: {email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not registered"
        )
    
    # Check if this is a Google-only user (no password set)
    if user.password_hash is None:
        logger.warning(f"Login failed - Google-only account tried password login: {email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In. Please use the 'Continue with Google' button to log in."
        )
    
    # Verify password
    try:
        ph.verify(user.password_hash, password)
    except VerifyMismatchError:
        logger.warning(f"Login failed - password mismatch for: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Generate and send OTP
    await create_otp(email, is_registration=False)
    logger.info(f"OTP sent for login: {email}")
    
    return {"message": "OTP sent to your email for verification"}

@router.post("/login/verify", response_model=TokenResponse)
async def verify_login(request: Request):
    try:
        # Parse the request body manually
        request_data = await request.json()
        # Create LoginVerifyRequest object from the parsed data
        data = LoginVerifyRequest(**request_data)
        logger.info(f"Login verification attempted for: {data.email}")
        
        # Verify OTP
        is_valid = await verify_otp(data.email, data.otp, is_registration=False)
        if not is_valid:
            logger.warning(f"Invalid OTP for login: {data.email}")
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
            logger.error(f"User not found after OTP verification: {data.email}")
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
        
        logger.info(f"Login successful for: {data.email}")
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as e:
        logger.error(f"Invalid login request format: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request format: {str(e)}"
        )

@router.get("/profile", response_model=UserOut)
async def profile(current_user: User = Depends(get_current_user)):
    logger.debug(f"Profile fetched for user: {current_user.email}")
    return current_user

@router.put("/profile", response_model=UserOut)
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Update user profile - only updates fields that are provided."""
    from datetime import datetime
    
    logger.info(f"Profile update requested for user: {current_user.email}")
    
    try:
        # Update only provided fields
        if data.first_name is not None:
            current_user.first_name = data.first_name
        if data.last_name is not None:
            current_user.last_name = data.last_name
        if data.nickname is not None:
            current_user.nickname = data.nickname if data.nickname.strip() else None
        if data.gender is not None:
            current_user.gender = data.gender
        if data.phone_number is not None:
            current_user.phone_number = data.phone_number
        if data.date_of_birth is not None:
            dob = datetime.strptime(data.date_of_birth, "%Y-%m-%d").date()
            current_user.date_of_birth = dob
        
        # Location fields
        if data.city is not None:
            current_user.city = data.city
        if data.state is not None:
            current_user.state = data.state
        if data.state_iso2 is not None:
            current_user.state_iso2 = data.state_iso2
        if data.country is not None:
            current_user.country = data.country
        if data.country_iso2 is not None:
            current_user.country_iso2 = data.country_iso2
        if data.phone_code is not None:
            current_user.phone_code = data.phone_code
        
        await current_user.save()
        logger.info(f"Profile updated successfully for user: {current_user.email}")
        return current_user
    except ValueError as e:
        logger.error(f"Invalid profile update data for {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid data: {str(e)}"
        )


@router.post("/google")
async def google_login(data: GoogleLoginRequest):
    """
    Authenticate user with Google OAuth.
    Supports:
    1. Implicit Flow (credential/access_token) - Client-side
    2. Authorization Code Flow (code) - Server-side code exchange (More Secure)
    """
    logger.info("Google authentication initiated")
    try:
        # If using Authorization Code Flow
        if data.code:
            # 1. Validate State Parameter if provided
            if data.state:
                if not validate_state_token(data.state):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid or expired state parameter"
                    )
            
            # 2. Exchange code for tokens
            tokens = await exchange_code_for_token(data.code)
            
            # 3. Use ID token or access token from exchange
            result = await authenticate_google_user(
                credential=tokens.get("id_token"),
                access_token=tokens.get("access_token"),
                remember_me=data.remember_me
            )
            return result
            
        # Legacy/Implicit Flows
        result = await authenticate_google_user(
            credential=data.credential,
            access_token=data.access_token,
            remember_me=data.remember_me
        )
        logger.info("Google authentication successful")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google authentication failed: {str(e)}", exc_info=True)
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
    
    logger.info(f"Profile photo upload initiated for user: {current_user.email}")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        logger.warning(f"Invalid file type for photo upload: {file.content_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    file_bytes = await file.read()
    if len(file_bytes) > max_size:
        logger.warning(f"File size exceeded for photo upload: {len(file_bytes)} bytes")
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
        
        logger.info(f"Profile photo uploaded successfully for user: {current_user.email}")
        return current_user
    except Exception as e:
        logger.error(f"Profile photo upload failed for {current_user.email}: {str(e)}", exc_info=True)
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
    
    logger.info(f"Profile photo deletion requested for user: {current_user.email}")
    
    if not current_user.profile_photo_url:
        logger.warning(f"No profile photo to delete for user: {current_user.email}")
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
        
        logger.info(f"Profile photo deleted successfully for user: {current_user.email}")
        return current_user
    except Exception as e:
        logger.error(f"Profile photo deletion failed for {current_user.email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete profile photo: {str(e)}"
        )


@router.put("/profile/case-location-preference", response_model=UserOut)
async def update_case_location_preference(
    data: CaseLocationPreferenceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user's case location preference for case generation."""
    logger.info(f"Case location preference update for user: {current_user.email} -> {data.case_location_preference}")
    
    try:
        current_user.case_location_preference = data.case_location_preference
        
        # Only update preferred_case_state if preference is specific_state
        if data.case_location_preference == "specific_state":
            current_user.preferred_case_state = data.preferred_case_state
        else:
            current_user.preferred_case_state = None
        
        await current_user.save()
        logger.info(f"Case location preference updated for user: {current_user.email}")
        return current_user
    except Exception as e:
        logger.error(f"Failed to update case location preference for {current_user.email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update case location preference: {str(e)}"
        )


@router.get("/oauth/state")
async def get_oauth_state():
    """Generate a secure state token for Google OAuth."""
    state = generate_state_token()
    return {"state": state}


@router.post("/risc/webhook")
async def risc_webhook(request: Request):
    """
    Google Cross-Account Protection (RISC) Webhook.
    Receives security events (token revocation, account disabled).
    """
    # 1. Verify Authorization Header
    # (Google doesn't use standard Auth header for RISC validation mostly relies on signed JWT)
    
    try:
        # Get raw body as it's a signed JWT
        body_bytes = await request.body()
        token = body_bytes.decode('utf-8')
        
        # Verify the token
        claims = await verify_risc_token(token)
        
        logger.warning(f"Received RISC security event: {claims}")
        
        # Handle specific events
        # https://schemas.openid.net/secevent/risc/event-type/account-disabled
        # https://schemas.openid.net/secevent/risc/event-type/sessions-revoked
        
        event_type = None
        if 'events' in claims:
            event_type = list(claims['events'].keys())[0]
            
        subject = claims.get('sub')
        email = claims.get('email')
        
        if subject or email:
            logger.info(f"Processing RISC event {event_type} for user {email or subject}")
            # Here we would invalidate user sessions
            # For JWT (stateless), we'd need a blacklist or short expiry times
            # Since we don't have a token blacklist implemented yet, we log it
            # TODO: Implement token blacklisting
            pass
            
        return {"status": "received"}
        
    except ValueError as e:
        logger.error(f"RISC webhook validation failed: {str(e)}")
        # Return 400/401 so Google knows something is wrong, but 202/200 if we just processed it
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"RISC webhook error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

