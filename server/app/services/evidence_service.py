import json
import re
import time
from datetime import UTC, timedelta

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case, EvidenceItem, EvidenceMediaStatus
from app.services.cloudinary_service import upload_evidence_image
from app.services.image_generation import (
    ImageGenerationError,
    generate_image_from_prompt,
)
from app.services.llm.evidence import generate_evidence_prompt, looks_visual
from app.services.rag import upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.llm import get_llm, strip_thinking

logger = get_logger(__name__)


def parse_llm_json(response: str):
    """Parse JSON from a model reply, ignoring ``` fences and <think> blocks."""
    unfenced = re.sub(r"```(?:json)?\s*(.*?)\s*```", r"\1", response, flags=re.DOTALL)
    return json.loads(strip_thinking(unfenced))


async def extract_evidence_items(
    case_text: str | None,
    rag_context: str | None = None,
) -> list[EvidenceItem]:
    """Extract structured evidence cards from the generated petition markdown using LLM."""
    if not case_text and not rag_context:
        return []

    context = rag_context or case_text or ""

    template = """Extract all evidence items mentioned in this legal case.

CASE TEXT:
{context}

RULES:
- Identify every piece of evidence the case text actually mentions (witness testimony, physical objects, documents, digital evidence, etc.); never invent any
- List each item once, even if it is mentioned in several places
- For each item, provide:
    - title: A short descriptive name (e.g., "CCTV Footage", "Witness Statement of Rahul")
    - evidence_type: Choose from (Witness Testimony, Physical Evidence, Digital Evidence, Medical Record, Document, or other)
    - description: A neutral summary of what the evidence is and what it shows, including any weakness the case text notes; keep its annexure reference if it has one
    - source: Who produced the evidence (e.g., "Prosecution", "Rahul Sharma", "Police")

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
        evidence_data = parse_llm_json(response)
        items: list[EvidenceItem] = []

        for index, data in enumerate(evidence_data, start=1):
            title = str(data.get("title") or f"Evidence {index}")
            description = str(data.get("description") or "")
            given_type = data.get("evidence_type")
            evidence_type = str(given_type or "Document")
            items.append(
                EvidenceItem(
                    exhibit_ref=f"EX-{index:02d}",
                    title=title,
                    evidence_type=evidence_type,
                    description=description,
                    source=data.get("source"),
                    # Only a type the model actually gave decides the image; the
                    # "Document" default alone must not.
                    image_prompt=_build_image_prompt(title, description, given_type),
                )
            )

        logger.info(
            f"Extracted {len(items)} evidence items via LLM in {duration_ms:.2f}ms"
        )
        return items

    except Exception:
        logger.exception("Error extracting evidence via LLM")
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
        data = parse_llm_json(response)
    except Exception as e:
        logger.exception("Error extracting evidence from text", extra={"error": str(e)})
        data = {
            "title": "Extracted Evidence",
            "evidence_type": "Witness Testimony",
            "description": text.strip(),
            "source": source,
            "image_prompt": None,
        }

    title = str(data.get("title") or "Extracted Evidence")
    description = str(data.get("description") or text.strip())
    given_type = data.get("evidence_type")
    evidence_type = str(given_type or "Other")
    # Text evidence gets no image, whatever the model suggested.
    suggested = (
        data.get("image_prompt")
        if looks_visual(title, description, given_type)
        else None
    )
    prompt_text = suggested or _build_image_prompt(title, description, given_type)

    return EvidenceItem(
        exhibit_ref=exhibit_ref or "EX-01",
        title=title,
        evidence_type=evidence_type,
        description=description,
        source=data.get("source") or source,
        image_prompt=prompt_text,
    )


def next_exhibit_ref(case: Case) -> str:
    """Return the next sequential exhibit reference for a case. Privileged notes
    aren't exhibits, so they take no number until they are tendered."""
    max_index = 0
    for item in case.evidence:
        if item.private:
            continue
        match = re.search(r"(\d+)$", item.exhibit_ref or "")
        if match:
            max_index = max(max_index, int(match.group(1)))
    return f"EX-{max_index + 1:02d}"


async def index_evidence_item(case: Case, item: EvidenceItem) -> None:
    """Index a single evidence item into RAG memory. A privileged one waits until
    it is tendered: RAG memory feeds the other side and the court."""
    if item.private:
        return
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
    """Format the exhibits before the court for LLM prompts. Privileged items in
    the user's brief are left out until tendered."""
    evidence = [item for item in evidence or [] if not item.private]
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


def next_note_ref(case: Case) -> str:
    """PN-01, PN-02...: privileged notes from the user's interviews, numbered
    apart from the exhibits. Tendered notes keep their place in the count."""
    notes = sum(1 for item in case.evidence if ":" in (item.origin_id or ""))
    return f"PN-{notes + 1:02d}"


def tender_exhibits(
    case: Case, refs: list[str], side: str
) -> tuple[list[str], list[EvidenceItem]]:
    """Privileged notes counsel now relies on in court go before the court as
    exhibits: using them waives the privilege. Each takes the next exhibit number
    and is logged on the record (the caller saves the case). Returns the refs as
    cited, renumbered, and the tendered items to index after the save."""
    counsel = "the Plaintiff" if side == "plaintiff" else "the Defence"
    renamed: dict[str, str] = {}
    tendered = []
    for item in case.evidence:
        if item.private and item.exhibit_ref in refs:
            note_ref, item.exhibit_ref = item.exhibit_ref, next_exhibit_ref(case)
            item.private = False
            renamed[note_ref] = item.exhibit_ref
            tendered.append(item)
            case.log(
                f"Counsel for {counsel} tenders {item.title} in evidence"
                f" as {item.exhibit_ref}"
            )
    return [renamed.get(ref, ref) for ref in refs], tendered


def wants_image(item: EvidenceItem) -> bool:
    """A visual exhibit with no image yet. Text (documents, records, testimony)
    is read, not looked at, so it gets none."""
    return (
        not item.image_url
        and item.media_status
        in {EvidenceMediaStatus.NOT_REQUESTED, EvidenceMediaStatus.FAILED}
        and looks_visual(item.title, item.description, item.evidence_type)
    )


def image_slots(case: Case) -> int:
    """Images the case may still have: the per-case limit less those made or
    being made."""
    limit = max(0, settings.evidence_image_generation_limit_per_case)
    used = sum(
        1
        for item in case.evidence
        if item.media_status
        in {EvidenceMediaStatus.GENERATED, EvidenceMediaStatus.PENDING}
    )
    return max(0, limit - used)


async def queue_image(case: Case, index: int) -> None:
    """Mark one exhibit's image as pending; generate_queued_images makes it."""
    item = case.evidence[index]
    item.media_status = EvidenceMediaStatus.PENDING
    item.image_requested_at = get_current_datetime()
    await _save_item(case, index, item)


# Longer than a queue of images takes to make, so only lost ones pass it.
IMAGE_TIMEOUT = timedelta(minutes=10)


async def release_stuck_images(case: Case) -> None:
    """An image still pending after IMAGE_TIMEOUT was lost (the server restarted
    while making it): mark it failed, so the page stops waiting, it frees its
    slot and Regenerate can make it again."""
    cutoff = get_current_datetime() - IMAGE_TIMEOUT
    for index, item in enumerate(case.evidence):
        at = item.image_requested_at
        if at is not None and at.tzinfo is None:
            at = at.replace(tzinfo=UTC)  # MongoDB returns naive UTC
        if item.media_status != EvidenceMediaStatus.PENDING or (at and at > cutoff):
            continue
        item.media_status = EvidenceMediaStatus.FAILED
        # Only while still pending: the image may have just been made after all.
        await Case.find_one(
            {
                "cnr": case.cnr,
                f"evidence.{index}.id": item.id,
                f"evidence.{index}.media_status": EvidenceMediaStatus.PENDING.value,
            }
        ).update_one(
            {"$set": {f"evidence.{index}.media_status": item.media_status.value}}
        )


async def queue_missing_images(case: Case) -> int:
    """Queue images for visual exhibits that have none, up to the per-case limit."""
    slots = image_slots(case)
    queued = 0
    for index, item in enumerate(case.evidence):
        if queued >= slots:
            break
        if wants_image(item):
            await queue_image(case, index)
            queued += 1
    return queued


async def generate_queued_images(cnr: str) -> None:
    """Background task: make each pending exhibit image while the user prepares.

    Each result is written to its own exhibit only, so party chats and anything
    else saved meanwhile are kept. One lost to a restart is released by
    release_stuck_images.
    """
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        return
    for index, item in enumerate(case.evidence):
        if item.media_status != EvidenceMediaStatus.PENDING or item.image_url:
            continue
        try:
            if not item.image_prompt:
                item.image_prompt = await generate_evidence_prompt(
                    item.title, item.description, item.evidence_type
                )
            if not item.image_prompt:
                item.media_status = EvidenceMediaStatus.NOT_REQUESTED
                await _save_item(case, index, item)
                continue
            await _make_image(case, index, item)
        except Exception:
            logger.exception(f"Background image failed for {item.exhibit_ref} in {cnr}")


async def _save_item(case: Case, index: int, item: EvidenceItem) -> None:
    """Write one exhibit, guarded by its id, without touching the rest of the case."""
    case.evidence[index] = item
    await Case.find_one({"cnr": case.cnr, f"evidence.{index}.id": item.id}).update_one(
        {"$set": {f"evidence.{index}": item.model_dump(mode="json")}}
    )


async def _make_image(case: Case, index: int, item: EvidenceItem) -> None:
    """Generate and upload one exhibit image; it ends up generated or failed."""
    try:
        image_bytes = await generate_image_from_prompt(item.image_prompt or "")
        image_url, public_id = await upload_evidence_image(
            image_bytes,
            case.cnr,
            item.id,
            existing_public_id=item.image_public_id,
        )
        item.image_url = image_url
        item.image_public_id = public_id
        item.media_status = EvidenceMediaStatus.GENERATED
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
    except Exception as e:
        logger.exception(
            "Evidence image generation failed",
            extra={"cnr": case.cnr, "evidence_id": item.id, "error": str(e)},
        )
        item.media_status = EvidenceMediaStatus.FAILED
    finally:
        await _save_item(case, index, item)


def _build_image_prompt(
    title: str, description: str, evidence_type: str | None = None
) -> str | None:
    if not looks_visual(title, description, evidence_type):
        return None

    clean_description = re.sub(r"\s+", " ", description.replace("**", "")).strip()
    return (
        "Create a neutral, non-graphic legal exhibit illustration for "
        f"{title}: {clean_description[:240]}"
    )
