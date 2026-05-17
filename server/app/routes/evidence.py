from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.logging_config import get_logger
from app.models.case import Case, EvidenceItem, Roles
from app.models.user import User
from app.schemas.evidence import EvidenceCreate, EvidenceExtractRequest
from app.services.cloudinary_service import delete_evidence_image
from app.services.evidence_service import (
    extract_evidence_from_text,
    extract_evidence_items,
    generate_missing_evidence_images_for_case,
    index_evidence_item,
    next_exhibit_ref,
)
from app.services.rag import index_case_memory

logger = get_logger(__name__)

router = APIRouter(tags=["evidence"])


async def get_owned_case(cnr: str, current_user: User) -> Case:
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, detail="You don't have permission to access this case"
        )
    return case


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
        except Exception as e:
            logger.error(
                f"Error saving backfilled evidence for case {cnr}: {str(e)}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=500,
                detail="Failed to prepare evidence. Please try again.",
            )

    return {"evidence": [item.model_dump(mode="json") for item in case.evidence]}


@router.post("/{cnr}/evidence", status_code=status.HTTP_201_CREATED)
async def add_case_evidence(
    cnr: str,
    evidence_data: EvidenceCreate,
    current_user: User = Depends(get_current_user),
):
    """Manually add evidence to a case."""
    case = await get_owned_case(cnr, current_user)
    item = EvidenceItem(
        exhibit_ref=next_exhibit_ref(case),
        title=evidence_data.title,
        evidence_type=evidence_data.evidence_type,
        description=evidence_data.description,
        source=evidence_data.source,
        image_prompt=evidence_data.image_prompt,
    )
    case.evidence.append(item)

    try:
        await case.save()
        await index_evidence_item(case, item)
        generation_summary = await generate_if_role_selected(case)
    except Exception as e:
        logger.error(f"Error adding evidence for case {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add evidence.")

    return {
        "evidence": item.model_dump(mode="json"),
        "image_generation": (
            generation_summary.model_dump() if generation_summary else None
        ),
    }


@router.post("/{cnr}/evidence/extract", status_code=status.HTTP_201_CREATED)
async def extract_case_evidence(
    cnr: str,
    request: EvidenceExtractRequest,
    current_user: User = Depends(get_current_user),
):
    """Extract a structured evidence item from chat or courtroom text."""
    case = await get_owned_case(cnr, current_user)
    item = await extract_evidence_from_text(
        request.text,
        source=request.source,
        exhibit_ref=next_exhibit_ref(case),
    )
    case.evidence.append(item)

    try:
        await case.save()
        await index_evidence_item(case, item)
        generation_summary = await generate_if_role_selected(case)
    except Exception as e:
        logger.error(
            f"Error extracting evidence for case {cnr}: {str(e)}", exc_info=True
        )
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


@router.delete("/{cnr}/evidence/{evidence_id}")
async def delete_case_evidence(
    cnr: str,
    evidence_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete evidence from a case and remove its image when present."""
    case = await get_owned_case(cnr, current_user)
    index_to_delete = next(
        (index for index, item in enumerate(case.evidence) if item.id == evidence_id),
        None,
    )
    if index_to_delete is None:
        raise HTTPException(status_code=404, detail="Evidence not found")

    item = case.evidence.pop(index_to_delete)
    if item.image_public_id:
        await delete_evidence_image(item.image_public_id)

    try:
        await case.save()
        await index_case_memory(case)
    except Exception as e:
        logger.error(
            f"Error deleting evidence {evidence_id} for case {cnr}: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to delete evidence.")

    return {"message": "Evidence deleted successfully", "evidence_id": evidence_id}
