# app/services/otp.py
import random
import string
import pytz
from app.models.otp import OTP
from app.services.email import send_otp_email
import motor.motor_asyncio
from app.config import settings
from typing import Optional
from app.utils.datetime import get_current_datetime, create_expiry_time
from app.logging_config import get_logger

logger = get_logger(__name__)

def generate_otp(length: int = 6) -> str:
    """Generate a random OTP of specified length"""
    return ''.join(random.choices(string.digits, k=length))

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
    expiry_utc = expiry_ist.astimezone(pytz.utc)
    
    # Store OTP in database (UTC time)
    otp = OTP(
        email=email,
        otp=otp_code,
        expiry=expiry_utc,
        is_registration=is_registration
    )
    logger.debug(f"Inserting OTP for: {email}, expiry={expiry_utc}")
    await otp.insert()
    logger.debug(f"OTP inserted successfully for: {email}")
    
    # Send OTP via email
    await send_otp_email(email, otp_code, is_registration)
    
    return otp_code

async def verify_otp(email: str, otp_code: str, is_registration: Optional[bool] = None) -> bool:
    """Verify OTP for a user
    
    Args:
        email: The email address to verify
        otp_code: The OTP code to verify
        is_registration: If provided, checks if the OTP was created for registration
    
    Returns:
        bool: True if OTP is valid, False otherwise
    """
    logger.info(f"Verifying OTP for: {email}")
    
    # Try direct MongoDB query first to avoid event loop issues
    try:
        client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
        db = client[settings.current_db_name]
        collection = db.get_collection("otp")
        
        # Build query dictionary with explicit typing to allow mixed value types
        query_dict: dict[str, object] = {"email": email, "otp": otp_code}
        if is_registration is not None:
            query_dict["is_registration"] = is_registration
            
        otp_doc_dict = await collection.find_one(query_dict)
        logger.debug(f"MongoDB query for OTP: email={email}")
        
        if otp_doc_dict:
            # Check if OTP is expired
            expiry_time = otp_doc_dict["expiry"]
            current_time = get_current_datetime()
            
            # If expiry_time is naive, assume it's UTC and make it UTC-aware
            if expiry_time.tzinfo is None:
                expiry_time_utc = pytz.utc.localize(expiry_time)
            else:
                expiry_time_utc = expiry_time.astimezone(pytz.utc)

            # Convert current time to UTC for reliable comparison
            current_time_utc = current_time.astimezone(pytz.utc)
            
            logger.debug(f"OTP expiry check: expiry_utc={expiry_time_utc}, current_utc={current_time_utc}")

            if expiry_time_utc < current_time_utc:
                logger.warning(f"OTP expired for: {email}")
                # Delete all OTPs for this email to ensure a fresh one is required
                await collection.delete_many({"email": email})
                return False
            
            logger.info(f"OTP verified successfully for: {email}")
            return True
        else:
            logger.warning(f"OTP not found for: {email}")
            return False
            
    except Exception as e:
        logger.error(f"MongoDB OTP verification error for {email}: {str(e)}", exc_info=True)
        # Continue to try with Beanie ORM
    
    # Fallback to Beanie ORM if direct query fails
    try:
        # Find the OTP in the database
        query = [OTP.email == email, OTP.otp == otp_code]
        
        # Add is_registration check if provided
        if is_registration is not None:
            query.append(OTP.is_registration == is_registration)
        
        otp_doc = await OTP.find_one(*query)
        logger.debug(f"Beanie ORM query for OTP: email={email}")
        
        if not otp_doc:
            logger.warning(f"OTP not found (Beanie) for: {email}")
            return False
        
        # Check if OTP is expired
        expiry_time = otp_doc.expiry
        current_time = get_current_datetime()
        
        # If expiry_time is naive, assume it's UTC and make it UTC-aware
        if expiry_time.tzinfo is None:
            expiry_time_utc = pytz.utc.localize(expiry_time)
        else:
            expiry_time_utc = expiry_time.astimezone(pytz.utc)
            
        # Convert current time to UTC for reliable comparison
        current_time_utc = current_time.astimezone(pytz.utc)

        if expiry_time_utc < current_time_utc:
            logger.warning(f"OTP expired (Beanie) for: {email}")
            # Delete all OTPs for this email to ensure a fresh one is required
            await OTP.find(OTP.email == email).delete()
            return False
        
        logger.info(f"OTP verified successfully (Beanie) for: {email}")
        return True
    except Exception as e:
        logger.error(f"Beanie OTP verification error for {email}: {str(e)}", exc_info=True)
        return False