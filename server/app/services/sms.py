# app/services/sms.py
from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)


async def send_sms(to: str, body: str) -> bool:
    """Send a text message to an E.164 number (e.g. "+919876543210").

    Only the "log" provider exists: the message is written to the server log,
    which is enough while phone sign-in is a dev-only feature. A real provider
    plugs in here without touching callers.
    """
    if settings.sms_provider == "log":
        logger.info(f"SMS to {to}: {body}")
        return True
    raise NotImplementedError(
        f"SMS provider {settings.sms_provider!r}"
    )  # pragma: no cover
