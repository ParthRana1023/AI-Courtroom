# app/models/formatted_details.py
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel
from datetime import date

class Background(BaseModel):
    date: str = ""
    description: str = ""
    # Add any other fields that might be in your background objects

class Ground(BaseModel):
    title: str = ""
    description: str = ""
    # Add any other fields that might be in your ground objects

class Witness(BaseModel):
    name: str = ""
    testimony: str = ""
    # Add any other fields that might be in your witness objects

class PhysicalDigitalEvidence(BaseModel):
    title: str = ""
    description: str = ""
    # Add any other fields that might be in your physical/digital evidence objects

class Evidence(BaseModel):
    witnesses: List[Union[str, Dict, Witness]] = []
    physical_digital: List[Union[str, Dict, PhysicalDigitalEvidence]] = []

class Petitioner(BaseModel):
    name: str = ""
    details: str = ""
    address: str = ""

class Respondent(BaseModel):
    name: str = ""
    details: str = ""
    address: str = ""

# More flexible approach
class FormattedDetails(BaseModel):
    title: str = ""
    case_number: str = ""
    court: str = ""
    sections: List[str] = []
    petitioner: Petitioner = Petitioner()
    respondents: List[Respondent] = []
    petition_type: str = ""
    background: List[Any] = []
    grounds: List[Any] = []
    evidence: Dict[str, List[Any]] = {"witnesses": [], "physical_digital": []}
    prayers: List[str] = []
    verification: str = ""
    date_filed: Optional[str] = ""
    place_filed: str = ""
    advocate: str = ""