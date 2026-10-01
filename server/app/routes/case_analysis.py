from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.dependencies import get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import Case, CaseOutcome, Roles
from app.models.user import User
from app.services.case_outcomes import ensure_outcome, user_role_in_case
from app.services.llm.case_analysis import CaseAnalysisService
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.locks import case_lock

logger = get_logger(__name__)

router = APIRouter()


def _newest_within_limit(lines: list[str]) -> str:
    kept, size = [], 0
    for line in reversed(lines):
        # ponytail: per-section cap so a huge case can't overflow the model
        if size + len(line) + 1 > settings.analysis_section_limit:
            kept.append("(earlier entries omitted for length)")
            break
        kept.append(line)
        size += len(line) + 1
    return "\n".join(reversed(kept))


def format_party_conferences(case: Case) -> str:
    """Every private chat between the user and a party, labelled by speaker."""
    lines: list[str] = []
    for party_id, messages in case.party_chats.items():
        if not messages:
            continue
        party = case.get_party(party_id)
        name = party.name if party else "Party"
        lines.append(f"-- Conference with {name} --")
        for message in messages:
            speaker = "User" if message.get("sender") == "user" else name
            lines.append(f"{speaker}: {message.get('content', '')}")
    return _newest_within_limit(lines)


def format_witness_examinations(case: Case, user_role: str | None) -> str:
    """Every witness examination, with each question marked as the user's or not."""
    lines: list[str] = []
    for testimony in case.witness_testimonies:
        if not testimony.examination:
            continue
        caller = "the user" if testimony.called_by == user_role else "opposing counsel"
        lines.append(f"-- {testimony.witness_name} (called by {caller}) --")
        for exam in testimony.examination:
            asker = "User" if exam.examiner == user_role else "Opposing counsel"
            lines.append(f"{asker} asked: {exam.question}")
            lines.append(f"{testimony.witness_name}: {exam.answer}")
    return _newest_within_limit(lines)


@router.post("/{caseId}/analyze-case")
async def analyze_case(caseId: str, current_user: User = Depends(get_current_user)):
    logger.info(
        "Case analysis requested",
        extra={"case_id": caseId, "user_id": str(current_user.id)},
    )

    case = await get_owned_case(caseId, current_user)

    # The analysis is generated once; later requests get the saved copy.
    if case.analysis:
        return {"analysis": case.analysis, "outcome": case.outcome}

    role = user_role_in_case(case)
    if not role:
        logger.warning("User role not determined", extra={"case_id": caseId})
        raise HTTPException(
            status_code=400, detail="User role not determined for this case."
        )

    logger.debug(
        "User role determined",
        extra={"case_id": caseId, "user_role": role.value},
    )

    # Normally decided in the background right after the verdict; this retries
    # it if that failed. Must run outside case_lock (it takes the lock itself).
    outcome = await ensure_outcome(case)

    async with case_lock(case.cnr):
        case = await Case.get(case.id) or case
        if case.analysis:  # another request generated it while we waited
            return {"analysis": case.analysis, "outcome": case.outcome}
        return await _generate_analysis(case, role, outcome)


async def _generate_analysis(
    case: Case, user_role: Roles, outcome: CaseOutcome | None
) -> dict:
    caseId = case.cnr
    defendant_arguments = [arg.content for arg in case.defendant_arguments]
    plaintiff_arguments = [arg.content for arg in case.plaintiff_arguments]

    try:
        logger.info(
            "Generating case analysis via LLM",
            extra={
                "case_id": caseId,
                "defendant_args_count": len(defendant_arguments),
                "plaintiff_args_count": len(plaintiff_arguments),
            },
        )
        analysis_result = await CaseAnalysisService.analyze_case(
            case_details=case.details,
            title=case.title,
            defendant_args=defendant_arguments,
            plaintiff_args=plaintiff_arguments,
            judges_verdict=case.verdict,
            user_role=user_role.value,
            ai_role=case.ai_role.value if case.ai_role else None,
            outcome=outcome.value if outcome else None,
            party_conferences=format_party_conferences(case),
            witness_examinations=format_witness_examinations(case, user_role.value),
            rag_context=await retrieve_case_context(
                case,
                "case analysis verdict argument mistakes suggestions evidence facts",
                source_types=[
                    "case_details",
                    "evidence",
                    "argument",
                    "proceeding",
                    "witness_testimony",
                    "verdict",
                    "party_chat",
                ],
                always_rag=True,  # analysis reviews the whole case
            ),
        )
    except Exception as e:
        logger.exception("Error generating case analysis", extra={"case_id": caseId})
        raise HTTPException(status_code=500, detail="Error generating analysis.") from e

    case.analysis = analysis_result
    case.analyzed_at = get_current_datetime()
    try:
        await case.save()
        await upsert_memory_item(
            case,
            "analysis",
            "analysis",
            case.analysis or "",
            {"title": case.title},
        )
        logger.info("Case analysis saved successfully", extra={"case_id": caseId})
    except Exception:
        logger.exception("Error saving case analysis", extra={"case_id": caseId})
        raise HTTPException(
            status_code=500, detail="Failed to save analysis. Please try again."
        )

    return {"analysis": case.analysis, "outcome": case.outcome}
