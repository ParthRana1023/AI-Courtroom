from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pymongo.results import UpdateResult

from app.config import settings
from app.dependencies import get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CourtroomProceedingsEventType,
    EvidenceMediaStatus,
    Roles,
)
from app.models.user import User
from app.schemas.evidence import EvidenceExtractRequest
from app.services.evidence_service import (
    extract_evidence_from_text,
    extract_evidence_items,
    generate_queued_images,
    image_slots,
    index_evidence_item,
    next_exhibit_ref,
    next_note_ref,
    queue_image,
    queue_missing_images,
    release_stuck_images,
    wants_image,
)

logger = get_logger(__name__)

router = APIRouter(tags=["evidence"])


@router.get("/{cnr}/evidence")
async def get_case_evidence(cnr: str, current_user: User = Depends(get_current_user)):
    """Get structured evidence for a case, backfilling legacy cases when needed."""
    logger.debug(f"Fetching evidence for case {cnr}")
    case = await get_owned_case(cnr, current_user)
    await release_stuck_images(case)

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
        if event.struck:
            raise HTTPException(
                status_code=400,
                detail="The court struck this answer from the record.",
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Extract a structured evidence item from a party reply or witness answer."""
    case = await get_owned_case(cnr, current_user)
    await release_stuck_images(case)
    text, source, origin_id = extraction_source(case, request)
    if not text.strip():
        raise HTTPException(status_code=400, detail="There is nothing to extract.")
    if any(item.origin_id == origin_id for item in case.evidence):
        raise HTTPException(
            status_code=409, detail="This has already been extracted as evidence."
        )

    # What a client tells counsel in an interview is privileged (BSA s.132): it
    # is kept as a privileged note until the user relies on it in court.
    # Testimony given in court is already on the record, so it is an exhibit.
    private = request.event_id is None
    item = await extract_evidence_from_text(
        text,
        source=source,
        exhibit_ref=next_note_ref(case) if private else next_exhibit_ref(case),
    )
    item.origin_id = origin_id
    item.private = private

    try:
        # Appended on its own: a whole-case save would undo exhibit images the
        # background task finished while the text was being extracted.
        # Only if nobody extracted it meanwhile (a double click, or the AI logging
        # the same answer while the model was drafting this).
        result = await Case.find_one(
            {"cnr": cnr, "evidence.origin_id": {"$ne": origin_id}}
        ).update_one({"$push": {"evidence": item.model_dump(mode="json")}})
        if not isinstance(result, UpdateResult) or not result.modified_count:
            raise HTTPException(
                status_code=409, detail="This has already been extracted as evidence."
            )
        case.evidence.append(item)
        await index_evidence_item(case, item)
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Error extracting evidence for case {cnr}")
        raise HTTPException(status_code=500, detail="Failed to extract evidence.")

    # Images come once a side is chosen, and only for visual exhibits.
    queued = (
        case.user_role != Roles.NOT_STARTED
        and wants_image(item)
        and image_slots(case) > 0
    )
    if queued:
        await queue_image(case, len(case.evidence) - 1)
        background_tasks.add_task(generate_queued_images, cnr)
    return {"evidence": item.model_dump(mode="json"), "image_queued": queued}


@router.post("/{cnr}/evidence/images/generate-missing")
async def generate_missing_evidence_images(
    cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Queue images for visual exhibits that have none; they are made in the
    background and show up as the evidence is fetched again."""
    case = await get_owned_case(cnr, current_user)
    await release_stuck_images(case)
    queued = await queue_missing_images(case)
    if queued:
        background_tasks.add_task(generate_queued_images, cnr)
    return {
        "evidence": [item.model_dump(mode="json") for item in case.evidence],
        "images_queued": queued,
    }


@router.post("/{cnr}/evidence/{evidence_id}/image/regenerate")
async def regenerate_evidence_image(
    cnr: str,
    evidence_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Retry one exhibit's image in the background."""
    case = await get_owned_case(cnr, current_user)
    await release_stuck_images(case)
    index = next(
        (i for i, item in enumerate(case.evidence) if item.id == evidence_id), None
    )
    if index is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    item = case.evidence[index]

    message = None
    if item.image_url:
        message = "This exhibit already has its image."
    elif item.media_status == EvidenceMediaStatus.PENDING:
        message = "The image is already being made."
    elif not wants_image(item):
        message = "This exhibit is text, so it has no image."
    elif image_slots(case) == 0:
        limit = settings.evidence_image_generation_limit_per_case
        message = f"This case has used its {limit} exhibit images."
    if message:
        raise HTTPException(status_code=409, detail=message)

    await queue_image(case, index)
    background_tasks.add_task(generate_queued_images, cnr)
    return {"evidence": [e.model_dump(mode="json") for e in case.evidence]}
