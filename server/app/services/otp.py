# app/services/otp.py
import secrets
from datetime import UTC
from typing import Literal

from fastapi import HTTPException

from app import messages
from app.config import settings
from app.logging_config import get_logger
from app.models.otp import OTP
from app.services.email import (
    send_delete_code_email,
    send_email_change_code,
    send_otp_email,
)
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
    purpose: str | None = None,
) -> str:
    """Create, store and deliver an OTP.

    ``email`` is the address the code belongs to; for ``channel="sms"`` it is the
    E.164 phone number instead (the OTP collection keys both by this field).
    """
    # The address isn't logged: it may be a phone number. The request id ties
    # these lines to their request.
    logger.info(f"Creating OTP ({channel}), is_registration={is_registration}")

    # Stops anyone from flooding an inbox (or our mail quota) with codes.
    await otp_send_rate_limiter.ensure_available(email, messages.OTP_SEND_LIMIT)

    # Delete any existing OTPs for this email
    await OTP.find(OTP.email == email).delete()
    logger.debug("Deleted existing OTPs")

    # Generate new OTP
    otp_code = generate_otp()
    # Calculate expiry time using utility function
    expiry_ist = create_expiry_time(settings.otp_expire_minutes)
    expiry_utc = expiry_ist.astimezone(UTC)

    # Store OTP in database (UTC time)
    otp = OTP(
        email=email,
        otp=otp_code,
        expiry=expiry_utc,
        is_registration=is_registration,
        purpose=purpose,
    )
    logger.debug(f"Inserting OTP, expiry={expiry_utc}")
    await otp.insert()
    await otp_send_rate_limiter.register_usage(email)
    logger.debug("OTP inserted")

    if channel == "sms":
        purpose_text = " to delete your account" if purpose == "delete_account" else ""
        sent = await send_sms(
            email,
            f"{otp_code} is your AI Courtroom code{purpose_text}. "
            f"It expires in {settings.otp_expire_minutes} minutes.",
        )
    elif purpose == "delete_account":
        sent = await send_delete_code_email(email, otp_code)
    elif purpose == "email_change":
        sent = await send_email_change_code(email, otp_code)
    else:
        sent = await send_otp_email(email, otp_code, is_registration)
    if not sent:
        # Say so, rather than "code sent" for a code that never arrives.
        await otp.delete()
        raise HTTPException(status_code=503, detail=messages.CODE_NOT_SENT)

    return otp_code


async def verify_otp(
    email: str,
    otp_code: str,
    is_registration: bool | None = None,
    purpose: str | None = None,
) -> bool:
    """Check an OTP and consume it on success, so each code works only once.

    Every check uses up one of ``settings.otp_max_attempts`` tries; after the
    last one the code is discarded, so a 6-digit code can't be brute-forced.
    If ``is_registration`` is given, the OTP must have been issued for that purpose.
    A code issued for another ``purpose`` (e.g. deleting the account) never
    signs anyone in.
    """
    filters = [OTP.email == email, OTP.purpose == purpose]
    if is_registration is not None:
        filters.append(OTP.is_registration == is_registration)

    otp_doc = await OTP.find_one(*filters)
    if not otp_doc:
        logger.warning("OTP not found")
        return False

    # MongoDB returns naive UTC datetimes
    expiry = otp_doc.expiry
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    if expiry < get_current_datetime():
        logger.warning("OTP expired")
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
            logger.warning("OTP discarded after too many attempts")
        else:
            logger.warning("Wrong OTP")
        return False

    # Used once: two requests with the right code at the same moment both pass the
    # check, but only the one whose delete removes it is let in.
    used = await OTP.get_pymongo_collection().delete_one({"_id": otp_doc.id})
    if not used.deleted_count:
        logger.warning("OTP already used")
        return False
    logger.info("OTP verified")
    return True
