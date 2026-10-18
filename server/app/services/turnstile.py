"""Cloudflare Turnstile: the robot check on the signed-out Contact form."""

import httpx

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class TurnstileUnavailable(Exception):
    """Cloudflare couldn't be asked; the sender should try again shortly."""


async def verify_turnstile(token: str | None, ip: str | None) -> bool:
    """Whether Cloudflare accepts this token (each token works once). Always True
    when no secret is configured, so local development needs no keys. Raises
    TurnstileUnavailable if Cloudflare can't be reached."""
    if not settings.turnstile_secret_key:
        return True
    if not token:
        return False
    data = {"secret": settings.turnstile_secret_key, "response": token}
    if ip:
        data["remoteip"] = ip
    try:
        # httpx's async client falls back from a dead IPv6 route quickly.
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(SITEVERIFY_URL, data=data)
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"Turnstile siteverify failed: {type(e).__name__}")
        raise TurnstileUnavailable from e
    if not result.get("success"):
        logger.info(f"Turnstile rejected a token: {result.get('error-codes')}")
        return False
    # A valid token minted for another form or another site is still refused.
    if result.get("action") != settings.turnstile_action:
        logger.info(f"Turnstile token for the wrong action: {result.get('action')}")
        return False
    if result.get("hostname") not in settings.allowed_turnstile_hostnames:
        logger.info(
            f"Turnstile token from an unexpected host: {result.get('hostname')}"
        )
        return False
    return True
