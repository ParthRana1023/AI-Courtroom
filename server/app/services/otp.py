# app/services/otp.py
import secrets
from datetime import UTC
from typing import Literal

from app import messages
from app.config import settings
from app.logging_config import get_logger
from app.models.otp import OTP
from app.services.email import send_otp_email
from app.services.sms import send_sms
from app.utils.datetime import create_expiry_time, get_current_datetime
from app.utils.rate_limiter import otp_send_rate_limiter

logger = get_logger(__name__)


def generate_otp(length: int = 6) -> str:
    """Generate a random OTP of specified length"""
    return "".join(secrets.choice("0123456789") for _ in range(length))


async def create_otp(
    email: str,
    is_registration: bool = True,
    channel: Literal["email", "sms"] = "email",
) -> str:
    """Create, store and deliver an OTP.

    ``email`` is the address the code belongs to; for ``channel="sms"`` it is the
    E.164 phone number instead (the OTP collection keys both by this field).
    """
    logger.info(f"Creating OTP for: {email}, is_registration={is_registration}")

    # Stops anyone from flooding an inbox (or our mail quota) with codes.
    await otp_send_rate_limiter.ensure_available(email, messages.OTP_SEND_LIMIT)

    # Delete any existing OTPs for this email
    await OTP.find(OTP.email == email).delete()
    logger.debug(f"Deleted existing OTPs for: {email}")

    # Generate new OTP
    otp_code = generate_otp()
    # Calculate expiry time using utility function
    expiry_ist = create_expiry_time(settings.otp_expire_minutes)
    expiry_utc = expiry_ist.astimezone(UTC)

    # Store OTP in database (UTC time)
    otp = OTP(
        email=email, otp=otp_code, expiry=expiry_utc, is_registration=is_registration
    )
    logger.debug(f"Inserting OTP for: {email}, expiry={expiry_utc}")
    await otp.insert()
    await otp_send_rate_limiter.register_usage(email)
    logger.debug(f"OTP inserted successfully for: {email}")

    if channel == "sms":
        await send_sms(
            email,
            f"{otp_code} is your AI Courtroom code. "
            f"It expires in {settings.otp_expire_minutes} minutes.",
        )
    else:
        await send_otp_email(email, otp_code, is_registration)

    return otp_code


async def verify_otp(
    email: str, otp_code: str, is_registration: bool | None = None
) -> bool:
    """Check an OTP and consume it on success, so each code works only once.

    Every check uses up one of ``settings.otp_max_attempts`` tries; after the
    last one the code is discarded, so a 6-digit code can't be brute-forced.
    If ``is_registration`` is given, the OTP must have been issued for that purpose.
    """
    filters = [OTP.email == email]
    if is_registration is not None:
        filters.append(OTP.is_registration == is_registration)

    otp_doc = await OTP.find_one(*filters)
    if not otp_doc:
        logger.warning(f"OTP not found for: {email}")
        return False

    # MongoDB returns naive UTC datetimes
    expiry = otp_doc.expiry
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    if expiry < get_current_datetime():
        logger.warning(f"OTP expired for: {email}")
        await OTP.find(OTP.email == email).delete()
        return False

    # Claim a try atomically, so parallel guesses can't exceed the limit.
    # ($not/$gte also matches OTPs stored before the attempts field existed.)
    claimed = await OTP.get_pymongo_collection().update_one(
        {"_id": otp_doc.id, "attempts": {"$not": {"$gte": settings.otp_max_attempts}}},
        {"$inc": {"attempts": 1}},
    )
    tries_used = otp_doc.attempts + 1
    if not claimed.modified_count or not secrets.compare_digest(otp_doc.otp, otp_code):
        if not claimed.modified_count or tries_used >= settings.otp_max_attempts:
            await otp_doc.delete()
            logger.warning(f"OTP discarded after too many attempts for: {email}")
        else:
            logger.warning(f"Wrong OTP for: {email}")
        return False

    await otp_doc.delete()
    logger.info(f"OTP verified for: {email}")
    return True
