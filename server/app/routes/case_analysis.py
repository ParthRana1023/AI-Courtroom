from fastapi import APIRouter, HTTPException
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.case_analysis import CaseAnalysisResponse
from app.services.llm.case_analysis import CaseAnalysisService
from app.models.case import Case
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

@router.post("/{caseId}/analyze-case", response_model=CaseAnalysisResponse)
async def analyze_case(caseId: str, current_user: User = Depends(get_current_user)):
    case = await Case.find_one(Case.cnr == caseId, Case.user_id == current_user.id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    user_args = [arg.content for arg in case.plaintiff_arguments if arg.type == "user"]
    counter_args = [arg.content for arg in case.defendant_arguments if arg.type == "user"]

    analysis_result = CaseAnalysisService.analyze_case(
        case_details=case.details,
        title=case.title,
        user_args=user_args,
        counter_args=counter_args,
        judges_verdict=case.verdict
    )

    case.analysis = analysis_result
    await case.save()

    return CaseAnalysisResponse(**analysis_result)
