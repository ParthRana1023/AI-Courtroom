# app/routes/cases.py
from typing import Union
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId
from app.models.case import Case
from app.schemas.case import CaseCreate, CaseOut
from app.dependencies import get_current_user
from app.services.llm.case_generation import generate_case
from app.models.user import User

router = APIRouter(tags=["cases"])

@router.get("", response_model=list[CaseOut])
async def list_cases():
    return await Case.find_all().to_list()

@router.get("/{case_identifier}")
async def get_case(case_identifier: Union[str, PydanticObjectId]):
    if isinstance(case_identifier, str):
        case = await Case.find_one(Case.cnr == case_identifier)
    else:
        case = await Case.get(case_identifier)
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case

@router.post("/generate", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
async def generate_new_case(
    case_data: CaseCreate,
    current_user: User = Depends(get_current_user)
):
    generated_case = await generate_case(
        case_data.sections_involved,
        case_data.section_numbers
    )
    case = Case(**generated_case)
    await case.insert()
    return case