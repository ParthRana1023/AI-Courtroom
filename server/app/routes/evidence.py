from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CourtroomProceedingsEventType,
    Roles,
)
from app.models.user import User
from app.schemas.evidence import EvidenceExtractRequest
from app.services.evidence_service import (
    extract_evidence_from_text,
    extract_evidence_items,
    generate_missing_evidence_images_for_case,
    index_evidence_item,
    next_exhibit_ref,
    regenerate_evidence_image_for_case_item,
)

logger = get_logger(__name__)

router = APIRouter(tags=["evidence"])


async def generate_if_role_selected(case: Case):
    if case.user_role and case.user_role != Roles.NOT_STARTED:
        return await generate_missing_evidence_images_for_case(case)
    return None


@router.get("/{cnr}/evidence")
async def get_case_evidence(cnr: str, current_user: User = Depends(get_current_user)):
    """Get structured evidence for a case, backfilling legacy cases when needed."""
    logger.debug(f"Fetching evidence for case {cnr}")
    case = await get_owned_case(cnr, current_user)

    if not case.evidence:
        logger.info(f"Backfilling evidence for legacy case {cnr}")
        case.evidence = await extract_evidence_items(case.details)
        try:
            await case.save()
            for item in case.evidence:
                await index_evidence_item(case, item)
        except Exception:
            logger.exception(f"Error saving backfilled evidence for case {cnr}")
            raise HTTPException(
                status_code=500,
                detail="Failed to prepare evidence. Please try again.",
            )

    return {"evidence": [item.model_dump(mode="json") for item in case.evidence]}


def extraction_source(
    case: Case, request: EvidenceExtractRequest
) -> tuple[str, str, str]:
    """(text, source label, origin id) for what the user asked to extract.

    Only a party's own reply or a witness's answer in court can become evidence.
    """
    if request.event_id:
        event = next(
            (e for e in case.courtroom_proceedings if e.id == request.event_id), None
        )
        if event is None:
            raise HTTPException(status_code=404, detail="Proceeding not found.")
        if event.type != CourtroomProceedingsEventType.WITNESS_EXAMINED_A:
            raise HTTPException(
                status_code=400,
                detail="Only a witness's answers can be extracted as evidence.",
            )
        source = f"{event.speaker_name or 'Witness'} testimony"
        return event.content or "", source, event.id

    # The schema guarantees both are set when event_id isn't.
    party_id, message_id = request.party_id or "", request.message_id or ""
    message = case.get_party_message(party_id, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    if message.get("sender") == "user":
        raise HTTPException(
            status_code=400,
            detail="Only what a party said can be extracted as evidence.",
        )
    party = case.get_party(party_id)
    source = f"{party.name if party else 'Party'} chat"
    return (
        message.get("content", ""),
        source,
        f"{party_id}:{message_id}",
    )


@router.post("/{cnr}/evidence/extract", status_code=status.HTTP_201_CREATED)
async def extract_case_evidence(
    cnr: str,
    request: EvidenceExtractRequest,
    current_user: User = Depends(get_current_user),
):
    """Extract a structured evidence item from a party reply or witness answer."""
    case = await get_owned_case(cnr, current_user)
    text, source, origin_id = extraction_source(case, request)
    if not text.strip():
        raise HTTPException(status_code=400, detail="There is nothing to extract.")
    if any(item.origin_id == origin_id for item in case.evidence):
        raise HTTPException(
            status_code=409, detail="This has already been extracted as evidence."
        )

    item = await extract_evidence_from_text(
        text, source=source, exhibit_ref=next_exhibit_ref(case)
    )
    item.origin_id = origin_id
    case.evidence.append(item)

    try:
        await case.save()
        await index_evidence_item(case, item)
        generation_summary = await generate_if_role_selected(case)
    except Exception:
        logger.exception(f"Error extracting evidence for case {cnr}")
        raise HTTPException(status_code=500, detail="Failed to extract evidence.")

    return {
        "evidence": item.model_dump(mode="json"),
        "image_generation": (
            generation_summary.model_dump() if generation_summary else None
        ),
    }


@router.post("/{cnr}/evidence/images/generate-missing")
async def generate_missing_evidence_images(
    cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Backend retry endpoint for missing evidence images."""
    case = await get_owned_case(cnr, current_user)
    summary = await generate_missing_evidence_images_for_case(case)
    return {
        "evidence": [item.model_dump(mode="json") for item in case.evidence],
        "image_generation": summary.model_dump(),
    }


@router.post("/{cnr}/evidence/{evidence_id}/image/regenerate")
async def regenerate_evidence_image(
    cnr: str,
    evidence_id: str,
    current_user: User = Depends(get_current_user),
):
    """Retry image generation for a single failed or missing evidence item."""
    case = await get_owned_case(cnr, current_user)
    if not any(item.id == evidence_id for item in case.evidence):
        raise HTTPException(status_code=404, detail="Evidence not found")

    summary = await regenerate_evidence_image_for_case_item(case, evidence_id)
    return {
        "evidence": [item.model_dump(mode="json") for item in case.evidence],
        "image_generation": summary.model_dump(),
    }
