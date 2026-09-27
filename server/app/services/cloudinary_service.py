# app/services/cloudinary_service.py
"""Cloudinary integration service for profile and evidence image uploads."""

import cloudinary
import cloudinary.uploader

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)


def configure_cloudinary() -> bool:
    """
    Configure Cloudinary with settings from environment.
    Returns True if configuration is valid, False otherwise.
    """
    if not all(
        [
            settings.cloudinary_cloud_name,
            settings.cloudinary_api_key,
            settings.cloudinary_api_secret,
        ]
    ):
        logger.warning("Cloudinary credentials not fully configured")
        return False

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    logger.debug("Cloudinary configured successfully")
    return True


def _replace_image(
    file_bytes: bytes,
    folder: str,
    public_id: str,
    transformation: list[dict],
    existing_public_id: str | None = None,
) -> tuple[str, str]:
    """Delete the old image (best effort), upload the new one, return (secure_url, public_id)."""
    if not configure_cloudinary():
        raise RuntimeError(
            "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
        )
    if existing_public_id:
        try:
            cloudinary.uploader.destroy(existing_public_id)
        except Exception as e:
            # A missing old image must not block the new upload
            logger.warning(
                "Failed to delete existing image, proceeding with upload",
                extra={"public_id": existing_public_id, "error": str(e)},
                exc_info=True,
            )
    try:
        result = cloudinary.uploader.upload(
            file_bytes,
            folder=folder,
            public_id=public_id,
            overwrite=True,
            resource_type="image",
            transformation=transformation,
        )
    except Exception as e:
        logger.error("Image upload failed", extra={"folder": folder, "error": str(e)})
        raise
    logger.info("Image uploaded", extra={"public_id": result["public_id"]})
    return result["secure_url"], result["public_id"]


async def upload_profile_photo(
    file_bytes: bytes, user_id: str, existing_public_id: str | None = None
) -> tuple[str, str]:
    """Upload a square, face-cropped profile photo; returns (secure_url, public_id)."""
    return _replace_image(
        file_bytes,
        folder="ai-courtroom/profile-photos",
        public_id=f"user_{user_id}",
        transformation=[
            {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
        existing_public_id=existing_public_id,
    )


async def upload_evidence_image(
    file_bytes: bytes,
    cnr: str,
    evidence_id: str,
    existing_public_id: str | None = None,
) -> tuple[str, str]:
    """Upload an evidence image under the case's folder; returns (secure_url, public_id)."""

    def safe(value: str) -> str:
        return "".join(ch for ch in value if ch.isalnum() or ch in ("-", "_"))

    return _replace_image(
        file_bytes,
        folder=f"ai-courtroom/evidence/{safe(cnr)}",
        public_id=f"evidence_{safe(evidence_id)}",
        transformation=[
            {"width": 1200, "height": 800, "crop": "limit"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
        existing_public_id=existing_public_id,
    )


async def delete_profile_photo(public_id: str) -> bool:
    """
    Delete profile photo from Cloudinary.

    Args:
        public_id: The public ID of the image to delete

    Returns:
        True if deleted successfully, False otherwise
    """
    logger.info("Deleting profile photo", extra={"public_id": public_id})

    if not configure_cloudinary():
        logger.error("Cloudinary not configured, cannot delete photo")
        raise RuntimeError("Cloudinary is not configured.")

    try:
        result = cloudinary.uploader.destroy(public_id)
        success = result.get("result") == "ok"
        if success:
            logger.info(
                "Profile photo deleted successfully", extra={"public_id": public_id}
            )
        else:
            logger.warning(
                "Cloudinary deletion returned non-ok result",
                extra={"public_id": public_id, "result": result},
            )
        return success
    except Exception as e:
        logger.exception(
            "Failed to delete profile photo",
            extra={"public_id": public_id, "error": str(e)},
        )
        return False


def extract_public_id_from_url(url: str) -> str | None:
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
                path = path[slash_idx + 1 :]

        # Remove file extension
        dot_idx = path.rfind(".")
        if dot_idx != -1:
            path = path[:dot_idx]

        logger.debug("Extracted public_id from URL", extra={"public_id": path})
        return path
    except Exception as e:
        logger.debug(
            "Failed to extract public_id from URL",
            extra={"url": url, "error": str(e)},
            exc_info=True,
        )
        return None
