# app/routes/auth.py
import time
from datetime import date

from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app import messages
from app.config import settings
from app.dependencies import Session, get_current_user, get_session
from app.logging_config import get_logger
from app.models.case import Case
from app.models.otp import LoginVerifyRequest, RegistrationVerifyRequest
from app.models.user import TokenResponse, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    GoogleLoginRequest,
    PhoneOtpRequest,
    PhoneVerifyRequest,
    ProfileUpdateRequest,
    ResetPasswordRequest,
)
from app.schemas.stats import UserStatsOut
from app.schemas.user import (
    CaseLocationPreferenceUpdate,
    RagPreferenceUpdate,
    StatsPreferenceUpdate,
    UserCreate,
    UserOut,
)
from app.services import cloudinary_service
from app.services.auth import (
    Device,
    create_password_reset_token,
    create_user,
    find_user_by_email,
    issue_token,
    ph,
    revoke_sessions,
    user_from_reset_token,
)
from app.services.cloudinary_service import extract_public_id_from_url
from app.services.email import send_password_reset_email
from app.services.google_auth import (
    authenticate_google_user,
    exchange_code_for_token,
    generate_state_token,
    read_google_signup_token,
    validate_state_token,
    verify_risc_token,
)
from app.services.otp import create_otp, verify_otp
from app.services.user_stats import compute_user_stats
from app.utils.rate_limiter import (
    login_failure_email_limiter,
    login_failure_ip_limiter,
    otp_send_rate_limiter,
)

logger = get_logger(__name__)

router = APIRouter()


@router.post("/register/initiate")
async def initiate_registration(user_data: UserCreate, request: Request):
    logger.info(f"Registration initiated for email: {user_data.email}")

    # Add duplicate check
    existing_user = await find_user_by_email(user_data.email)
    if existing_user:
        logger.warning(
            f"Registration failed - email already registered: {user_data.email}"
        )
        raise HTTPException(status_code=400, detail="Email already registered")

    # A Google registration skips the email OTP, so it must carry our signed
    # proof that Google verified this email; never trust a client google_id.
    if user_data.google_id or user_data.google_signup_token:
        claims = read_google_signup_token(user_data.google_signup_token or "")
        if not claims or claims.get("email", "").lower() != user_data.email.lower():
            logger.warning(
                f"Rejected Google registration without valid proof: {user_data.email}"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google sign-up expired or does not match this email. Please continue with Google again.",
            )
        user_data.google_id = claims["sub"]

    # If registering via Google, skip OTP and directly create user
    if user_data.google_id:
        logger.info(f"Google registration detected for: {user_data.email}")
        try:
            user = await create_user(user_data)
            logger.info(f"User created successfully via Google: {user_data.email}")
            access_token = await issue_token(user, device=device_of(request))

            return {
                "access_token": access_token,
                "token_type": "bearer",
                "skip_otp": True,
            }
        except HTTPException as e:
            logger.error(
                f"Google registration failed for {user_data.email}: {e.detail}"
            )
            raise
        except Exception:
            logger.exception(
                f"Unexpected error during Google registration for {user_data.email}"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating user.",
            )

    # Generate and send OTP for regular registrations
    await create_otp(user_data.email, is_registration=True)
    logger.info(f"OTP sent for registration: {user_data.email}")

    # Store user data temporarily (you might want to use Redis or a similar solution for this)
    # For simplicity, we'll return a success message and expect the client to send the data again
    return {"message": "OTP sent to your email for verification", "skip_otp": False}


@router.post(
    "/register/verify",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenResponse,
)
async def verify_registration(data: RegistrationVerifyRequest, request: Request):
    logger.info(f"Registration verification attempted for: {data.user_data.email}")

    # Verify OTP
    is_valid = await verify_otp(data.user_data.email, data.otp, is_registration=True)
    if not is_valid:
        logger.warning(f"Invalid OTP for registration: {data.user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID
        )

    # Create the user
    try:
        user = await create_user(data.user_data)
        logger.info(f"User created successfully: {data.user_data.email}")
        access_token = await issue_token(user, data.remember_me, device_of(request))

        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException as e:
        logger.error(
            f"Registration verification failed for {data.user_data.email}: {e.detail}"
        )
        raise
    except Exception:
        logger.exception(
            f"Unexpected error during registration for {data.user_data.email}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating user.",
        )


def client_ip(request: Request) -> str:
    """The caller's IP as seen by our hosting proxy.

    Render's proxy appends the address it received the request from to
    X-Forwarded-For, so the rightmost entry is the one a client can't forge
    (anything to its left may be client-supplied). Without the header (local
    dev) the TCP peer is used.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    if hops:
        return hops[-1]
    return request.client.host if request.client else "unknown"


def device_of(request: Request) -> Device:
    """The device a sign-in request came from, for the signed-in devices list."""
    return Device(ip=client_ip(request), user_agent=request.headers.get("user-agent"))


@router.post("/login/initiate")
async def initiate_login(login_data: dict, request: Request):
    email = login_data.get("email")
    password = login_data.get("password")
    logger.info(f"Login initiated for: {email}")

    if not isinstance(email, str) or not isinstance(password, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required",
        )

    # Checked before the password so a locked-out guesser learns nothing more.
    email = email.strip().lower()
    email_key = email
    ip_key = client_ip(request)
    locked = messages.LOGIN_LOCKED
    await login_failure_email_limiter.ensure_available(email_key, locked)
    await login_failure_ip_limiter.ensure_available(ip_key, locked)

    async def record_failure():
        await login_failure_email_limiter.register_usage(email_key)
        await login_failure_ip_limiter.register_usage(ip_key)

    # Check if user exists and verify password
    user = await find_user_by_email(email)
    if not user:
        logger.warning(f"Login failed - email not registered: {email} (ip {ip_key})")
        await record_failure()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email not registered"
        )

    # Check if this is a Google-only user (no password set)
    if user.password_hash is None:
        logger.warning(
            f"Login failed - Google-only account tried password login: {email}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In. Please use the 'Continue with Google' button to log in.",
        )

    # Verify password
    try:
        ph.verify(user.password_hash, password)
    except VerifyMismatchError:
        logger.warning(f"Login failed - password mismatch for: {email} (ip {ip_key})")
        await record_failure()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    # Generate and send OTP
    await create_otp(email, is_registration=False)
    logger.info(f"OTP sent for login: {email}")

    return {"message": "OTP sent to your email for verification"}


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Adjourn hearings this device was running; the client then drops its token."""
    adjourned = await Case.adjourn_session_cases(current_user.id, session.id)
    logger.info(f"Logout for {current_user.email}: adjourned {adjourned} case(s)")
    return {"adjourned_cases": adjourned}


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
                status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID
            )

        # Get the user
        user = await find_user_by_email(data.email)
        if not user:
            logger.error(f"User not found after OTP verification: {data.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="User not found"
            )

        # Hearings still running belong to a session that ended (e.g. expired).
        await Case.adjourn_abandoned_cases(user.id)

        access_token = await issue_token(user, data.remember_me, device_of(request))

        logger.info(f"Login successful for: {data.email}")
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as e:
        logger.error(f"Invalid login request format: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request format.",
        )


@router.get("/profile", response_model=UserOut)
async def profile(current_user: User = Depends(get_current_user)):
    logger.debug(f"Profile fetched for user: {current_user.email}")
    return current_user


@router.put("/profile", response_model=UserOut)
async def update_profile(
    data: ProfileUpdateRequest, current_user: User = Depends(get_current_user)
):
    """Update user profile - only updates fields that are provided."""

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
            dob = date.fromisoformat(data.date_of_birth)
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
        logger.error(f"Invalid profile update data for {current_user.email}: {e!s}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid data."
        )


@router.post("/google")
async def google_login(data: GoogleLoginRequest, request: Request):
    """
    Authenticate user with Google OAuth.
    Supports:
    1. Authorization Code Flow (code) - web; the code is exchanged server-side
    2. ID token (credential) - native Google sign-in
    """
    logger.info("Google authentication initiated")
    try:
        # If using Authorization Code Flow
        if data.code:
            # 1. The state proves this code flow was started by our own page (CSRF).
            if not data.state or not validate_state_token(data.state):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired state parameter",
                )

            # 2. Exchange code for tokens
            tokens = await exchange_code_for_token(data.code)

            # 3. Use the ID token from the exchange
            result = await authenticate_google_user(
                credential=tokens.get("id_token"),
                remember_me=data.remember_me,
                device=device_of(request),
            )
            return result

        result = await authenticate_google_user(
            credential=data.credential,
            remember_me=data.remember_me,
            device=device_of(request),
        )
        logger.info("Google authentication successful")
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Google authentication failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google authentication failed.",
        )


@router.post("/profile/photo", response_model=UserOut)
async def upload_profile_photo(
    file: UploadFile = File(...), current_user: User = Depends(get_current_user)
):
    """Upload or update user's profile photo."""
    logger.info(f"Profile photo upload initiated for user: {current_user.email}")

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        logger.warning(f"Invalid file type for photo upload: {file.content_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}",
        )

    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    file_bytes = await file.read()
    if len(file_bytes) > max_size:
        logger.warning(f"File size exceeded for photo upload: {len(file_bytes)} bytes")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5MB limit",
        )

    try:
        # Get existing public_id if user has a photo
        existing_public_id = None
        if current_user.profile_photo_url:
            existing_public_id = extract_public_id_from_url(
                current_user.profile_photo_url
            )

        # Upload to Cloudinary
        secure_url, _ = await cloudinary_service.upload_profile_photo(
            file_bytes=file_bytes,
            user_id=str(current_user.id),
            existing_public_id=existing_public_id,
        )

        # Append cache-busting query param so browsers/CDN don't serve
        # the stale cached image (same public_id is reused on overwrite).
        cache_buster = int(time.time())
        if "?" in secure_url:
            secure_url = f"{secure_url}&v={cache_buster}"
        else:
            secure_url = f"{secure_url}?v={cache_buster}"

        # Update user profile
        current_user.profile_photo_url = secure_url
        await current_user.save()

        logger.info(
            f"Profile photo uploaded successfully for user: {current_user.email}"
        )
        return current_user
    except Exception:
        logger.exception(f"Profile photo upload failed for {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload profile photo.",
        )


@router.delete("/profile/photo", response_model=UserOut)
async def delete_profile_photo(current_user: User = Depends(get_current_user)):
    """Remove user's profile photo."""
    logger.info(f"Profile photo deletion requested for user: {current_user.email}")

    if not current_user.profile_photo_url:
        logger.warning(f"No profile photo to delete for user: {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No profile photo to delete"
        )

    try:
        # Extract public_id and delete from Cloudinary
        public_id = extract_public_id_from_url(current_user.profile_photo_url)
        if public_id:
            await cloudinary_service.delete_profile_photo(public_id)

        # Update user profile
        current_user.profile_photo_url = None
        await current_user.save()

        logger.info(
            f"Profile photo deleted successfully for user: {current_user.email}"
        )
        return current_user
    except Exception:
        logger.exception(f"Profile photo deletion failed for {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete profile photo.",
        )


@router.put("/profile/case-location-preference", response_model=UserOut)
async def update_case_location_preference(
    data: CaseLocationPreferenceUpdate, current_user: User = Depends(get_current_user)
):
    """Update user's case location preference for case generation."""
    logger.info(
        f"Case location preference update for user: {current_user.email} -> {data.case_location_preference}"
    )

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
    except Exception:
        logger.exception(
            f"Failed to update case location preference for {current_user.email}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update case location preference.",
        )


@router.put("/profile/rag-preference", response_model=UserOut)
async def update_rag_preference(
    data: RagPreferenceUpdate, current_user: User = Depends(get_current_user)
):
    """Update whether the user's LLM calls use retrieved case memory."""
    logger.info(
        f"RAG preference update for user: {current_user.email} -> {data.rag_enabled}"
    )

    try:
        current_user.rag_enabled = data.rag_enabled
        await current_user.save()
        logger.info(f"RAG preference updated for user: {current_user.email}")
        return current_user
    except Exception:
        logger.exception(f"Failed to update RAG preference for {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update RAG preference.",
        )


@router.put("/profile/stats-preference", response_model=UserOut)
async def update_stats_preference(
    data: StatsPreferenceUpdate, current_user: User = Depends(get_current_user)
):
    """Update how partly successful cases count toward the user's win rate."""
    logger.info(
        f"Stats preference update for user: {current_user.email} -> {data.partial_scoring}"
    )

    try:
        current_user.partial_scoring = data.partial_scoring
        await current_user.save()
        return current_user
    except Exception:
        logger.exception(f"Failed to update stats preference for {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update stats preference.",
        )


@router.get("/profile/stats", response_model=UserStatsOut)
async def profile_stats(current_user: User = Depends(get_current_user)):
    """Win/loss record and activity stats for the profile page."""
    try:
        return await compute_user_stats(current_user)
    except Exception:
        logger.exception(f"Failed to compute stats for {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load stats.",
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
        token = body_bytes.decode("utf-8")

        # Verify the token
        claims = await verify_risc_token(token)

        logger.warning(f"Received RISC security event: {claims}")

        # Handle specific events
        # https://schemas.openid.net/secevent/risc/event-type/account-disabled
        # https://schemas.openid.net/secevent/risc/event-type/sessions-revoked

        event_type = None
        if "events" in claims:
            event_type = next(iter(claims["events"]))

        subject = claims.get("sub")
        email = claims.get("email")

        if subject or email:
            logger.info(
                f"Processing RISC event {event_type} for user {email or subject}"
            )
            # Here we would invalidate user sessions
            # For JWT (stateless), we'd need a blacklist or short expiry times
            # Since we don't have a token blacklist implemented yet, we log it
            # TODO: Implement token blacklisting

        return {"status": "received"}

    except ValueError as e:
        logger.error(f"RISC webhook validation failed: {e!s}")
        # Return 400/401 so Google knows something is wrong, but 202/200 if we just processed it
        raise HTTPException(status_code=400, detail="Invalid security event token.")
    except Exception:
        logger.exception("RISC webhook error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ---------------------------------------------------------------------------
# Phone sign-in and sign-up (SMS code). Hidden unless PHONE_AUTH_ENABLED.
# ---------------------------------------------------------------------------


def require_phone_auth() -> None:
    if not settings.phone_auth_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


async def find_phone_user(phone_code: str, phone_number: str) -> User | None:
    """The account created with this number (email accounts may list a phone too)."""
    return await User.find_one(
        User.auth_method == "phone",
        User.phone_code == phone_code,
        User.phone_number == phone_number,
    )


@router.post("/phone/send-otp", dependencies=[Depends(require_phone_auth)])
async def send_phone_otp(data: PhoneOtpRequest):
    existing = await find_phone_user(data.phone_code, data.phone_number)
    if data.purpose == "login" and existing is None:
        raise HTTPException(status_code=400, detail=messages.PHONE_NOT_REGISTERED)
    if data.purpose == "register" and existing is not None:
        raise HTTPException(status_code=400, detail=messages.PHONE_TAKEN)

    await create_otp(
        data.e164, is_registration=data.purpose == "register", channel="sms"
    )
    logger.info(f"SMS code sent for {data.purpose}: {data.e164}")
    return {"message": "Code sent by SMS."}


@router.post("/phone/verify", dependencies=[Depends(require_phone_auth)])
async def verify_phone_otp(data: PhoneVerifyRequest, request: Request):
    registering = data.purpose == "register"
    if not await verify_otp(data.e164, data.otp, is_registration=registering):
        raise HTTPException(status_code=400, detail=messages.OTP_INVALID)

    user = await find_phone_user(data.phone_code, data.phone_number)
    if registering:
        if user is not None:  # enrolled from another tab meanwhile
            raise HTTPException(status_code=400, detail=messages.PHONE_TAKEN)
        user = await User(
            first_name=(data.first_name or "").strip(),
            last_name=(data.last_name or "").strip(),
            phone_code=data.phone_code,
            phone_number=data.phone_number,
            auth_method="phone",
        ).insert()
        logger.info(f"User created via phone: {user.id}")
    elif user is None:
        raise HTTPException(status_code=400, detail=messages.PHONE_NOT_REGISTERED)
    else:
        await Case.adjourn_abandoned_cases(user.id)

    token = await issue_token(user, data.remember_me, device_of(request))
    return {"access_token": token, "token_type": "bearer"}


# ---------------------------------------------------------------------------
# Forgot password: an emailed link (signed, 30 minutes, single use)
# ---------------------------------------------------------------------------


@router.post("/password/forgot")
async def forgot_password(data: ForgotPasswordRequest, request: Request):
    """Email a reset link. The reply never says whether the account exists."""
    key = f"reset:{data.email}"
    await otp_send_rate_limiter.ensure_available(key, messages.OTP_SEND_LIMIT)
    await otp_send_rate_limiter.register_usage(key)

    user = await find_user_by_email(data.email)
    if user is not None and user.email:
        base = settings.app_url_for(request.headers.get("origin"))
        link = f"{base}/forgot-password?token={create_password_reset_token(user)}"
        await send_password_reset_email(user.email, link)
        logger.info(f"Password reset link sent to user {user.id}")
    else:
        logger.info(f"Password reset asked for an unknown email: {data.email}")
    return {"message": messages.RESET_LINK_SENT}


@router.post("/password/reset")
async def reset_password(data: ResetPasswordRequest):
    """Set a new password from a reset link and sign out every device."""
    user = await user_from_reset_token(data.token)
    if user is None or user.id is None:
        raise HTTPException(status_code=400, detail=messages.RESET_LINK_INVALID)

    user.password_hash = ph.hash(data.password)
    await user.save()
    revoked = await revoke_sessions(user.id)
    logger.info(f"Password reset for user {user.id}; {revoked} session(s) revoked")
    return {"message": messages.PASSWORD_CHANGED}
