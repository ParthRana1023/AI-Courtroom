from pydantic import BaseModel
from typing import List
from pydantic import BaseModel

class CaseAnalysisResponse(BaseModel):
    mistakes: List[str]
    suggestions: List[str]
    outcome: str
    reasoning: str
