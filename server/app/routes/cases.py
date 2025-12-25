# app/routes/cases.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId
from app.models.case import Case, CaseStatus, Roles
from app.schemas.case import CaseCreate, CaseOut
from app.dependencies import get_current_user
from app.services.llm.case_generation import generate_case
from app.utils.rate_limiter import case_generation_rate_limiter
from app.models.user import User

router = APIRouter(tags=["cases"])

@router.get("", response_model=List[dict])
async def list_cases(current_user: User = Depends(get_current_user)):
    """List all cases for the current user"""
    cases = await Case.find(Case.user_id == current_user.id).to_list()
    
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
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
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
        "created_at": case_dict["created_at"]
    }

@router.put("/{cnr}/status")
async def update_case_status(
    cnr: str,
    status_update: dict,
    current_user: User = Depends(get_current_user)
):
    """Update the status of a specific case by CNR"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
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

    case.status = new_status
    await case.save()

    return {"message": "Case status updated successfully", "new_status": case.status}

@router.put("/{cnr}/roles")
async def update_case_roles(
    cnr: str,
    roles_update: dict,
    current_user: User = Depends(get_current_user)
):
    """Update the user's and AI's roles for a specific case by CNR"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to update this case"
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

    await case.save()

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
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to access this case"
        )
    
    # Check if case already has arguments
    if case.plaintiff_arguments or case.defendant_arguments:
        raise HTTPException(
            status_code=400,
            detail="Case already has arguments. Cannot generate opening statement."
        )
    
    # Generate plaintiff's opening statement
    print("[DEBUG] Generating plaintiff opening statement for defendant user")
    plaintiff_opening_statement = await opening_statement("plaintiff", case.details, "defendant")
    
    # Add the opening statement to the case
    case.plaintiff_arguments.append(ArgumentItem(
        type="opening",
        content=plaintiff_opening_statement,
        user_id=None,  # LLM-generated
        timestamp=get_current_datetime()
    ))
    
    # Update case status to ACTIVE
    case.status = CaseStatus.ACTIVE
    await case.save()
    
    return {
        "ai_opening_statement": plaintiff_opening_statement,
        "ai_opening_role": "plaintiff"
    }

@router.delete("/{cnr}")
async def delete_case(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a specific case by CNR"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to delete this case"
        )
    
    # Delete the case
    await case.delete()
    
    return {"message": "Case deleted successfully"}

@router.get("/{case_identifier}/history")
async def get_case_history(
    case_identifier: str,
    current_user: User = Depends(get_current_user)
):
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
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    if str(case.user_id) != str(current_user.id):
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
    # Generate the case - rate limit only registered if this succeeds
    generated_case = await generate_case(
        case_data.sections_involved,
        case_data.section_numbers
    )
    # Add the user_id to the case
    generated_case["user_id"] = current_user.id
    case = Case(**generated_case)
    await case.insert()
    
    # Register rate limit usage only after successful generation
    await case_generation_rate_limiter.register_usage(str(current_user.id))
    
    # Convert ObjectId fields to strings before returning
    case_dict = case.model_dump()
    case_dict["id"] = str(case.id)
    case_dict["user_id"] = str(case.user_id)
    
    # Return the dictionary instead of the model
    return case_dict