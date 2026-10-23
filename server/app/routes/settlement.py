# app/routes/settlement.py
"""Settling a case out of court: counsel negotiate a compromise, without prejudice.

The talks are indexed in case memory under their own source type, which only the
case analysis retrieves: the court deciding the merits never sees them.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, StringConstraints

from app import messages
from app.dependencies import (
    controls_hearing,
    get_current_user,
    get_owned_case,
    one_at_a_time,
)
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
    SettlementHearing,
    SettlementProfile,
    SettlementStatus,
    SettlementTerms,
)
from app.models.user import User
from app.routes.cases import ADJOURN_NOTES, start_recess
from app.routes.courtroom import record_lines, sides
from app.routes.parties import ensure_reliability
from app.services import settlement_payments as payments
from app.services import settlement_progress as progress
from app.services.case_outcomes import record_settlement
from app.services.evidence_service import format_evidence_context
from app.services.llm import settlement as counsel
from app.services.llm.parties_service import can_lawyer_confer_with_party
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.services.settlement_deed import case_numbers, hearing_after, owed_paragraph
from app.services.settlement_deed import deed as draw_up
from app.utils.datetime import get_current_datetime
from app.utils.llm_trace import is_developer

logger = get_logger(__name__)

router = APIRouter()

MAX_OFFERS = 3  # the user's offers in one attempt
MAX_ATTEMPTS = 2  # attempts in one case
COUNSEL = {
    "plaintiff": "Counsel for the Plaintiff",
    "defendant": "Counsel for the Defence",
}


class OfferRequest(BaseModel):
    terms: SettlementTerms
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


def _utc(moment: datetime) -> datetime:
    # MongoDB hands datetimes back naive, in UTC.
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def user_is_accused(case: Case, profile: SettlementProfile) -> bool:
    return sides(case)[0] == profile.accused_side


async def payer_reliability(case: Case, profile: SettlementProfile) -> float:
    """How reliably the accused pays, from their background: rated now if the
    background was written before it was asked for. Never fails the order."""
    name = profile.accused.casefold()
    exact = [p for p in case.parties_involved if p.name.casefold() == name]
    party = next(
        iter(exact),
        next(
            (
                p
                for p in case.parties_involved
                if p.name.casefold() in name or name in p.name.casefold()
            ),
            None,
        ),
    )
    reliability = None
    if party and name:
        try:
            reliability = await ensure_reliability(case, party)
        except Exception:
            logger.exception(f"No payment reliability for {party.name} in {case.cnr}")
    return payments.DEFAULT_RELIABILITY if reliability is None else reliability


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
    profile = case.settlement_profile
    return {
        "profile": profile and profile.model_dump(mode="json"),
        "attempt": attempt and attempt_out(case, attempt),
        "deed": (
            draw_up(case, profile, attempt.agreed)
            if profile and profile.route != "none" and attempt and attempt.agreed
            else None
        ),
        "attempts": len(case.settlements),
        "closed": why_closed(case),
        "can_start": why_no_new_attempt(case) is None
        and case.open_settlement() is None,
        "start_blocked": None if case.open_settlement() else why_no_new_attempt(case),
        "max_offers": MAX_OFFERS,
    }


def attempt_out(case: Case, attempt: Settlement) -> dict:
    """The attempt for the client: payments with their status as of today, and never
    the draws that decide them."""
    data = attempt.model_dump(mode="json", exclude={"defaults_on", "plan"})
    profile = case.settlement_profile
    user_pays = bool(profile and user_is_accused(case, profile))
    today = get_current_datetime().date()
    if attempt.plan:
        data |= payments.describe(attempt, today)
    else:
        for i, (p, out) in enumerate(
            zip(attempt.payments, data["payments"], strict=True)
        ):
            out["status"] = payments.status(p, i, user_pays, attempt.defaults_on, today)
        data["pace"] = "months"
    data["user_pays"] = user_pays
    return data


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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """The settlement desk: the route (worked out on the first visit), the talks and,
    once the court has given the compromise effect, the payments as of today."""
    case = await get_owned_case(case_cnr, current_user)
    await profile_of(case)
    await progress.catch_up_and_tell(case, background_tasks)
    return view(case)


@router.post("/{case_cnr}/settlement/start", dependencies=[one_at_a_time])
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


@router.post("/{case_cnr}/settlement/offers", dependencies=[one_at_a_time])
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
    elif attempt.status != SettlementStatus.NEGOTIATING:
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


@router.post("/{case_cnr}/settlement/accept", dependencies=[one_at_a_time])
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


@router.post("/{case_cnr}/settlement/end", dependencies=[one_at_a_time])
async def end_talks(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """Call off the talks, or agreed terms not yet filed."""
    case = await get_owned_case(case_cnr, current_user)
    check(why_closed(case))
    attempt = open_attempt(case)
    if attempt.status in (SettlementStatus.FILED, SettlementStatus.ADJOURNED):
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_FILED)
    entry = SettlementEntry(by="user", kind="ended")
    attempt.entries.append(entry)
    attempt.status = SettlementStatus.WITHDRAWN
    attempt.ended_at = get_current_datetime()
    logger.info(f"Settlement talks ended in {case_cnr}")
    return await save_and_index(case, attempt, [entry])


@router.post("/{case_cnr}/settlement/sign", dependencies=[one_at_a_time])
async def sign_deed(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """The user signs for their client; the other side, and on a plea bargain the
    prosecutor and the investigating officer, sign after."""
    case = await get_owned_case(case_cnr, current_user)
    check(why_closed(case))
    attempt = open_attempt(case)
    profile = case.settlement_profile
    if attempt.status != SettlementStatus.AGREED or not attempt.agreed or not profile:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_CANT_SIGN)
    now = get_current_datetime()
    attempt.signatures = {
        s["name"]: now for s in draw_up(case, profile, attempt.agreed)["signatories"]
    }
    attempt.status = SettlementStatus.SIGNED
    await case.save()
    logger.info(f"Settlement deed signed in {case_cnr}")
    return view(case)


@router.post("/{case_cnr}/settlement/file", dependencies=[one_at_a_time])
async def file_deed(
    case_cnr: str,
    current_user: User = Depends(get_current_user),
):
    """File the signed deed (or submit the report); the court lists the hearing."""
    case = await get_owned_case(case_cnr, current_user)
    check(why_closed(case))
    attempt = open_attempt(case)
    if attempt.status != SettlementStatus.SIGNED:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NOT_SIGNED)
    attempt.filed_at = get_current_datetime()
    attempt.hearing_date = hearing_after(attempt.filed_at.date())
    attempt.status = SettlementStatus.FILED
    await case.save()
    logger.info(f"Settlement filed in {case_cnr}, listed {attempt.hearing_date}")
    return view(case)


class HearingRequest(BaseModel):
    submission: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)
    ]


RESULT: dict[str, Literal["quashed", "compounded", "plea"]] = {
    "quash": "quashed",
    "compound": "compounded",
    "plea": "plea",
}


def order_markdown(
    case: Case, profile: SettlementProfile, record: counsel.HearingRecord
) -> str:
    """The order as the case's judgment, in the header style the verdict uses."""
    court = profile.court.split("·")[-1].strip()
    high = "high court" in court.lower()
    signed = f"{record.judge}, J." if high else f"{record.judge}, Magistrate"
    coram = f"HON'BLE {signed}" if high else signed
    order = list(record.order)
    attempt = case.open_settlement()
    if (
        record.outcome == "granted"
        and attempt
        and attempt.agreed
        and attempt.agreed.amount
    ):
        order.append(owed_paragraph(profile))
    paragraphs = "\n".join(f"{i}. {p}" for i, p in enumerate(order, 1))
    return (
        f"**IN THE {court.upper()}**\n"
        f"**{case_numbers(case.details) or case.title}**\n"
        f"**{case.title}**\n"
        f"**CORAM: {coram}**\n"
        f"**Date of Order: {get_current_datetime().strftime('%d %B %Y')}**\n\n"
        f"**ORDER**\n\n{paragraphs}\n\n**{signed}**"
    )


# How the record names the people in a settlement hearing.
SPEAKER = {
    "court": "judge",
    "state": "state",
    "complainant": "complainant",
    "accused": "accused",
}
OUTCOME_TAG = {"granted": "Granted", "refused": "Refused", "adjourned": "Adjourned"}


def put_on_record(
    case: Case, submission: str, record: counsel.HearingRecord, ai_side: str
) -> None:
    """The hearing joins the courtroom record: counsel's submission, what each person
    said, and the ruling with the order."""
    user_side, _ = sides(case)

    def said(role: str, who: str, text: str, tag: str | None = None, **extra):
        case.courtroom_proceedings.append(
            CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.SETTLEMENT,
                content=text,
                speaker_role=role,
                speaker_name=who,
                tag=tag,
                **extra,
            )
        )

    said(user_side, COUNSEL[user_side], submission)
    for line in record.lines:
        if line.kind == "system":
            case.log(line.text)
            continue
        role = ai_side if line.role == "other" else SPEAKER.get(line.role, "judge")
        said(role, line.who, line.text, line.tag or ("Unsure" if line.unsure else None))
    order = "\n".join(f"{i}. {p}" for i, p in enumerate(record.order, 1))
    said(
        "judge",
        "The Court",
        f"{record.ruling}\n\n{order}",
        OUTCOME_TAG[record.outcome],
        sustained={"granted": True, "refused": False}.get(record.outcome),
    )


@router.post("/{case_cnr}/settlement/hearing", dependencies=[controls_hearing])
async def hold_hearing(
    case_cnr: str,
    request: HearingRequest,
    current_user: User = Depends(get_current_user),
):
    """The sitting court hears the filed compromise and passes its order: granted (the
    case ends, settled, and the payments start), refused (no new talks can open, and the
    matter is listed for hearing on the merits), or adjourned to another date. The
    hearing goes on the courtroom record."""
    case = await get_owned_case(case_cnr, current_user)
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_HEARD_IN_COURT)
    attempt = open_attempt(case)
    profile = case.settlement_profile
    if (
        attempt.status not in (SettlementStatus.FILED, SettlementStatus.ADJOURNED)
        or attempt.agreed is None
        or profile is None
        or profile.route == "none"
    ):
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NOT_FILED)
    user_side, ai_side = sides(case)

    try:
        case_context = await retrieve_case_context(
            case,
            "compromise offences complainants victims sections charges",
            source_types=["case_details", "evidence", "proceeding"],
        )
        record = await counsel.hold_hearing(
            profile,
            case.title,
            case_context or case.details[:6000],
            draw_up(case, profile, attempt.agreed),
            user_side,
            request.submission,
            record_lines(case, limit=40),
        )
    except Exception:
        logger.exception(f"Settlement hearing failed for case {case_cnr}")
        raise HTTPException(status_code=500, detail=messages.SETTLEMENT_REVIEW_FAILED)

    now = get_current_datetime()
    attempt.hearing = SettlementHearing(
        submission=request.submission,
        lines=record.lines,
        checks=record.checks,
        outcome=record.outcome,
        judge=record.judge,
        order=record.order,
        next_date=record.next_date,
        held_at=now,
    )
    attempt.ruling = record.ruling
    attempt.court_order = order_markdown(case, profile, record)
    put_on_record(case, request.submission, record, ai_side)
    granted = record.outcome == "granted"
    listed = record.next_date.strftime("%d %B %Y") if record.next_date else ""
    if granted:
        attempt.status = SettlementStatus.RECORDED
        attempt.ended_at = now
        attempt.payments = payments.day_schedule(attempt.agreed, now.date())
        attempt.plan = payments.draw(
            case.cnr, len(attempt.payments), await payer_reliability(case, profile)
        )
        case.verdict = attempt.court_order
        case.outcome = CaseOutcome.SETTLED
        case.outcome_reason = record.ruling
        case.settlement_result = RESULT[profile.route]
        case.status = CaseStatus.RESOLVED
        case.active_session_id = None
        case.active_session_expires_at = None
        case.log("Case disposed of on compromise")
    elif record.outcome == "refused":
        # As in court: the application is dismissed, talks close, and the case is
        # listed for hearing on the merits on another day.
        attempt.status = SettlementStatus.REFUSED
        attempt.ended_at = now
        case.adjourn(note=f"Matter listed for hearing on the merits on {listed}")
    else:
        attempt.status = SettlementStatus.ADJOURNED
        attempt.hearing_date = record.next_date
        case.adjourn(note=f"Verification of the compromise adjourned to {listed}")

    await case.save()
    await upsert_memory_item(
        case,
        "settlement",
        attempt.id,
        f"The court on the compromise ({record.outcome}): {record.ruling}",
        {"status": attempt.status.value},
    )
    if granted:
        await upsert_memory_item(
            case, "verdict", "verdict", attempt.court_order, {"title": case.title}
        )
        await record_settlement(case, record.ruling)
    logger.info(f"Settlement hearing in {case_cnr}: {record.outcome}")
    return view(case)


class PaymentRequest(BaseModel):
    action: Literal["pay", "recall", "notice", "recover"]


@router.post("/{case_cnr}/settlement/payments/{index}", dependencies=[one_at_a_time])
async def answer_payment(
    case_cnr: str,
    index: int,
    request: PaymentRequest,
    current_user: User = Depends(get_current_user),
):
    """Pay an instalment (when the user acts for the accused, who pays), or answer a
    missed one with the route's remedy (when the user acts for the complainants)."""
    case = await get_owned_case(case_cnr, current_user)
    attempt = case.settlements[-1] if case.settlements else None
    profile = case.settlement_profile
    if (
        attempt is None
        or profile is None
        or profile.route == "none"
        or attempt.status != SettlementStatus.RECORDED
        or attempt.plan is not None  # the accused pays on their own
        or not 0 <= index < len(attempt.payments)
    ):
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_PAYMENT)
    payment = attempt.payments[index]
    user_pays = user_is_accused(case, profile)
    now = get_current_datetime()
    state = payments.status(payment, index, user_pays, attempt.defaults_on, now.date())
    if request.action == "pay" and user_pays and state in ("upcoming", "due", "missed"):
        payment.paid_at = now
    elif (
        request.action == payments.REMEDY[profile.route]
        and not user_pays
        and state == "missed"
        and payment.remedy is None
    ):
        payment.remedy = payments.REMEDY[profile.route]
        payment.remedy_at = now
    else:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_PAYMENT)
    await case.save()
    logger.info(f"Settlement payment {index} in {case_cnr}: {request.action}")
    return view(case)


@router.post("/{case_cnr}/settlement/next-day", dependencies=[one_at_a_time])
async def advance_a_day(
    case_cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Developer mode: play the payments a day forward, by moving every date under
    the order a day back. Anyone else gets a 404."""
    if not is_developer(current_user.email):
        raise HTTPException(status_code=404, detail="Not Found")
    case = await get_owned_case(case_cnr, current_user)
    found = progress.watched(case)
    if found is None:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_PAYMENT)
    _, attempt = found
    day = timedelta(days=1)
    for payment in attempt.payments:
        payment.due -= day
        if payment.paid_at:
            payment.paid_at -= day
    if attempt.enforcement:
        attempt.enforcement.filed_on -= day
        if attempt.enforcement.listed_for:
            attempt.enforcement.listed_for -= day
    await case.save()
    await progress.catch_up_and_tell(case, background_tasks)
    return view(case)


ADJOURN_FOR = {
    "quash": "file the joint application to quash the FIR",
    "compound": "file the application to compound the offences",
    "plea": "submit the report of the disposition",
}


def deed_signed(case: Case) -> bool:
    attempt = case.open_settlement()
    return attempt is not None and attempt.status in (
        SettlementStatus.SIGNED,
        SettlementStatus.FILED,
        SettlementStatus.ADJOURNED,
    )


def adjournment_ruling(case: Case, route: str) -> tuple[bool, str]:
    """The court's answer to counsel asking, in session, for time to settle: always
    granted once a deed is signed; otherwise granted once, while talks can go on."""
    attempt = case.open_settlement()
    if deed_signed(case):
        return True, (
            "Granted. A signed compromise is on record. The matter is adjourned so the "
            f"parties can {ADJOURN_FOR[route]}. Counsel will place the outcome before "
            "this court when it resumes."
        )
    if case.settlement_adjourn_asks:
        return False, (
            "Refused. The court has already given the parties time to settle. Talks "
            "can continue alongside the hearing, which proceeds."
        )
    if attempt is None and (
        len(case.settlements) >= MAX_ATTEMPTS
        or any(s.status == SettlementStatus.REFUSED for s in case.settlements)
    ):
        return False, (
            "Refused. The parties have already tried to settle and could not. The "
            "hearing proceeds."
        )
    return True, (
        "Granted. The parties say they are in talks. The court will give them time. "
        "The matter is adjourned, and counsel will report on the settlement when it "
        "resumes."
    )


@router.post("/{case_cnr}/settlement/adjourn", dependencies=[controls_hearing])
async def ask_to_settle(
    case_cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Counsel asks the court in session for an adjournment to settle. The request
    and the ruling go on the record; if granted, the court adjourns."""
    case = await get_owned_case(case_cnr, current_user)
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NOT_SITTING)
    profile = await profile_of(case)
    if profile.route == "none":
        raise HTTPException(status_code=409, detail=messages.SETTLEMENT_NO_ROUTE)

    signed = deed_signed(case)
    granted, ruling = adjournment_ruling(case, profile.route)
    counsel_for = COUNSEL[sides(case)[0]]
    case.settlement_adjourn_asks += 1
    case.log(
        f"{counsel_for} reports a signed compromise and asks for time to place it "
        "before the court"
        if signed
        else f"{counsel_for} asks for an adjournment to explore a settlement"
    )
    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.SETTLEMENT,
            content=ruling,
            speaker_role="judge",
            speaker_name="The Court",
            sustained=granted,
        )
    )
    if granted:
        case.adjourn(note=ADJOURN_NOTES["settlement"])
    await case.save()
    if granted:
        await start_recess(case, background_tasks)
    logger.info(
        f"Adjournment to settle in {case_cnr}: {'granted' if granted else 'refused'}"
    )
    return {"granted": granted, "ruling": ruling}
