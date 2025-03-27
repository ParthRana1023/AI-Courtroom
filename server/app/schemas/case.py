# app/schemas/case.py
from beanie import PydanticObjectId
from pydantic import BaseModel
from app.models.case import CaseStatus

class CaseBase(BaseModel):
    sections_involved: int
    section_numbers: list[int]

class CaseCreate(BaseModel):
    sections_involved: int
    section_numbers: list[int]

class CaseOut(BaseModel):
    id: PydanticObjectId
    cnr: str
    details: str
    status: CaseStatus  # Add this
    verdict: str | None = None

    class ConfigDict:
        json_encoders = {PydanticObjectId: str}