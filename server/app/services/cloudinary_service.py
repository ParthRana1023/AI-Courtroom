# app/services/cloudinary_service.py
"""Cloudinary integration service for profile photo uploads."""
import cloudinary
import cloudinary.uploader
from app.config import settings
from typing import Optional, Tuple
from app.logging_config import get_logger

logger = get_logger(__name__)


def configure_cloudinary() -> bool:
    """
    Configure Cloudinary with settings from environment.
    Returns True if configuration is valid, False otherwise.
    """
    if not all([
        settings.cloudinary_cloud_name,
        settings.cloudinary_api_key,
        settings.cloudinary_api_secret
    ]):
        logger.warning("Cloudinary credentials not fully configured")
        return False
    
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True
    )
    logger.debug("Cloudinary configured successfully")
    return True


async def upload_profile_photo(file_bytes: bytes, user_id: str, existing_public_id: Optional[str] = None) -> Tuple[str, str]:
    """
    Upload profile photo to Cloudinary.
    
    Args:
        file_bytes: The image file bytes
        user_id: User ID for organizing uploads
        existing_public_id: If provided, delete the existing photo first
    
    Returns:
        Tuple of (secure_url, public_id)
    
    Raises:
        Exception if upload fails
    """
    logger.info(f"Uploading profile photo", extra={"user_id": user_id, "has_existing": existing_public_id is not None})
    
    if not configure_cloudinary():
        logger.error("Cloudinary not configured, cannot upload photo")
        raise Exception("Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.")
    
    # Delete existing photo if provided
    if existing_public_id:
        try:
            cloudinary.uploader.destroy(existing_public_id)
            logger.debug(f"Deleted existing photo", extra={"public_id": existing_public_id})
        except Exception as e:
            # Ignore deletion errors, proceed with upload
            logger.warning(f"Failed to delete existing photo, proceeding with upload", extra={"public_id": existing_public_id, "error": str(e)})
            pass
    
    # Upload new photo
    try:
        result = cloudinary.uploader.upload(
            file_bytes,
            folder=f"ai-courtroom/profile-photos",
            public_id=f"user_{user_id}",
            overwrite=True,
            resource_type="image",
            transformation=[
                {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
                {"quality": "auto", "fetch_format": "auto"}
            ]
        )
        
        logger.info(f"Profile photo uploaded successfully", extra={"user_id": user_id, "public_id": result["public_id"]})
        return result["secure_url"], result["public_id"]
    except Exception as e:
        logger.error(f"Failed to upload profile photo", extra={"user_id": user_id, "error": str(e)})
        raise


async def delete_profile_photo(public_id: str) -> bool:
    """
    Delete profile photo from Cloudinary.
    
    Args:
        public_id: The public ID of the image to delete
    
    Returns:
        True if deleted successfully, False otherwise
    """
    logger.info(f"Deleting profile photo", extra={"public_id": public_id})
    
    if not configure_cloudinary():
        logger.error("Cloudinary not configured, cannot delete photo")
        raise Exception("Cloudinary is not configured.")
    
    try:
        result = cloudinary.uploader.destroy(public_id)
        success = result.get("result") == "ok"
        if success:
            logger.info(f"Profile photo deleted successfully", extra={"public_id": public_id})
        else:
            logger.warning(f"Cloudinary deletion returned non-ok result", extra={"public_id": public_id, "result": result})
        return success
    except Exception as e:
        logger.error(f"Failed to delete profile photo", extra={"public_id": public_id, "error": str(e)})
        return False


def extract_public_id_from_url(url: str) -> Optional[str]:
    """
    Extract the public_id from a Cloudinary URL.
    
    Args:
        url: The Cloudinary secure URL
    
    Returns:
        The public_id or None if extraction fails
    """
    if not url or "cloudinary" not in url:
        return None
    
    try:
        # URL format: https://res.cloudinary.com/{cloud}/image/upload/v{version}/{folder}/{public_id}.{ext}
        # We need to extract {folder}/{public_id} part
        parts = url.split("/upload/")
        if len(parts) < 2:
            return None
        
        path = parts[1]
        # Remove version if present (v1234567890/)
        if path.startswith("v"):
            slash_idx = path.find("/")
            if slash_idx != -1:
                path = path[slash_idx + 1:]
        
        # Remove file extension
        dot_idx = path.rfind(".")
        if dot_idx != -1:
            path = path[:dot_idx]
        
        logger.debug(f"Extracted public_id from URL", extra={"public_id": path})
        return path
    except Exception as e:
        logger.debug(f"Failed to extract public_id from URL", extra={"url": url, "error": str(e)})
        return None
