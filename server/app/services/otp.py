# app/services/otp.py
import random
import string
from datetime import UTC

from app.config import settings
from app.logging_config import get_logger
from app.models.otp import OTP
from app.services.email import send_otp_email
from app.utils.datetime import create_expiry_time, get_current_datetime

logger = get_logger(__name__)


def generate_otp(length: int = 6) -> str:
    """Generate a random OTP of specified length"""
    return "".join(random.choices(string.digits, k=length))


async def create_otp(email: str, is_registration: bool = True) -> str:
    """Create and store OTP for a user"""
    logger.info(f"Creating OTP for: {email}, is_registration={is_registration}")

    # Delete any existing OTPs for this email
    await OTP.find(OTP.email == email).delete()
    logger.debug(f"Deleted existing OTPs for: {email}")

    # Generate new OTP
    otp_code = generate_otp()
    # Calculate expiry time using utility function
    expiry_ist = create_expiry_time(settings.access_token_expire_minutes)
    expiry_utc = expiry_ist.astimezone(UTC)

    # Store OTP in database (UTC time)
    otp = OTP(
        email=email, otp=otp_code, expiry=expiry_utc, is_registration=is_registration
    )
    logger.debug(f"Inserting OTP for: {email}, expiry={expiry_utc}")
    await otp.insert()
    logger.debug(f"OTP inserted successfully for: {email}")

    # Send OTP via email
    await send_otp_email(email, otp_code, is_registration)

    return otp_code


async def verify_otp(
    email: str, otp_code: str, is_registration: bool | None = None
) -> bool:
    """Check an OTP and consume it on success, so each code works only once.

    If ``is_registration`` is given, the OTP must have been issued for that purpose.
    """
    filters = [OTP.email == email, OTP.otp == otp_code]
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

    await otp_doc.delete()
    logger.info(f"OTP verified for: {email}")
    return True
