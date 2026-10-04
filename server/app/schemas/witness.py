# app/schemas/witness.py
"""
Pydantic schemas for witness examination API requests/responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class CallWitnessRequest(BaseModel):
    """Request to call a witness to the stand"""

    witness_id: str = Field(..., description="ID of the party to call as witness")


class ExamineWitnessRequest(BaseModel):
    """Request to examine a witness with a question"""

    question: str = Field(
        ..., min_length=1, max_length=2000, description="Question to ask the witness"
    )


class ExaminationItemResponse(BaseModel):
    """A single Q&A exchange in witness examination"""

    id: str
    examiner: str  # 'plaintiff', 'defendant', or 'judge'
    question: str
    answer: str
    objection: str | None = None
    objection_ruling: str | None = None
    timestamp: datetime
    phase: str | None = None  # chief, cross or re_exam


class WitnessExaminationResponse(BaseModel):
    """Response after asking a witness a question"""

    witness_id: str
    witness_name: str
    question: str
    answer: str
    examination_id: str
    timestamp: datetime
    ai_followup: str | None = None  # If AI lawyer wants to follow up


class CurrentWitnessResponse(BaseModel):
    """Current witness examination state"""

    has_witness: bool
    witness_id: str | None = None
    witness_name: str | None = None
    witness_role: str | None = None
    called_by: str | None = None
    examination_history: list[ExaminationItemResponse] = []
    is_ai_examining: bool = False
    phase: str | None = None  # chief, cross or re_exam
    next_examiner: str | None = None  # plaintiff or defendant: whose turn it is


class WitnessInfo(BaseModel):
    """Basic witness info for listing"""

    id: str
    name: str
    role: str
    has_testified: bool


class AvailableWitnessesResponse(BaseModel):
    """List of available witnesses"""

    witnesses: list[WitnessInfo]
    current_witness_id: str | None = None


class WitnessTestimonyResponse(BaseModel):
    """Complete testimony from a witness"""

    id: str
    witness_id: str
    witness_name: str
    called_by: str
    examination: list[ExaminationItemResponse]
    started_at: datetime
    ended_at: datetime | None = None


class AllTestimoniesResponse(BaseModel):
    """All witness testimonies in a case"""

    testimonies: list[WitnessTestimonyResponse]


class CallWitnessResponse(BaseModel):
    """Response after calling a witness"""

    success: bool
    witness_id: str
    witness_name: str
    witness_role: str
    message: str


class AICrossExaminationItem(BaseModel):
    """A single Q&A from AI cross-examination"""

    question: str
    answer: str
    question_number: int


class AICrossExaminationResponse(BaseModel):
    """Response after AI completes cross-examination"""

    witness_id: str
    witness_name: str
    examinations: list[AICrossExaminationItem]
    total_questions: int
    state: str = (
        "awaiting_user_choice"  # user_questioning, ai_cross_examining, awaiting_user_choice
    )


class ConcludeWitnessResponse(BaseModel):
    """Response after concluding witness examination"""

    success: bool
    witness_id: str
    witness_name: str
    total_questions_asked: int
    message: str
