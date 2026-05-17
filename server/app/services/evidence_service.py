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
from app.services.image_generation import ImageGenerationError, generate_image_from_prompt
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
        response = re.sub(r"```(?:json)?\s*(.*?)\s*```", r"\1", response, flags=re.DOTALL).strip()
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        data = json.loads(response)
    except Exception as e:
        logger.error("Error extracting evidence from text", extra={"error": str(e)}, exc_info=True)
        data = {
            "title": "Extracted Evidence",
            "evidence_type": "Witness Testimony",
            "description": text.strip(),
            "source": source,
            "image_prompt": None,
        }

    prompt_text = data.get("image_prompt") or _build_image_prompt(
        data.get("title", ""), data.get("description", "")
    )

    return EvidenceItem(
        exhibit_ref=exhibit_ref or "EX-01",
        title=data.get("title") or "Extracted Evidence",
        evidence_type=data.get("evidence_type") or "Other",
        description=data.get("description") or text.strip(),
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
        if summary.attempted >= remaining:
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

        summary.attempted += 1
        item.media_status = EvidenceMediaStatus.PENDING
        case.evidence[index] = item
        await case.save()

        try:
            image_bytes = await generate_image_from_prompt(item.image_prompt)
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
        except (ImageGenerationError, Exception) as e:
            logger.error(
                "Evidence image generation failed",
                extra={"cnr": case.cnr, "evidence_id": item.id, "error": str(e)},
                exc_info=True,
            )
            item.media_status = EvidenceMediaStatus.FAILED
            summary.failed += 1
        finally:
            case.evidence[index] = item
            await case.save()

    summary.already_generated = sum(
        1
        for item in case.evidence
        if item.image_url and item.media_status == EvidenceMediaStatus.GENERATED
    )
    summary.skipped = max(0, len(case.evidence) - summary.already_generated - summary.failed)
    summary.message = (
        f"Generated {summary.generated} evidence image(s), "
        f"{summary.failed} failed, limit {summary.limit}."
    )
    return summary

    context = rag_context or case_text
    
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
        response = re.sub(r"```(?:json)?\s*(.*?)\s*```", r"\1", response, flags=re.DOTALL).strip()
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        evidence_data = json.loads(response)
        items: List[EvidenceItem] = []
        
        for index, data in enumerate(evidence_data, start=1):
            items.append(
                EvidenceItem(
                    exhibit_ref=f"EX-{index:02d}",
                    title=data.get("title", f"Evidence {index}"),
                    evidence_type=data.get("evidence_type", "Document"),
                    description=data.get("description", ""),
                    source=data.get("source"),
                    image_prompt=_build_image_prompt(data.get("title", ""), data.get("description", ""))
                )
            )
        
        logger.info(f"Extracted {len(items)} evidence items via LLM in {duration_ms:.2f}ms")
        return items

    except Exception as e:
        logger.error(f"Error extracting evidence via LLM: {str(e)}", exc_info=True)
        return []


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
