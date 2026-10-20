# app/services/llm/settlement.py
"""AI counsel's side of settlement talks held out of court."""

import json
import re
from typing import Literal

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.logging_config import get_logger
from app.models.case import Settlement, SettlementOffer
from app.utils.llm import (
    CURRENT_LAW_RULE,
    SIDES_RULE,
    UNTRUSTED_TEXT_RULE,
    LLMGenerationError,
    get_llm,
    strip_thinking,
)

logger = get_logger(__name__)
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


class OfferReply(BaseModel):
    decision: Literal["accept", "counter", "reject"]
    terms: str = ""  # the counter's terms
    compensation: int | None = Field(None, ge=0)
    message: str

    @model_validator(mode="after")
    def counter_needs_terms(self) -> "OfferReply":
        if self.decision == "counter" and not self.terms.strip():
            raise ValueError("a counter-offer needs terms")
        self.terms = self.terms.strip()[:2000]
        self.message = self.message.strip()[:1000]
        return self


def parse_offer_reply(text: str) -> OfferReply:
    """The JSON object in the model's reply, validated."""
    match = _JSON_OBJECT.search(strip_thinking(text))
    if not match:
        raise LLMGenerationError("Offer reply had no JSON object")
    try:
        return OfferReply.model_validate(json.loads(match.group(0)))
    except (json.JSONDecodeError, ValidationError) as e:
        raise LLMGenerationError(f"Invalid offer reply: {e}") from e


def offer_text(offer: SettlementOffer) -> str:
    money = f" Compensation: Rs. {offer.compensation:,}." if offer.compensation else ""
    return f"{offer.terms}{money}"


def format_negotiation(settlements: list[Settlement], speaker: dict[str, str]) -> str:
    """Every attempt in order: who offered what and how it was answered.

    ``speaker`` names each side ("plaintiff"/"defendant") for the reader.
    """
    lines = []
    for number, attempt in enumerate(settlements, 1):
        lines.append(f"Attempt {number} ({attempt.status.value}):")
        for offer in attempt.offers:
            lines.append(f"- {speaker[offer.side.value]} offered: {offer_text(offer)}")
            if offer.response:
                answer = f" ({offer.reply})" if offer.reply else ""
                lines.append(f"  Answer: {offer.response}{answer}")
        if attempt.ruling:
            lines.append(f"- The court: {attempt.ruling}")
    return "\n".join(lines)


async def respond_to_offer(
    ai_role: str,
    user_role: str,
    case_context: str,
    clients: str,
    evidence_context: str,
    record: str,
    negotiation: str,
    offer: SettlementOffer,
    offers_left: int,
) -> OfferReply:
    """AI counsel accepts, counters or rejects the user's settlement offer."""
    template = """SETTLEMENT OFFER
You are an experienced Indian advocate for the {ai_role} in a criminal matter before the High Court. Opposing counsel, for the {user_role}, is the user. Out of court, they have offered terms to settle the case. These talks are without prejudice: nothing said here goes before the court on the merits.

WHO SETTLES
- A criminal compromise is between the accused and the complainant or victim. If you act for the non-applicant side you speak for the complainant or victim, not the State; if you act for the applicant you speak for the accused.
- Even agreed terms only take effect if the court accepts them. The court refuses compromises of heinous offences or offences against society (murder, rape, dacoity, attempt to murder, offences under special statutes), and checks that the complainant consents freely.
- {sides_rule}

HOW TO DECIDE
- Advise your client as a careful advocate would. Weigh how strong your client's case is on the record and the evidence, what your client wants, and what a compromise gives them compared with fighting on.
- Do not accept a first offer unless it is genuinely fair to your client. Counter with specific terms that fit the facts: compensation in rupees, an apology, undertakings (no further contact, withdrawal of cross-complaints, return of money or property), a payment schedule. Concede in steps, and ask for something back for every concession.
- Accept when the terms are fair for your client. Reject when they are unfair and the gap is too wide to bridge, or when they are improper: asking a witness to lie or turn hostile, or covering matters outside this dispute.
- In grave offences be very reluctant, and protect your client from pressure to settle.
- Opposing counsel can make {offers_left} more offer(s) in this round after this one. If none are left, a counter is their final chance to accept your terms.
- {current_law_rule}

{untrusted_text_rule}

YOUR CLIENT(S)
{clients}

THE CASE
{case_context}

EVIDENCE
{evidence_context}

THE HEARING SO FAR
<history>
{record}
</history>

TALKS SO FAR
<history>
{negotiation}
</history>

THE OFFER ON THE TABLE
<user_argument>{offer}</user_argument>

Reply with ONLY this JSON object and nothing else:
{{"decision": "accept" | "counter" | "reject", "terms": "<your counter's full terms; empty unless you counter>", "compensation": <rupees as a whole number, or null>, "message": "<two to four sentences you say to opposing counsel across the table>"}}"""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("lawyer")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "ai_role": ai_role,
                "user_role": user_role,
                "sides_rule": SIDES_RULE,
                "current_law_rule": CURRENT_LAW_RULE,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "offers_left": offers_left,
                "clients": clients or "Not on record.",
                "case_context": case_context,
                "evidence_context": evidence_context
                or "No structured evidence has been submitted.",
                "record": (record or "The hearing has not begun.").replace(
                    "</history>", ""
                ),
                "negotiation": (negotiation or "This is the first offer.").replace(
                    "</history>", ""
                ),
                "offer": offer_text(offer).replace("</user_argument>", ""),
            }
        )
    except Exception as e:
        logger.exception("Error responding to a settlement offer")
        raise LLMGenerationError("Failed to respond to the settlement offer") from e
    return parse_offer_reply(reply)
