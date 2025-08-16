from fastapi import APIRouter, HTTPException
from fastapi import APIRouter, Depends, HTTPException
from app.services.llm.case_analysis import CaseAnalysisService
from app.models.case import Case, Roles
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

@router.post("/{caseId}/analyze-case")
async def analyze_case(caseId: str, current_user: User = Depends(get_current_user)):
    case = await Case.find_one(Case.cnr == caseId, Case.user_id == current_user.id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Find which role the user participated in by checking user_id
    user_role_in_case = None
    for arg in case.plaintiff_arguments:
        if arg.user_id and str(arg.user_id) == str(current_user.id):
            user_role_in_case = arg.role
            break
    if not user_role_in_case:
        for arg in case.defendant_arguments:
            if arg.user_id and str(arg.user_id) == str(current_user.id):
                user_role_in_case = arg.role
                break

    if not user_role_in_case:
        # If user hasn't submitted any arguments, check the user_role field in the case itself
        if case.user_role != Roles.NOT_STARTED:
            user_role_in_case = case.user_role
        else:
            raise HTTPException(status_code=400, detail="User role not determined for this case.")

    # Extract argument contents
    defendant_arguments = [arg.content for arg in case.defendant_arguments]
    plaintiff_arguments = [arg.content for arg in case.plaintiff_arguments]

    analysis_result = CaseAnalysisService.analyze_case(
        case_details=case.details,
        title=case.title,
        defendant_args=defendant_arguments,
        plaintiff_args=plaintiff_arguments,
        judges_verdict=case.verdict,
        user_role=user_role_in_case.value if user_role_in_case else None,
        ai_role=case.ai_role.value if case.ai_role else None
    )

    # The analysis result is already a string from CaseAnalysisService
    case.analysis = analysis_result
    await case.save()

    # Return the analysis string directly in the response object
    return {"analysis": case.analysis}
