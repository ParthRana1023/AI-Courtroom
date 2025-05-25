# app/services/otp.py
import random
import string
from datetime import datetime, timedelta, timezone
import pytz
from app.models.otp import OTP
from app.services.email import send_otp_email
import motor.motor_asyncio
from app.config import settings
from typing import Optional

def generate_otp(length: int = 6) -> str:
    """Generate a random OTP of specified length"""
    return ''.join(random.choices(string.digits, k=length))

async def create_otp(email: str, is_registration: bool = True) -> str:
    """Create and store OTP for a user"""
    # Delete any existing OTPs for this email
    # Fix: Don't await the find() call, only await the delete()
    await OTP.find(OTP.email == email).delete()
    
    # Generate new OTP
    otp_code = generate_otp();
    # Calculate expiry time in IST and convert to UTC for storage
    ist_offset = timedelta(hours=5, minutes=30)
    ist_timezone = timezone(ist_offset)
    expiry_ist = datetime.now(ist_timezone) + timedelta(minutes=settings.access_token_expire_minutes)
    expiry_utc = expiry_ist.astimezone(pytz.utc)
    
    # Store OTP in database (UTC time)
    otp = OTP(
        email=email,
        otp=otp_code,
        expiry=expiry_utc,
        is_registration=is_registration
    )
    await otp.insert()
    
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
        print(f"Direct MongoDB query result: {otp_doc_dict is not None}")
        
        if otp_doc_dict:
            # Check if OTP is expired - ensure both datetimes are timezone-aware and compare in UTC
            expiry_time = otp_doc_dict["expiry"]
            current_time = datetime.now(pytz.timezone('Asia/Kolkata'))

            print(f"Debug: expiry_time (from DB): {expiry_time} (tzinfo: {expiry_time.tzinfo})")
            print(f"Debug: current_time (IST): {current_time} (tzinfo: {current_time.tzinfo})")
            
            # Check if OTP is expired - ensure both datetimes are timezone-aware and compare in UTC
            expiry_time = otp_doc_dict["expiry"]
            current_time = datetime.now(pytz.timezone('Asia/Kolkata'))

            print(f"Debug: expiry_time (from DB): {expiry_time} (tzinfo: {expiry_time.tzinfo})")
            print(f"Debug: current_time (IST): {current_time} (tzinfo: {current_time.tzinfo})")
            
            # If expiry_time is naive, assume it's UTC (as intended by create_otp) and make it UTC-aware
            if expiry_time.tzinfo is None:
                print("Debug: expiry_time is naive, localizing as UTC")
                expiry_time_utc = pytz.utc.localize(expiry_time)
            else:
                # If it's already timezone-aware, convert it to UTC
                expiry_time_utc = expiry_time.astimezone(pytz.utc)

            # Convert current time to UTC for reliable comparison
            current_time_utc = current_time.astimezone(pytz.utc)
            
            print(f"Debug: expiry_time_utc: {expiry_time_utc}")
            print(f"Debug: current_time_utc: {current_time_utc}")
            print(f"Debug: Comparison result (expiry_time_utc < current_time_utc): {expiry_time_utc < current_time_utc}")

            if expiry_time_utc < current_time_utc:
                print(f"OTP expired: {expiry_time} < {current_time} (UTC: {expiry_time_utc} < {current_time_utc})")
                # Delete all OTPs for this email to ensure a fresh one is required
                await collection.delete_many({"email": email})
                return False
            
            # Important: Don't delete the OTP here, let the caller handle deletion
            return True
    except Exception as e:
        print(f"Direct MongoDB query error: {e}")
        # Continue to try with Beanie ORM
    
    # Fallback to Beanie ORM if direct query fails
    try:
        # Find the OTP in the database
        query = [OTP.email == email, OTP.otp == otp_code]
        
        # Add is_registration check if provided
        if is_registration is not None:
            query.append(OTP.is_registration == is_registration)
        
        otp_doc = await OTP.find_one(*query)
        
        # Add debug logging
        print(f"Verifying OTP: email={email}, otp={otp_code}, found={otp_doc is not None}")
        
        if not otp_doc:
            return False
        
        # Check if OTP is expired - ensure both datetimes are timezone-aware and compare in UTC
        expiry_time = otp_doc.expiry
        current_time = datetime.now(pytz.timezone('Asia/Kolkata'))

        print(f"Debug: expiry_time (from DB): {expiry_time} (tzinfo: {expiry_time.tzinfo})")
        print(f"Debug: current_time (IST): {current_time} (tzinfo: {current_time.tzinfo})")
        
        # Check if OTP is expired - ensure both datetimes are timezone-aware and compare in UTC
        expiry_time = otp_doc.expiry
        current_time = datetime.now(pytz.timezone('Asia/Kolkata'))

        print(f"Debug: expiry_time (from DB): {expiry_time} (tzinfo: {expiry_time.tzinfo})")
        print(f"Debug: current_time (IST): {current_time} (tzinfo: {current_time.tzinfo})")
        
        # If expiry_time is naive, assume it's UTC (as intended by create_otp) and make it UTC-aware
        if expiry_time.tzinfo is None:
            print("Debug: expiry_time is naive, localizing as UTC")
            expiry_time_utc = pytz.utc.localize(expiry_time)
        else:
            # If it's already timezone-aware, convert it to UTC
            expiry_time_utc = expiry_time.astimezone(pytz.utc)
            
        # Convert current time to UTC for reliable comparison
        current_time_utc = current_time.astimezone(pytz.utc);

        print(f"Debug: expiry_time_utc: {expiry_time_utc}")
        print(f"Debug: current_time_utc: {current_time_utc}")
        print(f"Debug: Comparison result (expiry_time_utc < current_time_utc): {expiry_time_utc < current_time_utc}")

        if expiry_time_utc < current_time_utc:
            print(f"OTP expired: {expiry_time} < {current_time} (UTC: {expiry_time_utc} < {current_time_utc})")
            # Delete all OTPs for this email to ensure a fresh one is required
            await OTP.find(OTP.email == email).delete()
            return False
        
        # Important: Don't delete the OTP here, let the caller handle deletion
        return True
    except Exception as e:
        print(f"OTP verification error: {e}")
        return False