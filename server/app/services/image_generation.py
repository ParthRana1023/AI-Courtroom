"""Cloudflare Workers AI text-to-image generation for evidence exhibits."""

import base64
from typing import Any

import httpx

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)


class ImageGenerationError(Exception):
    """Raised when the image provider cannot generate an image."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retryable: bool = False,
        user_message: str | None = None,
        provider_detail: str | None = None,
        model: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable
        self.user_message = user_message or message
        self.provider_detail = provider_detail
        self.model = model


async def generate_image_from_prompt(prompt: str) -> bytes:
    """Generate an image from a prompt using Cloudflare Workers AI."""
    account_id = settings.cloudflare_account_id
    api_token = settings.cloudflare_api_token
    if not account_id or not api_token:
        raise ImageGenerationError(
            "Cloudflare Workers AI credentials are not configured"
        )

    if not prompt or not prompt.strip():
        raise ImageGenerationError("Image prompt is empty")

    configured_models = _configured_image_models()
    last_error: ImageGenerationError | None = None
    for index, model in enumerate(configured_models):
        try:
            return await _generate_image_with_model(
                prompt.strip(),
                model,
                account_id,
                api_token,
            )
        except ImageGenerationError as exc:
            last_error = exc
            if index == 0 and len(configured_models) > 1:
                logger.warning(
                    "Primary evidence image model failed, trying fallback",
                    extra={
                        "model": model,
                        "fallback_model": configured_models[1],
                        "status_code": exc.status_code,
                        "retryable": exc.retryable,
                        "provider_detail": exc.provider_detail,
                        "error": str(exc),
                    },
                )
                continue
            raise

    raise last_error or ImageGenerationError("No evidence image model configured")


async def _generate_image_with_model(
    prompt: str,
    model: str,
    account_id: str,
    api_token: str,
) -> bytes:
    timeout = settings.evidence_image_generation_timeout_seconds
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    headers = {"Authorization": f"Bearer {api_token}"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if _uses_multipart(model):
                response = await client.post(
                    url,
                    headers=headers,
                    files=_build_multipart_payload(prompt),
                )
            else:
                response = await client.post(
                    url,
                    headers=headers,
                    json=_build_json_payload(prompt),
                )
    except httpx.HTTPError as exc:
        logger.error(
            "Evidence image provider request failed",
            extra={"model": model, "error": str(exc)},
        )
        raise ImageGenerationError(
            "Image provider request failed",
            model=model,
            user_message="Cloudflare Workers AI request failed. Please retry.",
        ) from exc

    if response.status_code >= 400:
        detail = _extract_provider_error_detail(response)
        logger.warning(
            "Evidence image provider returned an error: "
            f"model={model}, status={response.status_code}, detail={detail}",
            extra={
                "model": model,
                "status_code": response.status_code,
                "detail": detail,
            },
        )
        raise ImageGenerationError(
            f"Image provider failed with status {response.status_code}",
            status_code=response.status_code,
            retryable=response.status_code in {429, 500, 502, 503, 504},
            user_message=_build_user_error_message(model, response.status_code, detail),
            provider_detail=detail,
            model=model,
        )

    try:
        data = response.json()
    except ValueError as exc:
        logger.warning(
            "Cloudflare Workers AI returned non-JSON content",
            extra={"model": model, "body": response.text[:300]},
        )
        raise ImageGenerationError(
            "Image provider response was not JSON",
            model=model,
        ) from exc

    image_b64 = _extract_image_base64(data)
    if not image_b64:
        detail = _extract_cloudflare_error_detail(data)
        logger.warning(
            "Cloudflare Workers AI response did not include image bytes",
            extra={"model": model, "detail": detail, "response": data},
        )
        raise ImageGenerationError(
            "Image provider did not return image bytes",
            user_message=_build_user_error_message(model, response.status_code, detail),
            provider_detail=detail,
            model=model,
        )

    try:
        return base64.b64decode(image_b64)
    except Exception as exc:
        raise ImageGenerationError(
            "Image provider returned invalid image bytes",
            model=model,
        ) from exc


def _configured_image_models() -> list[str]:
    models = [
        settings.evidence_image_model,
        settings.evidence_image_fallback_model,
    ]
    return list(dict.fromkeys(model.strip() for model in models if model.strip()))


def _uses_multipart(model: str) -> bool:
    return "flux-2" in model


def _build_json_payload(prompt: str) -> dict[str, str | int]:
    return {"prompt": prompt, "steps": 4}


def _build_multipart_payload(prompt: str) -> dict[str, tuple[None, str]]:
    return {
        "prompt": (None, prompt),
        "steps": (None, "25"),
        "width": (None, "1024"),
        "height": (None, "1024"),
    }


def _extract_image_base64(data: dict[str, Any]) -> str | None:
    """Handle Cloudflare Workers AI direct and API-envelope response shapes."""
    image = data.get("image")
    if isinstance(image, str) and image:
        return image

    result = data.get("result")
    if isinstance(result, dict):
        result_image = result.get("image")
        if isinstance(result_image, str) and result_image:
            return result_image

    return None


def _extract_provider_error_detail(response: httpx.Response) -> str:
    try:
        data: Any = response.json()
    except ValueError:
        return response.text[:500]

    if isinstance(data, dict):
        detail = _extract_cloudflare_error_detail(data)
        if detail:
            return detail

    return str(data)[:500]


def _extract_cloudflare_error_detail(data: dict[str, Any]) -> str:
    errors = data.get("errors")
    if isinstance(errors, list) and errors:
        messages = []
        for error in errors:
            if not isinstance(error, dict):
                continue
            code = error.get("code")
            message = error.get("message")
            parts = [
                str(part)
                for part in (code, message)
                if part is not None and str(part).strip()
            ]
            if parts:
                messages.append(" - ".join(parts))
        if messages:
            return "; ".join(messages)[:500]

    message = data.get("message")
    if isinstance(message, str) and message.strip():
        return message[:500]

    return ""


def _build_user_error_message(
    model: str,
    status_code: int,
    detail: str,
) -> str:
    if status_code == 429:
        return (
            f"{model} is temporarily rate limiting requests. "
            "Please wait a moment and retry."
        )

    message = f"{model} could not generate the image (provider status {status_code})."
    if detail:
        message += f" Provider message: {detail}"
    return message
