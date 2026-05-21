import re
import time
import json
from typing import List

from app.config import settings
from app.models.case import Case, EvidenceItem, EvidenceMediaStatus
from app.schemas.evidence import EvidenceGenerationSummary
from app.utils.llm import get_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.logging_config import get_logger
from app.services.cloudinary_service import upload_evidence_image
from app.services.image_generation import (
    ImageGenerationError,
    generate_image_from_prompt,
)
from app.services.llm.evidence import generate_evidence_prompt
from app.services.rag import upsert_memory_item

logger = get_logger(__name__)


async def extract_evidence_items(
    case_text: str | None,
    rag_context: str | None = None,
) -> List[EvidenceItem]:
    """Extract structured evidence cards from the generated petition markdown using LLM."""
    if not case_text and not rag_context:
        return []

    context = rag_context or case_text or ""

    template = """Extract all evidence items mentioned in this legal case.

CASE TEXT:
{context}

RULES:
- Identify every piece of evidence (witness testimony, physical objects, documents, digital evidence, etc.)
- For each item, provide:
    - title: A short descriptive name (e.g., "CCTV Footage", "Witness Statement of Rahul")
    - evidence_type: Choose from (Witness Testimony, Physical Evidence, Digital Evidence, Medical Record, Document, or other)
    - description: A clear summary of what the evidence is and what it shows
    - source: Who provided the evidence (e.g., "Prosecution", "Rahul Sharma", "Police")

Return the data ONLY as a JSON list of objects. No other text.

Example format:
[
  {{
    "title": "...",
    "evidence_type": "...",
    "description": "...",
    "source": "..."
  }}
]
"""

    prompt = ChatPromptTemplate.from_messages([("human", template)])
    chain = prompt | get_llm("drafter") | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({"context": context})
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Clean up response (remove markdown code blocks if present)
        response = re.sub(
            r"```(?:json)?\s*(.*?)\s*```", r"\1", response, flags=re.DOTALL
        ).strip()
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        evidence_data = json.loads(response)
        items: List[EvidenceItem] = []

        for index, data in enumerate(evidence_data, start=1):
            title = str(data.get("title") or f"Evidence {index}")
            description = str(data.get("description") or "")
            items.append(
                EvidenceItem(
                    exhibit_ref=f"EX-{index:02d}",
                    title=title,
                    evidence_type=str(data.get("evidence_type") or "Document"),
                    description=description,
                    source=data.get("source"),
                    image_prompt=_build_image_prompt(title, description),
                )
            )

        logger.info(
            f"Extracted {len(items)} evidence items via LLM in {duration_ms:.2f}ms"
        )
        return items

    except Exception as e:
        logger.error(f"Error extracting evidence via LLM: {str(e)}", exc_info=True)
        return []


async def extract_evidence_from_text(
    text: str,
    source: str | None = None,
    exhibit_ref: str | None = None,
) -> EvidenceItem:
    """Extract one structured evidence item from a chat/proceeding message."""
    template = """Extract one legal evidence item from the text below.

TEXT:
{text}

RULES:
- Return exactly one JSON object.
- Use only these fields: title, evidence_type, description, source, image_prompt.
- Do not include ipc_sections, section numbers, relevance, or legal conclusions.
- If the text is weak evidence, still summarize the factual claim as neutrally as possible.
- evidence_type should be one of: Witness Testimony, Physical Evidence, Digital Evidence, Medical Record, Document, or Other.
- image_prompt should be null unless the item can be represented visually.

JSON object only:
{{
  "title": "...",
  "evidence_type": "...",
  "description": "...",
  "source": "...",
  "image_prompt": null
}}
"""

    prompt = ChatPromptTemplate.from_messages([("human", template)])
    chain = prompt | get_llm("drafter") | StrOutputParser()

    try:
        response = await chain.ainvoke({"text": text[:3000]})
        response = re.sub(
            r"```(?:json)?\s*(.*?)\s*```", r"\1", response, flags=re.DOTALL
        ).strip()
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        data = json.loads(response)
    except Exception as e:
        logger.error(
            "Error extracting evidence from text",
            extra={"error": str(e)},
            exc_info=True,
        )
        data = {
            "title": "Extracted Evidence",
            "evidence_type": "Witness Testimony",
            "description": text.strip(),
            "source": source,
            "image_prompt": None,
        }

    title = str(data.get("title") or "Extracted Evidence")
    description = str(data.get("description") or text.strip())
    prompt_text = data.get("image_prompt") or _build_image_prompt(title, description)

    return EvidenceItem(
        exhibit_ref=exhibit_ref or "EX-01",
        title=title,
        evidence_type=str(data.get("evidence_type") or "Other"),
        description=description,
        source=data.get("source") or source,
        image_prompt=prompt_text,
    )


def next_exhibit_ref(case: Case) -> str:
    """Return the next sequential exhibit reference for a case."""
    max_index = 0
    for item in case.evidence:
        match = re.search(r"(\d+)$", item.exhibit_ref or "")
        if match:
            max_index = max(max_index, int(match.group(1)))
    return f"EX-{max_index + 1:02d}"


async def index_evidence_item(case: Case, item: EvidenceItem) -> None:
    """Index a single evidence item into RAG memory."""
    await upsert_memory_item(
        case,
        "evidence",
        item.id,
        "\n".join(
            part
            for part in [item.exhibit_ref, item.title, item.description, item.source]
            if part
        ),
        {"exhibit_ref": item.exhibit_ref, "evidence_type": item.evidence_type},
    )


def format_evidence_context(evidence: list[EvidenceItem] | None) -> str:
    """Format structured evidence for LLM prompts."""
    if not evidence:
        return "No structured evidence has been submitted."

    lines = []
    for item in evidence:
        parts = [
            f"{item.exhibit_ref}: {item.title}",
            f"Type: {item.evidence_type}",
            f"Description: {item.description}",
        ]
        if item.source:
            parts.append(f"Source: {item.source}")
        lines.append(" | ".join(parts))
    return "\n".join(lines)


async def generate_missing_evidence_images_for_case(
    case: Case,
) -> EvidenceGenerationSummary:
    """Generate missing evidence images up to the configured per-case limit."""
    limit = max(0, settings.evidence_image_generation_limit_per_case)
    already_generated = sum(
        1
        for item in case.evidence
        if item.image_url and item.media_status == EvidenceMediaStatus.GENERATED
    )
    remaining = max(0, limit - already_generated)
    summary = EvidenceGenerationSummary(
        limit=limit,
        already_generated=already_generated,
        skipped=max(0, len(case.evidence) - already_generated),
    )

    if limit == 0:
        summary.message = "Evidence image generation is disabled."
        return summary

    if remaining == 0:
        summary.message = "Evidence image generation limit already reached."
        return summary

    for index, item in enumerate(case.evidence):
        if summary.generated >= remaining:
            break
        if item.image_url:
            continue
        if item.media_status not in {
            EvidenceMediaStatus.NOT_REQUESTED,
            EvidenceMediaStatus.FAILED,
        }:
            continue

        if not item.image_prompt:
            item.image_prompt = await generate_evidence_prompt(
                item.title,
                item.description,
                item.evidence_type,
            )

        if not item.image_prompt:
            continue

        await _attempt_evidence_image_generation(case, index, item, summary)

    summary.already_generated = sum(
        1
        for item in case.evidence
        if item.image_url and item.media_status == EvidenceMediaStatus.GENERATED
    )
    summary.skipped = max(
        0, len(case.evidence) - summary.already_generated - summary.failed
    )
    summary.message = _format_generation_summary_message(summary)
    return summary


async def regenerate_evidence_image_for_case_item(
    case: Case,
    evidence_id: str,
) -> EvidenceGenerationSummary:
    """Retry image generation for one failed or missing evidence item."""
    limit = max(0, settings.evidence_image_generation_limit_per_case)
    already_generated = sum(
        1
        for item in case.evidence
        if item.image_url and item.media_status == EvidenceMediaStatus.GENERATED
    )
    summary = EvidenceGenerationSummary(
        limit=limit,
        already_generated=already_generated,
        skipped=max(0, len(case.evidence) - already_generated),
    )

    if limit == 0:
        summary.message = "Evidence image generation is disabled."
        return summary

    index_to_retry = next(
        (index for index, item in enumerate(case.evidence) if item.id == evidence_id),
        None,
    )
    if index_to_retry is None:
        summary.message = "Evidence not found."
        return summary

    item = case.evidence[index_to_retry]
    if item.image_url and item.media_status == EvidenceMediaStatus.GENERATED:
        summary.message = "Evidence image has already been generated."
        return summary

    if already_generated >= limit:
        summary.message = "Evidence image generation limit already reached."
        return summary

    if not item.image_prompt:
        item.image_prompt = await generate_evidence_prompt(
            item.title,
            item.description,
            item.evidence_type,
        )

    if not item.image_prompt:
        summary.message = "No image prompt is available for this evidence."
        return summary

    await _attempt_evidence_image_generation(case, index_to_retry, item, summary)
    summary.already_generated = sum(
        1
        for evidence_item in case.evidence
        if evidence_item.image_url
        and evidence_item.media_status == EvidenceMediaStatus.GENERATED
    )
    summary.skipped = max(
        0, len(case.evidence) - summary.already_generated - summary.failed
    )
    summary.message = _format_generation_summary_message(summary)
    return summary


async def _attempt_evidence_image_generation(
    case: Case,
    index: int,
    item: EvidenceItem,
    summary: EvidenceGenerationSummary,
) -> None:
    summary.attempted += 1
    item.media_status = EvidenceMediaStatus.PENDING
    case.evidence[index] = item
    await case.save()

    try:
        image_prompt = item.image_prompt
        if not image_prompt:
            raise ImageGenerationError("Image prompt is empty")

        image_bytes = await generate_image_from_prompt(image_prompt)
        image_url, public_id = await upload_evidence_image(
            image_bytes,
            case.cnr,
            item.id,
            existing_public_id=item.image_public_id,
        )
        item.image_url = image_url
        item.image_public_id = public_id
        item.media_status = EvidenceMediaStatus.GENERATED
        summary.generated += 1
    except ImageGenerationError as e:
        logger.warning(
            "Evidence image provider failed: "
            f"model={e.model}, status={e.status_code}, detail={e.provider_detail}",
            extra={
                "cnr": case.cnr,
                "evidence_id": item.id,
                "model": e.model,
                "status_code": e.status_code,
                "retryable": e.retryable,
                "provider_detail": e.provider_detail,
                "error": str(e),
            },
        )
        item.media_status = EvidenceMediaStatus.FAILED
        summary.failed += 1
        summary.message = e.user_message
    except Exception as e:
        logger.error(
            "Evidence image generation failed",
            extra={"cnr": case.cnr, "evidence_id": item.id, "error": str(e)},
            exc_info=True,
        )
        item.media_status = EvidenceMediaStatus.FAILED
        summary.failed += 1
        summary.message = "Image generation failed unexpectedly. Please retry."
    finally:
        case.evidence[index] = item
        await case.save()


def _build_image_prompt(title: str, description: str) -> str | None:
    text = f"{title} {description}".lower()
    visual_terms = (
        "photograph",
        "cctv",
        "video",
        "scene",
        "weapon",
        "injury",
        "document",
    )
    if not any(term in text for term in visual_terms):
        return None

    clean_description = re.sub(r"\s+", " ", description.replace("**", "")).strip()
    return (
        "Create a neutral, non-graphic legal exhibit illustration for "
        f"{title}: {clean_description[:240]}"
    )


def _format_generation_summary_message(
    summary: EvidenceGenerationSummary,
) -> str:
    remaining_successes = max(0, summary.limit - summary.already_generated)
    failure_reason = summary.message.strip()
    message = (
        f"Generated {summary.generated} evidence image(s), " f"{summary.failed} failed."
    )

    if summary.failed:
        if failure_reason:
            message += f" {failure_reason}"
        message += (
            f" Failed attempts do not count toward the {summary.limit} image "
            f"limit; {remaining_successes} successful image slot(s) remain."
        )
    else:
        message += (
            f" {remaining_successes} of {summary.limit} successful image slot(s) "
            "remain."
        )

    return message
