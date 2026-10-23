# app/routes/settlement.py
"""Settling a case out of court: counsel negotiate a compromise, without prejudice.

The talks are indexed in case memory under their own source type, which only the
case analysis retrieves: the court deciding the merits never sees them.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints

from app import messages
from app.dependencies import controls_hearing, get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CaseOutcome,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    Roles,
    Settlement,
    SettlementEntry,
    SettlementProfile,
    SettlementStatus,
    SettlementTerms,
)
from app.models.user import User
from app.routes.arguments import check_floor_is_open
from app.routes.courtroom import record_lines, sides
from app.services.case_outcomes import record_settlement
from app.services.evidence_service import format_evidence_context
from app.services.llm import settlement as counsel
from app.services.llm.parties_service import can_lawyer_confer_with_party
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)

router = APIRouter()

MAX_OFFERS = 3  # the user's offers in one attempt
MAX_ATTEMPTS = 2  # attempts in one case


class OfferRequest(BaseModel):
    terms: SettlementTerms
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


def _utc(moment: datetime) -> datetime:
    # MongoDB hands datetimes back naive, in UTC.
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def user_is_accused(case: Case, profile: SettlementProfile) -> bool:
    return sides(case)[0] == profile.accused_side


def why_closed(case: Case) -> str | None:
    """Why the user can't negotiate now, or None."""
    if case.user_role == Roles.NOT_STARTED:
        return messages.SETTLEMENT_NEEDS_ROLE
    if case.status == CaseStatus.RESOLVED:
        return messages.SETTLEMENT_CASE_CLOSED
    if case.status == CaseStatus.ACTIVE:
        return messages.SETTLEMENT_COURT_SITTING
    if case.settlement_profile and case.settlement_profile.route == "none":
        return messages.SETTLEMENT_NO_ROUTE
    if any(s.status == SettlementStatus.REFUSED for s in case.settlements):
        return messages.SETTLEMENT_REFUSED
    return None


def why_no_new_attempt(case: Case) -> str | None:
    """Why talks can't be (re)opened now, or None. Once talks close, they can open again
    only after the court has sat once more."""
    if reason := why_closed(case):
        return reason
    if case.open_settlement():
        return None
    if len(case.settlements) >= MAX_ATTEMPTS:
        return messages.SETTLEMENT_ATTEMPTS_USED
    last = case.settlements[-1] if case.settlements else None
    if last and last.ended_at:
        ended = _utc(last.ended_at)
        sat = any(
            e.type == CourtroomProceedingsEventType.SYSTEM_MESSAGE
            and e.content == "Court is in session"
            and e.timestamp
            and _utc(e.timestamp) > ended
            for e in case.courtroom_proceedings
        )
        if not sat:
            return messages.SETTLEMENT_AFTER_HEARING
    return None


def check(reason: str | None) -> None:
    if reason:
        code = 400 if reason == messages.SETTLEMENT_NEEDS_ROLE else 409
        raise HTTPException(status_code=code, detail=reason)


async def profile_of(case: Case) -> SettlementProfile:
    """The case's settlement route, worked out from the case file once."""
    if case.settlement_profile is None:
        try:
            case.settlement_profile = await counsel.assess_settlement(
                case.title, case.details
            )
        except Exception:
            logger.exception(f"Settlement route failed for case {case.cnr}")
            raise HTTPException(
                status_code=500, detail=messages.SETTLEMENT_ROUTE_FAILED
            )
        await case.save()
        logger.info(f"Settlement route for {case.cnr}: {case.settlement_profile.route}")
    return case.settlement_profile


def view(case: Case) -> dict:
    """What the settlement desk shows: the route, the latest attempt, and what is allowed."""
    attempt = case.settlements[-1] if case.settlements else None
    return {
        "profile": case.settlement_profile
        and case.settlement_profile.model_dump(mode="json"),
        "attempt": attempt and attempt.model_dump(mode="json"),
        "attempts": len(case.settlements),
        "closed": why_closed(case),
        "can_start": why_no_new_attempt(case) is None
        and case.open_settlement() is None,
        "start_blocked": None if case.open_settlement() else why_no_new_attempt(case),
        "max_offers": MAX_OFFERS,
    }


def open_attempt(case: Case) -> Settlement:
    attempt = case.open_settlement()
    if attempt is None:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NONE_OPEN)
    return attempt


def entry_memory(case: Case, attempt: Settlement, entry: SettlementEntry) -> tuple:
    """(source_type, source_id, content, metadata) for one move across the table."""
    profile = case.settlement_profile
    who = "The user" if entry.by == "user" else "AI counsel"
    number = len(case.settlements)  # the attempt is always the latest
    text = counsel.entry_text(entry, who, profile.conditions if profile else [])
    return (
        "settlement",
        entry.id,
        f"Settlement attempt {number}. {text}",
        {
            "by": entry.by,
            "kind": entry.kind,
            "attempt": number,
            "round": next(i for i, e in enumerate(attempt.entries, 1) if e is entry),
            "amount": entry.terms.amount if entry.terms else None,
        },
    )


async def save_and_index(
    case: Case, attempt: Settlement, entries: list[SettlementEntry]
) -> dict:
    await case.save()
    for entry in entries:
        await upsert_memory_item(case, *entry_memory(case, attempt, entry))
    return view(case)


def clients_of(case: Case, ai_side: str) -> str:
    """The parties AI counsel acts for, with what is known about them."""
    return "\n".join(
        f"- {p.name}: {p.bio or p.occupation or 'no details on record'}"
        for p in case.parties_involved
        if can_lawyer_confer_with_party(ai_side, p.role)
    )


async def ai_counsel(
    case: Case, attempt: Settlement, offer: SettlementTerms | None, note: str = ""
) -> counsel.OfferReply:
    """AI counsel's answer to the user's terms, or its opening offer."""
    profile = case.settlement_profile
    assert profile is not None
    _, ai_side = sides(case)
    accused = user_is_accused(case, profile)
    try:
        case_context = await retrieve_case_context(
            case,
            f"{ai_side} settlement compromise compensation strength of case evidence",
            source_types=[
                "case_details",
                "evidence",
                "party_bio",
                "ai_party_chat",
                "argument",
                "proceeding",
                "witness_testimony",
            ],
        )
        return await counsel.respond_to_offer(
            ai_side=ai_side,
            acts_for="the complainants" if accused else "the accused",
            opposite="the accused" if accused else "the complainants",
            profile=profile,
            case_context=case_context or case.details[:6000],
            clients=clients_of(case, ai_side),
            evidence_context=format_evidence_context(case.evidence),
            record=record_lines(case),
            negotiation=counsel.format_negotiation(
                case.settlements,
                {"user": "Opposing counsel", "ai": "You"},
                profile.conditions,
            ),
            offer=offer,
            note=note,
            offers_left=MAX_OFFERS - attempt.user_offers() - (offer is not None),
        )
    except Exception:
        logger.exception(f"Settlement reply failed for case {case.cnr}")
        raise HTTPException(status_code=500, detail=messages.SETTLEMENT_FAILED)


@router.get("/{case_cnr}/settlement")
async def get_settlement(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """The settlement desk: the route (worked out on the first visit) and the talks."""
    case = await get_owned_case(case_cnr, current_user)
    await profile_of(case)
    return view(case)


@router.post("/{case_cnr}/settlement/start", dependencies=[controls_hearing])
async def start_talks(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Open talks. The accused makes the first offer, so when the user acts for the
    complainants, AI counsel opens with its client's terms."""
    case = await get_owned_case(case_cnr, current_user)
    profile = await profile_of(case)
    if case.open_settlement():
        return view(case)
    check(why_no_new_attempt(case))
    attempt = Settlement()
    entries = []
    if not user_is_accused(case, profile):
        reply = await ai_counsel(case, attempt, None)
        terms = reply.terms or counsel.snap_terms(
            {"amount": profile.claim, "instalments": 6, "months": 12}, set()
        )
        entries.append(
            SettlementEntry(by="ai", kind="offer", terms=terms, note=reply.message)
        )
        attempt.entries = entries
    case.settlements.append(attempt)
    logger.info(f"Settlement talks opened in {case_cnr}")
    return await save_and_index(case, attempt, entries)


@router.post("/{case_cnr}/settlement/offers", dependencies=[controls_hearing])
async def make_offer(
    case_cnr: str,
    request: OfferRequest,
    current_user: User = Depends(get_current_user),
):
    """Put terms to the other side; AI counsel accepts, counters or refuses them.
    Terms equal to the other side's last offer accept it."""
    case = await get_owned_case(case_cnr, current_user)
    profile = await profile_of(case)
    check(why_closed(case))
    attempt = case.open_settlement()
    if attempt is None:
        check(why_no_new_attempt(case))
        attempt = Settlement()
        case.settlements.append(attempt)  # only saved if AI counsel answers
    elif attempt.status == SettlementStatus.AGREED:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_AGREED)
    if attempt.user_offers() >= MAX_OFFERS:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_OFFERS_USED)
    keys = {c.key for c in profile.conditions}
    if any(k not in keys for k in request.terms.conditions):
        raise HTTPException(status_code=422, detail=messages.SETTLEMENT_BAD_CONDITION)

    terms = request.terms.model_copy(
        update={"conditions": [k for k in dict.fromkeys(request.terms.conditions)]}
    )
    theirs = attempt.last_terms("ai")
    if theirs and _same(theirs, terms):
        return await accept_terms(case, attempt, theirs)

    reply = await ai_counsel(case, attempt, terms, request.note)
    mine = SettlementEntry(
        by="user",
        kind="counter" if attempt.entries else "offer",
        terms=terms,
        note=request.note,
    )
    attempt.entries.append(mine)
    changed = [mine]
    if reply.decision == "accept" or (reply.terms and _same(reply.terms, terms)):
        answer = SettlementEntry(by="ai", kind="accept", note=reply.message)
        attempt.status = SettlementStatus.AGREED
        attempt.agreed = terms
    elif reply.decision == "counter":
        answer = SettlementEntry(
            by="ai", kind="counter", terms=reply.terms, note=reply.message
        )
    else:
        answer = SettlementEntry(by="ai", kind="refuse", note=reply.message)
        attempt.status = SettlementStatus.REJECTED
        attempt.ended_at = get_current_datetime()
    attempt.entries.append(answer)
    changed.append(answer)

    logger.info(f"Settlement offer in {case_cnr}: AI counsel replied {answer.kind}")
    return await save_and_index(case, attempt, changed)


def _same(a: SettlementTerms, b: SettlementTerms) -> bool:
    return a.model_dump() | {"conditions": sorted(a.conditions)} == b.model_dump() | {
        "conditions": sorted(b.conditions)
    }


async def accept_terms(case: Case, attempt: Settlement, terms: SettlementTerms) -> dict:
    entry = SettlementEntry(by="user", kind="accept")
    attempt.entries.append(entry)
    attempt.status = SettlementStatus.AGREED
    attempt.agreed = terms
    logger.info(f"Settlement terms agreed in {case.cnr}")
    return await save_and_index(case, attempt, [entry])


@router.post("/{case_cnr}/settlement/accept", dependencies=[controls_hearing])
async def accept_their_terms(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Accept the terms AI counsel last put forward."""
    case = await get_owned_case(case_cnr, current_user)
    check(why_closed(case))
    attempt = open_attempt(case)
    theirs = attempt.last_terms("ai")
    last = attempt.entries[-1] if attempt.entries else None
    if (
        attempt.status != SettlementStatus.NEGOTIATING
        or theirs is None
        or last is None
        or last.by != "ai"
    ):
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NO_COUNTER)
    return await accept_terms(case, attempt, theirs)


@router.post("/{case_cnr}/settlement/end", dependencies=[controls_hearing])
async def end_talks(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Call off the talks, or agreed terms not yet before the court."""
    case = await get_owned_case(case_cnr, current_user)
    check(why_closed(case))
    attempt = open_attempt(case)
    entry = SettlementEntry(by="user", kind="ended")
    attempt.entries.append(entry)
    attempt.status = SettlementStatus.WITHDRAWN
    attempt.ended_at = get_current_datetime()
    logger.info(f"Settlement talks ended in {case_cnr}")
    return await save_and_index(case, attempt, [entry])


@router.post("/{case_cnr}/settlement/present", dependencies=[controls_hearing])
async def present_compromise(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Put the agreed terms before the court, which records the compromise (the
    case ends, settled) or refuses it (the case goes on to be heard on merits)."""
    case = await get_owned_case(case_cnr, current_user)
    if case.status == CaseStatus.RESOLVED:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_CASE_CLOSED)
    attempt = open_attempt(case)
    if attempt.status != SettlementStatus.AGREED or attempt.agreed is None:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NOT_AGREED)
    if case.status == CaseStatus.ACTIVE:
        check_floor_is_open(case)
    profile = case.settlement_profile
    terms = counsel.terms_text(attempt.agreed, profile.conditions if profile else [])

    try:
        case_context = await retrieve_case_context(
            case,
            "compromise compoundable offences quashing bail facts sections charges",
            source_types=["case_details", "evidence", "proceeding"],
        )
        ruling = await counsel.review_compromise(
            title=case.title,
            case_context=case_context or case.details[:6000],
            record=record_lines(case),
            terms=terms,
        )
    except Exception:
        logger.exception(f"Compromise review failed for case {case_cnr}")
        raise HTTPException(status_code=500, detail=messages.SETTLEMENT_REVIEW_FAILED)

    attempt.ruling = ruling.ruling
    attempt.court_order = ruling.order
    attempt.ended_at = get_current_datetime()
    case.log("Compromise placed before the court")
    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.SETTLEMENT,
            content=ruling.ruling,
            speaker_role="judge",
            speaker_name="Judge",
        )
    )
    if ruling.accepted:
        attempt.status = SettlementStatus.RECORDED
        case.verdict = ruling.order
        case.outcome = CaseOutcome.SETTLED
        case.outcome_reason = ruling.ruling
        case.status = CaseStatus.RESOLVED
        case.active_session_id = None
        case.active_session_expires_at = None
        case.log("Case disposed of on compromise")
    else:
        attempt.status = SettlementStatus.REFUSED

    await case.save()
    await upsert_memory_item(
        case,
        "settlement",
        attempt.id,
        f"The court on the compromise ({attempt.status.value}): {ruling.ruling}",
        {"status": attempt.status.value},
    )
    if ruling.accepted:
        await upsert_memory_item(
            case, "verdict", "verdict", ruling.order, {"title": case.title}
        )
        await record_settlement(case, ruling.ruling)
    logger.info(f"Compromise in {case_cnr}: {attempt.status.value}")
    return view(case)
