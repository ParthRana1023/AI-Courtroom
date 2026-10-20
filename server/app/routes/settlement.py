# app/routes/settlement.py
"""Settling a case out of court: counsel negotiate a compromise, without prejudice.

The talks are indexed in case memory under their own source type, which only the
case analysis retrieves: the court deciding the merits never sees them.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints

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
    SettlementOffer,
    SettlementStatus,
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
    terms: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=20, max_length=2000)
    ]
    compensation: int | None = Field(None, ge=0, le=10_000_000_000)


def check_can_negotiate(case: Case) -> None:
    """Talks happen out of court, on a live case, with the user's side chosen."""
    if case.user_role == Roles.NOT_STARTED:
        raise HTTPException(status_code=400, detail=messages.SETTLEMENT_NEEDS_ROLE)
    if case.status == CaseStatus.RESOLVED:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_CASE_CLOSED)
    if case.status == CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_COURT_SITTING)
    if any(s.status == SettlementStatus.REFUSED for s in case.settlements):
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_REFUSED)


def open_attempt(case: Case) -> Settlement:
    attempt = case.open_settlement()
    if attempt is None:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NONE_OPEN)
    return attempt


def settlement_memory(case: Case, attempt: Settlement, offer: SettlementOffer) -> tuple:
    """(source_type, source_id, content, metadata) for one offer and its answer."""
    user_side, _ = sides(case)
    who = {
        side: f"{side.capitalize()}'s counsel"
        + (" (the user)" if side == user_side else " (AI counsel)")
        for side in ("plaintiff", "defendant")
    }
    number = len(case.settlements)  # the attempt is always the latest
    content = (
        f"Settlement attempt {number}. {who[offer.side.value]} offered: "
        f"{counsel.offer_text(offer)}"
    )
    if offer.response:
        content += f" Answer: {offer.response}."
        if offer.reply:
            content += f" {offer.reply}"
    return (
        "settlement",
        offer.id,
        content,
        {
            "side": offer.side.value,
            "attempt": number,
            "round": next(i for i, o in enumerate(attempt.offers, 1) if o is offer),
            "compensation": offer.compensation,
            "response": offer.response,
        },
    )


async def save_and_index(
    case: Case, attempt: Settlement, offers: list[SettlementOffer]
) -> dict:
    await case.save()
    for offer in offers:
        await upsert_memory_item(case, *settlement_memory(case, attempt, offer))
    return attempt.model_dump(mode="json")


def clients_of(case: Case, ai_side: str) -> str:
    """The parties AI counsel acts for, with what is known about them."""
    return "\n".join(
        f"- {p.name}: {p.bio or p.occupation or 'no details on record'}"
        for p in case.parties_involved
        if can_lawyer_confer_with_party(ai_side, p.role)
    )


@router.post("/{case_cnr}/settlement/offers", dependencies=[controls_hearing])
async def make_offer(
    case_cnr: str,
    request: OfferRequest,
    current_user: User = Depends(get_current_user),
):
    """Put terms to the other side; AI counsel accepts, counters or rejects them."""
    case = await get_owned_case(case_cnr, current_user)
    check_can_negotiate(case)
    attempt = case.open_settlement()
    if attempt is None:
        if len(case.settlements) >= MAX_ATTEMPTS:
            raise HTTPException(
                status_code=409, detail=messages.SETTLEMENT_ATTEMPTS_USED
            )
        attempt = Settlement()
        case.settlements.append(attempt)  # only saved if AI counsel answers
    elif attempt.status == SettlementStatus.AGREED:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_AGREED)

    user_side, ai_side = sides(case)
    made = sum(o.side.value == user_side for o in attempt.offers)
    if made >= MAX_OFFERS:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_OFFERS_USED)

    offer = SettlementOffer(
        side=Roles(user_side), terms=request.terms, compensation=request.compensation
    )
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
        reply = await counsel.respond_to_offer(
            ai_role=ai_side,
            user_role=user_side,
            case_context=case_context or case.details[:6000],
            clients=clients_of(case, ai_side),
            evidence_context=format_evidence_context(case.evidence),
            record=record_lines(case),
            negotiation=counsel.format_negotiation(
                case.settlements, {user_side: "Opposing counsel", ai_side: "You"}
            ),
            offer=offer,
            offers_left=MAX_OFFERS - made - 1,
        )
    except Exception:
        logger.exception(f"Settlement reply failed for case {case_cnr}")
        raise HTTPException(status_code=500, detail=messages.SETTLEMENT_FAILED)

    # AI counsel's last counter, if any, is answered by this new offer.
    changed = [offer]
    if attempt.offers and attempt.offers[-1].response is None:
        attempt.offers[-1].response = "countered"
        changed.insert(0, attempt.offers[-1])
    offer.reply = reply.message
    attempt.offers.append(offer)
    if reply.decision == "accept":
        offer.response = "accepted"
        attempt.status = SettlementStatus.AGREED
    elif reply.decision == "counter":
        offer.response = "countered"
        counter = SettlementOffer(
            side=Roles(ai_side), terms=reply.terms, compensation=reply.compensation
        )
        attempt.offers.append(counter)
        changed.append(counter)
    else:
        offer.response = "rejected"
        attempt.status = SettlementStatus.REJECTED
        attempt.ended_at = get_current_datetime()

    logger.info(f"Settlement offer in {case_cnr}: AI counsel replied {reply.decision}")
    return await save_and_index(case, attempt, changed)


@router.post("/{case_cnr}/settlement/accept", dependencies=[controls_hearing])
async def accept_counter(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Accept the terms AI counsel last put forward."""
    case = await get_owned_case(case_cnr, current_user)
    check_can_negotiate(case)
    attempt = open_attempt(case)
    _, ai_side = sides(case)
    last = attempt.offers[-1] if attempt.offers else None
    if (
        attempt.status != SettlementStatus.NEGOTIATING
        or last is None
        or last.side.value != ai_side
        or last.response is not None
    ):
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NO_COUNTER)

    last.response = "accepted"
    attempt.status = SettlementStatus.AGREED
    logger.info(f"Settlement terms agreed in {case_cnr}")
    return await save_and_index(case, attempt, [last])


@router.post("/{case_cnr}/settlement/withdraw", dependencies=[controls_hearing])
async def withdraw(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Call off the talks, or agreed terms not yet before the court."""
    case = await get_owned_case(case_cnr, current_user)
    attempt = open_attempt(case)
    changed = []
    last = attempt.offers[-1] if attempt.offers else None
    if last is not None and last.response is None:
        last.response = "withdrawn"
        changed.append(last)
    attempt.status = SettlementStatus.WITHDRAWN
    attempt.ended_at = get_current_datetime()
    logger.info(f"Settlement withdrawn in {case_cnr}")
    return await save_and_index(case, attempt, changed)


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
    if attempt.status != SettlementStatus.AGREED:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NOT_AGREED)
    if case.status == CaseStatus.ACTIVE:
        check_floor_is_open(case)
    agreed = next(o for o in reversed(attempt.offers) if o.response == "accepted")

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
            terms=counsel.offer_text(agreed),
        )
    except Exception:
        logger.exception(f"Compromise review failed for case {case_cnr}")
        raise HTTPException(status_code=500, detail=messages.SETTLEMENT_REVIEW_FAILED)

    attempt.ruling = ruling.ruling
    attempt.court_order = ruling.order
    attempt.mode = ruling.mode
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
        {"status": attempt.status.value, "mode": ruling.mode and ruling.mode.value},
    )
    if ruling.accepted:
        await upsert_memory_item(
            case, "verdict", "verdict", ruling.order, {"title": case.title}
        )
        await record_settlement(case, ruling.ruling)
    logger.info(f"Compromise in {case_cnr}: {attempt.status.value}")
    return attempt.model_dump(mode="json")
