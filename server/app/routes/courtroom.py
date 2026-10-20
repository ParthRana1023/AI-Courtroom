# app/routes/courtroom.py
"""Objections to the other side's arguments and questions, and reports of bad AI responses."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import messages
from app.dependencies import controls_hearing, get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    Objection,
    Roles,
)
from app.models.report import Report, ReportReason
from app.models.user import User
from app.services.llm import judge, lawyer
from app.services.rag import upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.llm import LLMGenerationError, pick_case_context

logger = get_logger(__name__)

router = APIRouter()

AI_SPEAKER = {"plaintiff": "Plaintiff Lawyer", "defendant": "Defense Lawyer"}
E = CourtroomProceedingsEventType
GROUNDS = {
    "question": [
        "Leading question",
        "Hearsay",
        "Speculation",
        "Asked and answered",
        "Irrelevant",
    ],
    "argument": [
        "Facts not in evidence",
        "Misstates the evidence",
        "Argumentative",
        "Irrelevant",
    ],
    "leave": [
        "Irrelevant to the charge",
        "Not on the witness list",
        "Repetitive evidence",
        "Unfair surprise",
    ],
}
ARGUMENTS = {
    E.ARGUMENT,
    E.AI_ARGUMENT,
    E.OPENING_STATEMENT,
    E.CLOSING_STATEMENT,
}
# Once one of these follows an entry, the hearing has moved on from it.
MOVES_ON = ARGUMENTS | {E.WITNESS_EXAMINED_Q}
LEADING_IN_CROSS = "Overruled. Leading questions are permitted in cross-examination."


class ObjectionRequest(BaseModel):
    target_id: str
    grounds: str
    details: str = Field("", max_length=500)


class HoldRequest(BaseModel):
    on: bool


class ReportRequest(BaseModel):
    entry_id: str
    reason: ReportReason
    details: str = Field("", max_length=500)


def sides(case: Case) -> tuple[str, str]:
    """(user's side, AI's side)."""
    user = case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    return user, "defendant" if user == "plaintiff" else "plaintiff"


def record_lines(case: Case, limit: int = 24) -> str:
    """The latest spoken lines of the hearing, for the judge."""
    lines = [
        f"{(e.speaker_name or e.speaker_role or 'Court')}: {e.content}"
        for e in case.courtroom_proceedings
        if e.content and e.type != E.SYSTEM_MESSAGE
    ]
    return "\n".join(lines[-limit:])


def objection_kind(case: Case, event: CourtroomProceedingsEvent) -> str | None:
    """ "argument", "question" or "leave" if the user may object to this entry, else None."""
    _, ai = sides(case)
    if event.speaker_role != ai:
        return None
    if event.type in ARGUMENTS:
        return "argument"
    if event.type == E.WITNESS_EXAMINED_Q:
        return "question"
    if event.type == E.LEAVE_REQUEST:
        return "leave"
    return None


def objection_events(
    side: str,
    speaker_name: str,
    target_id: str,
    grounds: str,
    details: str,
    sustained: bool,
    ruling: str,
) -> list[CourtroomProceedingsEvent]:
    """The objection as raised by counsel for ``side``, and the court's ruling on it."""
    text = f"Objection. {grounds}." + (f" {details}" if details else "")
    now = get_current_datetime()
    return [
        CourtroomProceedingsEvent(
            type=E.OBJECTION,
            timestamp=now,
            content=text,
            speaker_role=side,
            speaker_name=speaker_name,
            objection=Objection(target_id=target_id, grounds=grounds, details=details),
        ),
        CourtroomProceedingsEvent(
            type=E.RULING,
            timestamp=now,
            content=ruling,
            speaker_role="judge",
            speaker_name="The Court",
            sustained=sustained,
        ),
    ]


def in_cross(case: Case, question: CourtroomProceedingsEvent) -> bool:
    """Whether the question was put in cross-examination (the witness was called by the other side)."""
    testimony = next(
        (
            t
            for t in reversed(case.witness_testimonies)
            if t.witness_id == question.witness_id
        ),
        None,
    )
    return testimony is not None and testimony.called_by != question.speaker_role


async def rule(
    case: Case,
    kind: str,
    target: CourtroomProceedingsEvent,
    grounds: str,
    details: str,
    objector: str,
) -> tuple[bool, str]:
    """The judge's ruling. Leading questions are fair in cross, so that needs no judge."""
    if kind == "question" and grounds == "Leading question" and in_cross(case, target):
        return False, LEADING_IN_CROSS
    return await judge.rule_on_objection(
        kind=kind,
        grounds=grounds,
        details=details,
        target_text=target.content or "",
        objector_role=objector,
        case_context=pick_case_context(None, case.details),
        record=record_lines(case),
    )


def ai_grounds(case: Case, kind: str, target: CourtroomProceedingsEvent) -> list[str]:
    """The grounds AI counsel may object on: never a leading question in cross."""
    if kind == "question" and in_cross(case, target):
        return [g for g in GROUNDS[kind] if g != "Leading question"]
    return GROUNDS[kind]


async def ai_may_object(
    case: Case, kind: str, target: CourtroomProceedingsEvent
) -> tuple[str, str] | None:
    """AI counsel's (grounds, details) if it objects to the user's argument or
    question. Runs alongside the reply, so it never adds to the wait."""
    _, ai = sides(case)
    return await lawyer.consider_objection(
        kind,
        target.content or "",
        ai_grounds(case, kind, target),
        ai,
        pick_case_context(None, case.details),
        record_lines(case),
    )


def ruling_memory(
    objection: CourtroomProceedingsEvent, ruling: CourtroomProceedingsEvent
) -> tuple:
    """An objection and the court's ruling, as a (source_type, source_id, content, metadata) memory item."""
    return (
        "proceeding",
        ruling.id,
        f"{objection.content}\n{ruling.content}",
        {"event_type": E.RULING.value, "speaker_role": "judge"},
    )


async def ai_objection_ruling(
    case: Case,
    kind: str,
    target: CourtroomProceedingsEvent,
    grounds: str,
    details: str,
) -> dict | None:
    """Rule on AI counsel's objection to the user's argument or question and put it
    on the record; the caller saves the case. None if the court couldn't rule."""
    _, ai = sides(case)
    try:
        sustained, ruling = await rule(case, kind, target, grounds, details, ai)
    except LLMGenerationError:
        logger.exception(f"Ruling on AI counsel's objection failed in {case.cnr}")
        return None
    if sustained:
        target.struck = "withdrawn" if kind == "question" else "struck"
    case.courtroom_proceedings.extend(
        objection_events(
            ai, AI_SPEAKER[ai], target.id, grounds, details, sustained, ruling
        )
    )
    logger.info(f"AI objection in {case.cnr}: {grounds}, sustained={sustained}")
    return {"grounds": grounds, "sustained": sustained, "ruling": ruling}


def check_grounds(kind: str, grounds: str) -> None:
    if grounds not in GROUNDS[kind]:
        raise HTTPException(
            status_code=400,
            detail=f"Choose one of these grounds: {', '.join(GROUNDS[kind])}.",
        )


@router.post("/{case_cnr}/objections", dependencies=[controls_hearing])
async def raise_objection(
    case_cnr: str,
    request: ObjectionRequest,
    current_user: User = Depends(get_current_user),
):
    """Object to the other side's latest argument or question; the judge rules at once."""
    case = await get_owned_case(case_cnr, current_user)
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.COURT_NOT_IN_SESSION)

    found = next(
        (
            (i, e)
            for i, e in enumerate(case.courtroom_proceedings)
            if e.id == request.target_id
        ),
        None,
    )
    if found is None:
        raise HTTPException(status_code=404, detail="That entry is not in the record.")
    index, target = found
    kind = objection_kind(case, target)
    if kind is None:
        raise HTTPException(
            status_code=400,
            detail="You can only object to the other side's arguments and questions.",
        )
    if kind == "leave":
        raise HTTPException(
            status_code=400,
            detail="Answer a request to call a witness from the request itself.",
        )
    check_grounds(kind, request.grounds)
    if any(
        e.objection and e.objection.target_id == target.id
        for e in case.courtroom_proceedings
    ):
        raise HTTPException(
            status_code=409, detail="You have already objected to this."
        )
    if any(e.type in MOVES_ON for e in case.courtroom_proceedings[index + 1 :]):
        raise HTTPException(
            status_code=409, detail="Too late to object: the hearing has moved on."
        )

    details = request.details.strip()

    def this_case():
        return Case.find_one(Case.cnr == case_cnr)

    # The AI's examination holds its next answer or question until the ruling.
    await this_case().update_one(
        {"$set": {"objection_pending_at": get_current_datetime()}}
    )
    try:
        user_side, _ = sides(case)
        sustained, ruling = await rule(
            case, kind, target, request.grounds, details, user_side
        )

        # Atomic, so a witness answer the AI's examination adds meanwhile is kept.
        record = (await this_case() or case).courtroom_proceedings
        struck: dict = {}
        if sustained:
            struck[f"courtroom_proceedings.{index}.struck"] = (
                "withdrawn" if kind == "question" else "struck"
            )
            answer = next(
                (
                    i
                    for i, e in enumerate(record)
                    if i > index
                    and e.type == E.WITNESS_EXAMINED_A
                    and e.witness_id == target.witness_id
                ),
                None,
            )
            if kind == "question" and answer is not None:
                struck[f"courtroom_proceedings.{answer}.struck"] = "struck"
        events = objection_events(
            user_side,
            f"{current_user.first_name} {current_user.last_name}",
            target.id,
            request.grounds,
            details,
            sustained,
            ruling,
        )
        # Two writes: MongoDB refuses $set on an element and $push to the same array at once.
        # Each is atomic, and appending never shifts the indexes struck here.
        if struck:
            await this_case().update_one({"$set": struck})
        await this_case().update_one(
            {"$push": {"courtroom_proceedings": {"$each": events}}}
        )
    finally:
        await this_case().update_one({"$set": {"objection_pending_at": None}})
    await upsert_memory_item(case, *ruling_memory(*events))
    logger.info(f"Objection in {case_cnr}: {request.grounds}, sustained={sustained}")
    return {"sustained": sustained, "ruling": ruling}


@router.post("/{case_cnr}/objections/hold", dependencies=[controls_hearing])
async def hold_for_objection(
    case_cnr: str,
    request: HoldRequest,
    current_user: User = Depends(get_current_user),
):
    """The user started (on) or withdrew (off) an objection. The AI's examination
    waits meanwhile, so the hearing doesn't move on while they choose grounds."""
    case = await get_owned_case(case_cnr, current_user)
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.COURT_NOT_IN_SESSION)
    held_at = get_current_datetime() if request.on else None
    await Case.find_one(Case.cnr == case_cnr).update_one(
        {"$set": {"objection_pending_at": held_at}}
    )
    return {"held": request.on}


def reportable_text(case: Case, entry_id: str) -> str | None:
    """The text of an AI-made entry (or the verdict), else None."""
    if entry_id == "verdict":
        return case.verdict
    _, ai = sides(case)
    event = next((e for e in case.courtroom_proceedings if e.id == entry_id), None)
    if event is None:
        return None
    ai_made = event.type in (E.WITNESS_EXAMINED_A, E.RULING) or (
        event.speaker_role == ai and event.type in MOVES_ON | {E.LEAVE_REQUEST}
    )
    return event.content if ai_made else None


@router.post("/{case_cnr}/reports")
async def report_response(
    case_cnr: str,
    request: ReportRequest,
    current_user: User = Depends(get_current_user),
):
    """Report an AI response to the maker. The hearing isn't affected."""
    case = await get_owned_case(case_cnr, current_user)
    excerpt = reportable_text(case, request.entry_id)
    if excerpt is None:
        raise HTTPException(
            status_code=400, detail="Only AI responses can be reported."
        )
    details = request.details.strip()
    if request.reason == "other" and not details:
        raise HTTPException(
            status_code=400, detail="Add a few words about what went wrong."
        )
    existing = await Report.find_one(
        Report.user_id == current_user.id,
        Report.cnr == case_cnr,
        Report.entry_id == request.entry_id,
    )
    if existing is None:
        await Report(
            user_id=current_user.id,
            cnr=case_cnr,
            entry_id=request.entry_id,
            reason=request.reason,
            details=details,
            excerpt=excerpt[:4000],
        ).insert()
        logger.info(f"AI response reported in {case_cnr}: {request.reason}")
    return {"reported": True}
