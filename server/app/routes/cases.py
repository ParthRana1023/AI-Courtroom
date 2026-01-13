# app/routes/cases.py
import time
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId
from app.models.case import Case, CaseStatus, Roles
from app.schemas.case import CaseCreate, CaseOut
from app.dependencies import get_current_user
from app.services.llm.case_generation import generate_case
from app.utils.rate_limiter import case_generation_rate_limiter
from app.models.user import User
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["cases"])

@router.get("", response_model=List[dict])
async def list_cases(current_user: User = Depends(get_current_user)):
    """List all cases for the current user (excluding soft-deleted cases)"""
    logger.debug(f"Listing cases for user: {current_user.email}")
    
    # Use $ne: True to match cases where is_deleted is False OR doesn't exist (None)
    cases = await Case.find(
        Case.user_id == current_user.id,
        {"is_deleted": {"$ne": True}}
    ).to_list()

    logger.debug(f"Found {len(cases)} cases for user: {current_user.email}")
    
    return [
        {
            "id": str(case.id),            
            "cnr": case.cnr,
            "title": case.title,
            "created_at": case.created_at,
            "status": case.status,
        }
        for case in cases
    ]

@router.get("/{cnr}")
async def get_case(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific case by CNR"""
    logger.debug(f"Fetching case {cnr} for user: {current_user.email}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized access attempt to case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Use model_dump(mode='json') to handle serialization of ObjectIds
    case_dict = case.model_dump(mode='json')

    # Return case data with fields directly in the response
    return {
        "cnr": case_dict["cnr"],
        "status": case_dict["status"],
        "title": case_dict["title"],  # Title is now directly in the Case model
        "case_number": case_dict.get('case_number'),
        "court": case_dict.get('court'),
        "case_text": case_dict["details"],  # Include the raw markdown text
        "plaintiff_arguments": case_dict["plaintiff_arguments"],
        "defendant_arguments": case_dict["defendant_arguments"],
        "verdict": case_dict["verdict"],
        "created_at": case_dict["created_at"],
        "user_role": case_dict.get("user_role"),  # Include user's role
        "ai_role": case_dict.get("ai_role"),  # Include AI's role
        "session_args_at_start": case_dict.get("session_args_at_start", 0),  # User args when session started
    }

@router.put("/{cnr}/status")
async def update_case_status(
    cnr: str,
    status_update: dict,
    current_user: User = Depends(get_current_user)
):
    """Update the status of a specific case by CNR"""
    logger.info(f"Status update requested for case {cnr} by user: {current_user.email}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found for status update: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")

    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized status update attempt for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to update this case"
        )

    # Update the status
    new_status = status_update.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status not provided")

    # Validate the new status against allowed CaseStatus values
    # Assuming CaseStatus enum is imported or defined elsewhere
    if new_status not in [e.value for e in CaseStatus]:
         raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    # When transitioning to ACTIVE, record current user argument count
    # This is used to ensure user submits at least 2 more arguments before ending session
    if new_status == CaseStatus.ACTIVE.value:
        # Count current user arguments (arguments with user_id set)
        user_arg_count = sum(
            1 for arg in case.plaintiff_arguments + case.defendant_arguments
            if arg.user_id is not None
        )
        case.session_args_at_start = user_arg_count

    old_status = case.status
    case.status = new_status
    try:
        await case.save()
        logger.info(f"Case {cnr} status updated: {old_status} → {new_status}")
    except Exception as e:
        logger.error(f"Error saving case status for {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update case status. Please try again.")

    return {"message": "Case status updated successfully", "new_status": case.status}

@router.put("/{cnr}/roles")
async def update_case_roles(
    cnr: str,
    roles_update: dict,
    current_user: User = Depends(get_current_user)
):
    """Update the user's and AI's roles for a specific case by CNR"""
    logger.info(f"Roles update requested for case {cnr} by user: {current_user.email}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found for roles update: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")

    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized roles update attempt for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to update this case"
        )

    # Check if roles are already set (locked) - can't change once chosen
    if case.user_role and case.user_role != Roles.NOT_STARTED:
        logger.warning(f"Attempt to change locked role for case {cnr}")
        raise HTTPException(
            status_code=400,
            detail="Role has already been selected and cannot be changed"
        )

    new_user_role = roles_update.get("user_role")
    new_ai_role = roles_update.get("ai_role")

    if not new_user_role and not new_ai_role:
        raise HTTPException(status_code=400, detail="No roles provided for update")

    if new_user_role:
        try:
            case.user_role = Roles(new_user_role)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid user_role: {new_user_role}. Must be 'plaintiff', 'defendant', or 'not_started'"
            )
    if new_ai_role:
        try:
            case.ai_role = Roles(new_ai_role)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ai_role: {new_ai_role}. Must be 'plaintiff', 'defendant', or 'not_started'"
            )

    try:
        await case.save()
        logger.info(f"Case {cnr} roles updated: user={case.user_role}, ai={case.ai_role}")
    except Exception as e:
        logger.error(f"Error saving case roles for {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update case roles. Please try again.")

    return {"message": "Case roles updated successfully", "user_role": case.user_role, "ai_role": case.ai_role}

@router.post("/{cnr}/generate-plaintiff-opening")
async def generate_plaintiff_opening(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Generate a plaintiff opening statement when user selects defendant role"""
    from app.models.case import ArgumentItem
    from app.utils.datetime import get_current_datetime
    from app.services.llm.lawyer import opening_statement
    
    logger.info(f"Plaintiff opening statement generation requested for case {cnr}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found for opening statement: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")

    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized opening statement request for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to access this case"
        )
    
    # Check if case already has arguments
    if case.plaintiff_arguments or case.defendant_arguments:
        logger.warning(f"Attempt to generate opening statement for case {cnr} that already has arguments")
        raise HTTPException(
            status_code=400,
            detail="Case already has arguments. Cannot generate opening statement."
        )
    
    # Generate plaintiff's opening statement
    logger.info(f"Generating plaintiff opening statement for case {cnr}")
    start_time = time.perf_counter()
    
    try:
        plaintiff_opening_statement = await opening_statement("plaintiff", case.details, "defendant")
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Opening statement generated for case {cnr} in {duration_ms:.2f}ms")
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"Error generating opening statement for case {cnr} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate opening statement. Please try again.")
    
    # Add the opening statement to the case
    case.plaintiff_arguments.append(ArgumentItem(
        type="opening",
        content=plaintiff_opening_statement,
        user_id=None,  # LLM-generated
        timestamp=get_current_datetime()
    ))
    
    # NOTE: Do NOT set case status to ACTIVE here - that only happens 
    # when user clicks "Proceed to Courtroom" on the Parties page
    try:
        await case.save()
        logger.debug(f"Opening statement saved for case {cnr}")
    except Exception as e:
        logger.error(f"Error saving opening statement for case {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save opening statement. Please try again.")
    
    return {
        "ai_opening_statement": plaintiff_opening_statement,
        "ai_opening_role": "plaintiff"
    }

@router.delete("/{cnr}")
async def delete_case(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a specific case by CNR (moves to recycle bin)"""
    from app.utils.datetime import get_current_datetime
    
    logger.info(f"Case deletion requested for {cnr} by user: {current_user.email}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found for deletion: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized deletion attempt for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to delete this case"
        )
    
    # Soft delete the case
    case.is_deleted = True
    case.deleted_at = get_current_datetime()
    try:
        await case.save()
        logger.info(f"Case {cnr} moved to recycle bin")
    except Exception as e:
        logger.error(f"Error deleting case {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete case. Please try again.")
    
    return {"message": "Case moved to recycle bin"}

@router.get("/deleted/list", response_model=List[dict])
async def list_deleted_cases(current_user: User = Depends(get_current_user)):
    """List all soft-deleted cases for the current user (recycle bin)"""
    logger.debug(f"Listing deleted cases for user: {current_user.email}")
    
    cases = await Case.find(
        Case.user_id == current_user.id,
        Case.is_deleted == True
    ).to_list()
    
    logger.debug(f"Found {len(cases)} deleted cases for user: {current_user.email}")
    
    return [
        {
            "id": str(case.id),            
            "cnr": case.cnr,
            "title": case.title,
            "created_at": case.created_at,
            "deleted_at": case.deleted_at,
            "status": case.status,
        }
        for case in cases
    ]

@router.post("/{cnr}/restore")
async def restore_case(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Restore a soft-deleted case from recycle bin"""
    logger.info(f"Case restoration requested for {cnr} by user: {current_user.email}")
    
    case = await Case.find_one(Case.cnr == cnr, Case.is_deleted == True)
    if not case:
        logger.warning(f"Deleted case not found for restoration: {cnr}")
        raise HTTPException(status_code=404, detail="Deleted case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized restoration attempt for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to restore this case"
        )
    
    # Restore the case
    case.is_deleted = False
    case.deleted_at = None
    try:
        await case.save()
        logger.info(f"Case {cnr} restored from recycle bin")
    except Exception as e:
        logger.error(f"Error restoring case {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to restore case. Please try again.")
    
    return {"message": "Case restored successfully"}

@router.delete("/{cnr}/permanent")
async def permanent_delete_case(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Permanently delete a case (cannot be recovered)"""
    logger.info(f"Permanent deletion requested for case {cnr} by user: {current_user.email}")
    
    case = await Case.find_one(Case.cnr == cnr, Case.is_deleted == True)
    if not case:
        logger.warning(f"Deleted case not found for permanent deletion: {cnr}")
        raise HTTPException(status_code=404, detail="Deleted case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized permanent deletion attempt for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to permanently delete this case"
        )
    
    # Permanently delete the case
    try:
        await case.delete()
        logger.info(f"Case {cnr} permanently deleted")
    except Exception as e:
        logger.error(f"Error permanently deleting case {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to permanently delete case. Please try again.")
    
    return {"message": "Case permanently deleted"}

@router.get("/{case_identifier}/history")
async def get_case_history(
    case_identifier: str,
    current_user: User = Depends(get_current_user)
):
    logger.debug(f"Fetching case history for {case_identifier}")
    
    # First find the case using the same logic as in get_case
    case = await Case.find_one(Case.cnr == case_identifier)
    
    if not case:
        try:
            if len(case_identifier) == 24:
                obj_id = PydanticObjectId(case_identifier)
                case = await Case.get(obj_id)
        except:
            pass
    
    if not case:
        logger.warning(f"Case not found for history: {case_identifier}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized history access for case {case_identifier} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Prepare the history response
    history = {
        "plaintiff_arguments": case.plaintiff_arguments,
        "defendant_arguments": case.defendant_arguments,
        "verdict": case.verdict
    }
    
    return history

@router.post("/generate", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
async def generate_new_case(
    case_data: CaseCreate,
    current_user: User = Depends(get_current_user),
    _rate_check: User = Depends(case_generation_rate_limiter.check_only)
):
    from app.services.high_court_mapping import get_high_court, get_random_high_court
    
    logger.info(f"Case generation requested by user: {current_user.email} with {case_data.sections_involved} sections")
    
    # Determine high court and city based on user's preference
    high_court = None
    city = None
    
    if current_user.case_location_preference == "user_location":
        # Use user's saved location
        if current_user.state_iso2 and current_user.country_iso2:
            high_court = get_high_court(current_user.state_iso2, current_user.country_iso2)
        if current_user.city:
            city = current_user.city
        logger.debug(f"Using user location: high_court={high_court}, city={city}")
    elif current_user.case_location_preference == "specific_state":
        # Use user's preferred state
        if current_user.preferred_case_state:
            high_court = get_high_court(current_user.preferred_case_state, "IN")
        logger.debug(f"Using specific state: high_court={high_court}")
    else:
        logger.debug("Using random location for case generation")
    # else: preference is "random" or not set, both stay None (will use random in generate_case)
    
    # Generate the case - rate limit only registered if this succeeds
    start_time = time.perf_counter()
    try:
        generated_case = await generate_case(
            case_data.sections_involved,
            case_data.section_numbers,
            high_court=high_court,
            city=city
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Case generated successfully for user {current_user.email} in {duration_ms:.2f}ms")
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"Case generation failed for user {current_user.email} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate case. Please try again.")
    
    # Add the user_id to the case
    generated_case["user_id"] = current_user.id
    case = Case(**generated_case)
    try:
        await case.insert()
        logger.info(f"Case {case.cnr} saved to database for user: {current_user.email}")
    except Exception as e:
        logger.error(f"Error inserting case to database: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save generated case. Please try again.")
    
    # Register rate limit usage only after successful generation
    await case_generation_rate_limiter.register_usage(str(current_user.id))
    logger.debug(f"Rate limit registered for user: {current_user.email}")
    
    # Convert ObjectId fields to strings before returning
    case_dict = case.model_dump()
    case_dict["id"] = str(case.id)
    case_dict["user_id"] = str(case.user_id)
    
    # Return the dictionary instead of the model
    return case_dict