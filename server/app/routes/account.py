# app/routes/account.py
"""Account and security: password, signed-in devices, Google, notifications,
data export and deleting the account. Mounted under /auth."""

import io
import json
import zipfile
from datetime import UTC, timedelta

from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app import messages
from app.dependencies import Session, get_current_user, get_session
from app.logging_config import get_logger
from app.models.case import Case
from app.models.case_outcome import CaseOutcomeRecord
from app.models.user import NotificationPrefs, User
from app.models.user_session import UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    CodeRequest,
    DeleteAccountRequest,
    EmailCodeRequest,
    GoogleLinkRequest,
)
from app.schemas.user import UserOut
from app.services.auth import day, find_user_by_email, ph, revoke_sessions
from app.services.email import send_email, send_security_alert
from app.services.google_auth import (
    create_google_signup_token,
    exchange_code_for_token,
    read_google_signup_token,
    validate_state_token,
    verified_google_account,
)
from app.services.otp import create_otp, verify_otp
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import RateLimiter, login_failure_email_limiter

logger = get_logger(__name__)

router = APIRouter()

DELETE_CODE = "delete_account"
EMAIL_CODE = "email_change"
GOOGLE_LINK = "google_link"
# One deletion code per 30 seconds; each lasts settings.otp_expire_minutes.
delete_code_cooldown = RateLimiter(1, 30, "delete_code")
email_code_cooldown = RateLimiter(1, 30, "email_code")
EXPORT_EVERY = timedelta(days=1)


async def check_password(user: User, password: str) -> None:
    """400 unless ``password`` is the user's; wrong guesses count toward a lockout."""
    if user.password_hash is None:
        raise HTTPException(status_code=400, detail=messages.NO_PASSWORD)
    key = f"password:{user.id}"
    await login_failure_email_limiter.ensure_available(key, messages.LOGIN_LOCKED)
    try:
        ph.verify(user.password_hash, password)
    except VerifyMismatchError:
        await login_failure_email_limiter.register_usage(key)
        raise HTTPException(status_code=400, detail=messages.WRONG_PASSWORD)


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------


@router.put("/password")
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Change the password, then sign out every other device."""
    await check_password(user, data.current_password)
    user.password_hash = ph.hash(data.new_password)
    user.password_changed_at = get_current_datetime()
    await user.save()
    assert user.id is not None
    revoked = await revoke_sessions(user.id, keep_sid=session.id)
    if user.email:
        await send_security_alert(
            user.email,
            "Password changed",
            ["Your password was changed. Your other devices were signed out."],
        )
    logger.info(f"Password changed for user {user.id}; {revoked} other session(s) out")
    return {"message": "Password changed.", "signed_out": revoked}


# ---------------------------------------------------------------------------
# Signed-in devices
# ---------------------------------------------------------------------------


@router.get("/sessions")
async def list_sessions(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    """Devices signed in to this account: this one first, then most recent."""
    found = await UserSession.find(
        UserSession.user_id == user.id,
        UserSession.revoked == False,
        UserSession.expires_at > get_current_datetime(),
    ).to_list()

    def recent(s: UserSession) -> float:
        at = s.last_active
        return (at if at.tzinfo else at.replace(tzinfo=UTC)).timestamp()

    found.sort(key=lambda s: (s.sid != session.id, -recent(s)))
    return {
        "sessions": [
            {
                "id": str(s.id),
                "user_agent": s.user_agent,
                "ip": s.ip,
                "created_at": s.created_at,
                "last_active": s.last_active,
                "current": s.sid == session.id,
            }
            for s in found
        ]
    }


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    assert user.id is not None
    revoked = await revoke_sessions(user.id, keep_sid=session.id)
    return {"signed_out": revoked}


# ---------------------------------------------------------------------------
# Google
# ---------------------------------------------------------------------------


async def google_account_from(data: GoogleLinkRequest) -> tuple[str, str, dict]:
    """(email, Google id, claims) from a sign-in or an earlier link token."""
    if data.link_token:
        claims = read_google_signup_token(data.link_token, purpose=GOOGLE_LINK)
        if not claims:
            raise HTTPException(
                status_code=400,
                detail="This Google sign-in has expired. Connect Google again.",
            )
        return claims["email"], claims["sub"], {}
    credential = data.credential
    if data.code:
        if not data.state or not validate_state_token(data.state):
            raise HTTPException(status_code=400, detail="Invalid or expired state.")
        credential = (await exchange_code_for_token(data.code)).get("id_token")
    if not credential:
        raise HTTPException(status_code=400, detail="A Google sign-in is required.")
    return await verified_google_account(credential)


@router.post("/google/link")
async def link_google(data: GoogleLinkRequest, user: User = Depends(get_current_user)):
    """Connect a Google account for signing in.

    A phone account without an email takes the Google email. When the emails
    differ and ``use_google_email`` is left out, nothing is linked yet: the reply
    asks which email to keep and carries a link token for the second request.
    """
    email, google_id, info = await google_account_from(data)

    holder = await User.find_one(User.google_id == google_id)
    if holder is not None and holder.id != user.id:
        raise HTTPException(status_code=409, detail=messages.GOOGLE_LINKED_ELSEWHERE)
    if user.google_id and user.google_id != google_id:
        raise HTTPException(status_code=409, detail=messages.GOOGLE_ALREADY_LINKED)

    differs = user.email is not None and email != user.email.lower()
    if differs and data.use_google_email is None:
        return {
            "needs_choice": True,
            "google_email": email,
            "link_token": create_google_signup_token(
                google_id, email, purpose=GOOGLE_LINK
            ),
        }
    if user.email is None or (differs and data.use_google_email):
        other = await find_user_by_email(email)
        if other is not None and other.id != user.id:
            raise HTTPException(status_code=409, detail=messages.EMAIL_TAKEN)
        user.email = email
    user.google_id = google_id
    user.google_email = email
    if not user.profile_photo_url and info.get("picture"):
        user.profile_photo_url = info["picture"]
    await user.save()
    logger.info(f"Google connected for user {user.id}")
    return UserOut.model_validate(user)


@router.delete("/google/link", response_model=UserOut)
async def unlink_google(user: User = Depends(get_current_user)):
    if not user.google_id:
        raise HTTPException(status_code=400, detail=messages.GOOGLE_NOT_LINKED)
    if user.sign_in_method == "google":
        raise HTTPException(status_code=400, detail=messages.GOOGLE_STAYS)
    user.google_id = None
    user.google_email = None
    await user.save()
    return user


# ---------------------------------------------------------------------------
# Adding an email to a phone account: proven by a code sent to it
# ---------------------------------------------------------------------------


async def ensure_email_free(email: str, user: User) -> None:
    holder = await find_user_by_email(email)
    if holder is not None and holder.id != user.id:
        raise HTTPException(status_code=409, detail=messages.EMAIL_TAKEN)


@router.post("/profile/email/send-code")
async def send_email_code(
    data: EmailCodeRequest, user: User = Depends(get_current_user)
):
    """Send a code to the email a phone account wants to add."""
    if user.sign_in_method != "phone":
        raise HTTPException(status_code=400, detail=messages.EMAIL_LOCKED)
    await ensure_email_free(data.email, user)
    key = str(user.id)
    await email_code_cooldown.ensure_available(
        key, "Wait 30 seconds before asking for another code."
    )
    await create_otp(data.email, is_registration=False, purpose=EMAIL_CODE)
    await email_code_cooldown.register_usage(key)
    user.pending_email = data.email
    await user.save()
    return {"sent_to": data.email}


@router.post("/profile/email/verify", response_model=UserOut)
async def verify_email_code(data: CodeRequest, user: User = Depends(get_current_user)):
    """Set the pending email once its code is entered."""
    email = user.pending_email
    if not email or not await verify_otp(
        email, data.code, is_registration=False, purpose=EMAIL_CODE
    ):
        raise HTTPException(status_code=400, detail=messages.CODE_INVALID)
    await ensure_email_free(email, user)
    user.email = email
    user.pending_email = None
    await user.save()
    logger.info(f"Email added to phone account {user.id}")
    return user


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@router.put("/profile/notification-preference", response_model=UserOut)
async def update_notification_prefs(
    data: NotificationPrefs, user: User = Depends(get_current_user)
):
    user.notification_prefs = data
    await user.save()
    return user


# ---------------------------------------------------------------------------
# Download your data
# ---------------------------------------------------------------------------


async def build_export(user: User) -> bytes:
    """A ZIP of JSON files: the profile, every case (archived too, with its
    proceedings, interviews and evidence) and the decided-case record."""
    cases = await Case.find(Case.user_id == user.id).to_list()
    outcomes = await CaseOutcomeRecord.find(
        CaseOutcomeRecord.user_id == user.id
    ).to_list()
    files = {
        "profile.json": UserOut.model_validate(user).model_dump(mode="json"),
        "cases.json": [
            case.model_dump(mode="json", exclude=Case.HIDDEN) for case in cases
        ],
        "outcomes.json": [o.model_dump(mode="json") for o in outcomes],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, json.dumps(content, indent=2, ensure_ascii=False))
    return buffer.getvalue()


async def email_export(user: User) -> None:
    """Background task: build the export and email it as an attachment."""
    if not user.email:
        return
    stamp = get_current_datetime()
    data = await build_export(user)
    await send_email(
        user.email,
        "Your data - AI Courtroom",
        "<html><body><h2>AI Courtroom - Your data</h2>"
        "<p>Your profile, cases, proceedings and settings are attached as a ZIP "
        "of JSON files.</p></body></html>",
        attachments=((f"ai-courtroom-data-{stamp:%Y-%m-%d}.zip", data),),
    )
    logger.info(f"Data export emailed to user {user.id} ({len(data)} bytes)")


@router.post("/export")
async def request_export(
    background_tasks: BackgroundTasks, user: User = Depends(get_current_user)
):
    """Email the user a copy of their data, at most once a day."""
    if not user.email:
        raise HTTPException(status_code=400, detail=messages.NO_EMAIL)
    now = get_current_datetime()
    last = user.data_export_requested_at
    if last is not None:
        if last.tzinfo is None:  # MongoDB returns naive UTC
            last = last.replace(tzinfo=UTC)
        if now - last < EXPORT_EVERY:
            raise HTTPException(status_code=429, detail=messages.EXPORT_LIMIT)
    user.data_export_requested_at = now
    await user.save()
    background_tasks.add_task(email_export, user)
    return {"requested_at": now, "email": user.email}


# ---------------------------------------------------------------------------
# Delete account (soft: restorable for User.DELETION_GRACE)
# ---------------------------------------------------------------------------


def code_address(user: User) -> str | None:
    """Where a deletion code goes: the email, or by SMS for a phone account."""
    if user.email:
        return user.email
    if user.phone_code and user.phone_number:
        return f"+{user.phone_code}{user.phone_number}"
    return None


@router.post("/account/delete-code")
async def send_delete_code(user: User = Depends(get_current_user)):
    """Send a code that confirms deletion, for accounts without a password."""
    address = code_address(user)
    if address is None:
        raise HTTPException(status_code=400, detail=messages.NO_EMAIL)
    key = str(user.id)
    await delete_code_cooldown.ensure_available(
        key, "Wait 30 seconds before asking for another code."
    )
    await create_otp(
        address,
        is_registration=False,
        channel="email" if user.email else "sms",
        purpose=DELETE_CODE,
    )
    await delete_code_cooldown.register_usage(key)
    return {"sent_to": address}


@router.delete("/account")
async def delete_account(
    data: DeleteAccountRequest, user: User = Depends(get_current_user)
):
    """Soft-delete: sign out everywhere and block sign-in. Support can restore
    the account for 30 days; then it's purged."""
    if data.password:
        await check_password(user, data.password)
    elif not (address := code_address(user)) or not await verify_otp(
        address, data.code or "", is_registration=False, purpose=DELETE_CODE
    ):
        raise HTTPException(status_code=400, detail=messages.DELETE_CODE_INVALID)

    user.deleted_at = get_current_datetime()
    await user.save()
    assert user.id is not None
    await revoke_sessions(user.id)
    until = user.recoverable_until
    if user.email and until is not None:
        await send_security_alert(
            user.email,
            "Account deleted",
            [
                "Your AI Courtroom account was deleted and every device signed out.",
                (
                    f"We keep it until {day(until)}. To recover it before then, "
                    "contact us with the subject Account Recovery."
                ),
            ],
        )
    logger.info(f"Account deleted (soft) for user {user.id}")
    return {"deleted": True, "recoverable_until": until}
