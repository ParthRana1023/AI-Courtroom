"""Gemini Imagen text-to-image generation for evidence exhibits."""

import base64
import httpx

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)


class ImageGenerationError(Exception):
    """Raised when the image provider cannot generate an image."""


async def generate_image_from_prompt(prompt: str) -> bytes:
    """Generate an image from a prompt using Gemini Imagen."""
    if not settings.gemini_api_key:
        raise ImageGenerationError("Gemini API key is not configured")

    if not prompt or not prompt.strip():
        raise ImageGenerationError("Image prompt is empty")

    model = settings.evidence_image_model
    timeout = settings.evidence_image_generation_timeout_seconds
    is_imagen_model = model.startswith("imagen-")
    method = "predict" if is_imagen_model else "generateContent"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:{method}"

    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }
    payload = _build_payload(prompt, is_imagen_model)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.error("Evidence image provider request failed", extra={"error": str(exc)})
        raise ImageGenerationError("Image provider request failed") from exc

    if response.status_code >= 400:
        detail = response.text[:300]
        logger.warning(
            "Evidence image provider returned an error",
            extra={"status_code": response.status_code, "detail": detail},
        )
        raise ImageGenerationError(f"Image provider failed with status {response.status_code}")

    try:
        data = response.json()
    except ValueError as exc:
        logger.warning(
            "Gemini Imagen returned non-JSON content",
            extra={"body": response.text[:300]},
        )
        raise ImageGenerationError("Image provider response was not JSON") from exc

    image_b64 = _extract_image_base64(data)
    if not image_b64:
        logger.warning("Gemini Imagen response did not include image bytes", extra={"response": data})
        raise ImageGenerationError("Image provider did not return image bytes")

    try:
        return base64.b64decode(image_b64)
    except Exception as exc:
        raise ImageGenerationError("Image provider returned invalid image bytes") from exc


def _extract_image_base64(data: dict) -> str | None:
    """Handle Gemini image generation response shapes defensively."""
    candidates = data.get("candidates") or []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        for part in parts:
            if not isinstance(part, dict):
                continue
            inline_data = part.get("inlineData") or part.get("inline_data")
            if isinstance(inline_data, dict):
                image_b64 = inline_data.get("data")
                if image_b64:
                    return image_b64

    predictions = data.get("predictions") or []
    for prediction in predictions:
        if isinstance(prediction, dict):
            image_b64 = prediction.get("bytesBase64Encoded")
            if image_b64:
                return image_b64

    generated_images = data.get("generatedImages") or data.get("generated_images") or []
    for generated_image in generated_images:
        if not isinstance(generated_image, dict):
            continue
        image = generated_image.get("image")
        if isinstance(image, dict):
            image_b64 = image.get("imageBytes") or image.get("image_bytes")
            if image_b64:
                return image_b64
    return None


def _build_payload(prompt: str, is_imagen_model: bool) -> dict:
    if is_imagen_model:
        return {
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": "4:3",
                "personGeneration": "allow_adult",
            },
        }

    return {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": "4:3",
                "imageSize": "1K",
            },
        },
    }
