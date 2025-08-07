from pydantic import BaseModel
from typing import List
from pydantic import BaseModel

class CaseAnalysisResponse(BaseModel):
    outcome: str
    reasoning: str
    mistakes: List[str]
    suggestions: List[str]
