from pydantic import BaseModel, Field
from typing import Optional


class EvidenceCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    evidence_type: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=1)
    source: Optional[str] = None
    image_prompt: Optional[str] = None


class EvidenceExtractRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source: Optional[str] = None


class EvidenceGenerationSummary(BaseModel):
    limit: int
    already_generated: int
    attempted: int = 0
    generated: int = 0
    failed: int = 0
    skipped: int = 0
    message: str = ""
