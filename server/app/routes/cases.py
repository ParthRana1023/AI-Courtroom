# app/routes/cases.py
from datetime import datetime
from time import timezone
from typing import List, Union
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId
from app.models.case import Case
from app.schemas.case import CaseCreate, CaseOut
from app.dependencies import get_current_user
from app.services.llm.case_generation import generate_case
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
    
    # Return case data with fields directly in the response
    return {
        "cnr": case.cnr,
        "status": case.status,
        "title": case.title,  # Title is now directly in the Case model
        "case_number": case.case_number if hasattr(case, 'case_number') else None,
        "court": case.court if hasattr(case, 'court') else None,
        "case_text": case.details,  # Include the raw markdown text
        "plaintiff_arguments": case.plaintiff_arguments,
        "defendant_arguments": case.defendant_arguments,
        "verdict": case.verdict,
        "created_at": case.created_at
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
    current_user: User = Depends(get_current_user)
):
    generated_case = await generate_case(
        case_data.sections_involved,
        case_data.section_numbers
    )
    # Add the user_id to the case
    generated_case["user_id"] = current_user.id
    case = Case(**generated_case)
    await case.insert()
    
    # Convert ObjectId fields to strings before returning
    case_dict = case.model_dump()
    case_dict["id"] = str(case.id)
    case_dict["user_id"] = str(case.user_id)
    
    # Return the dictionary instead of the model
    return case_dict