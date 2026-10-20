# app/services/llm/settlement.py
"""AI counsel's side of settlement talks held out of court."""

import json
import re
from typing import Literal

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.logging_config import get_logger
from app.models.case import Settlement, SettlementMode, SettlementOffer
from app.utils.datetime import get_current_datetime
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


class CompromiseRuling(BaseModel):
    accepted: bool
    mode: SettlementMode | None = None
    ruling: str
    order: str

    @model_validator(mode="after")
    def mode_matches(self) -> "CompromiseRuling":
        if self.accepted and self.mode is None:
            raise ValueError("an accepted compromise needs a mode")
        if not self.accepted:
            self.mode = None
        self.ruling = self.ruling.strip()[:1000]
        if not self.ruling or not self.order.strip():
            raise ValueError("the ruling and the order must not be empty")
        return self


_RULING = re.compile(r"<ruling>(.*?)</ruling>", re.DOTALL)
_ORDER = re.compile(r"<order>(.*?)(?:</order>|$)", re.DOTALL)


def parse_compromise_ruling(text: str) -> CompromiseRuling:
    """The <ruling> JSON and the <order> Markdown in the judge's reply."""
    text = strip_thinking(text)
    ruling, order = _RULING.search(text), _ORDER.search(text)
    if not ruling or not order:
        raise LLMGenerationError("Compromise ruling missing <ruling> or <order>")
    try:
        data = json.loads(ruling.group(1))
        return CompromiseRuling.model_validate(
            {**data, "order": order.group(1).strip()}
        )
    except (json.JSONDecodeError, ValidationError, TypeError) as e:
        raise LLMGenerationError(f"Invalid compromise ruling: {e}") from e


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


async def review_compromise(
    title: str,
    case_context: str,
    record: str,
    terms: str,
) -> CompromiseRuling:
    """The court decides whether it can act on a compromise both sides put before it."""
    template = """COMPROMISE BEFORE THE COURT
You are the presiding judge of the Indian High Court named in the case file, hearing a simulated case. Counsel for both sides have jointly placed a compromise on record and ask the court to act on it. Decide, as a High Court judge would, whether the law lets the court act on this compromise in this proceeding, and pass the order.

HOW TO DECIDE
- Identify the kind of proceeding from the case file, and every offence (BNS section) involved.
- Quashing petition (Section 528 BNSS):
  - If every offence is compoundable under Section 359 BNSS, permit compounding (mode "compounding"). Compounding has the effect of an acquittal (Section 359(8) BNSS).
  - If any offence is not compoundable, the court may still quash the FIR and all proceedings on the settlement in its inherent power (mode "quashing"), as laid down in Gian Singh v. State of Punjab (2012) and Narinder Singh v. State of Punjab (2014). Do so only where the dispute is overwhelmingly private or civil in character (commercial, financial, matrimonial, family or property disputes, minor assaults), the parties have genuinely buried their dispute, and continuing the prosecution would be futile.
- Regular or anticipatory bail (Sections 483 and 482 BNSS): a court hearing bail cannot quash or compound the case. It may weigh the compromise as one factor for bail (mode "bail"), because it lowers the risk of the complainant being influenced, but never as a ground on its own. If you act on it, grant bail on the usual conditions and give the parties liberty to apply for compounding before the trial court or for quashing under Section 528 BNSS.
- Criminal appeal against conviction (Section 415 BNSS): compounding needs the leave of the appellate court (Section 359(5) BNSS). Grant leave only if every offence of conviction is compoundable (mode "compounding"); the conviction and sentence are then set aside and the appellant is acquitted.
- Always refuse when any offence is heinous or against society: murder, rape or any sexual offence, dacoity, attempt to murder, grave injuries or the use of weapons, offences under the Arms Act or other special statutes, or corruption by public servants (State of Madhya Pradesh v. Laxmi Narayan (2019)). A private compromise cannot end such a case, and in bail it carries no weight.
- Voluntariness: the complainant or victim appears in person, is identified by counsel, and is examined by the court on whether the compromise is free and voluntary. Record what they say. Treat the consent as genuine unless the terms or the record suggest pressure, fraud or inducement (for example threats on record, co-accused still absconding, a victim in a position of dependence); then refuse.
- Terms: refuse terms that are illegal or improper, such as a witness turning hostile or matters outside this dispute. Note any compensation paid or payable and when.
- The Public Prosecutor is heard for the State and may oppose. The State is not a party to the compromise, but the court must be satisfied that the law permits acting on it.
- Costs: when quashing on settlement the court may impose modest costs (often Rs. 10,000 to Rs. 25,000) payable to the State Legal Services Authority or a welfare fund; otherwise none.
- {current_law_rule}
- Do not invent facts, and cite no case other than those named above.

{untrusted_text_rule}

THE CASE
{case_context}

THE HEARING SO FAR
<history>
{record}
</history>

THE COMPROMISE AS AGREED BY BOTH SIDES
<user_argument>{terms}</user_argument>

Reply in exactly two parts and nothing else:
<ruling>{{"accepted": true | false, "mode": "compounding" | "quashing" | "bail" | null, "ruling": "<one or two sentences from the bench saying what the court does with the compromise and why. Do not repeat the terms or any amount: if the compromise is refused, the case goes on to be heard on merits.>"}}</ruling>
<order>
The order in Markdown. Begin with this unnumbered header, taken from the case file:
**IN THE [HIGH COURT NAME]**
**[CASE NO.]**
**{title}**
**CORAM: HON'BLE [invent a judge's name], J.**
**Date of Order: {order_date}**
**ORDER**
Then numbered paragraphs: what the petition seeks; that a compromise has been placed on record, and its terms; the complainant's statement before the court; the Public Prosecutor's stand; the law and why the court can or cannot act on the compromise; and the operative directions (what is quashed or compounded, or bail granted with its conditions, or that the compromise is not accepted and the matter will be heard on merits), with costs if any. End with "Pending application(s), if any, stand disposed of." only if the case is disposed of. Close with the judge's name followed by ", J.".
</order>"""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("judge")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "title": title or "No title provided",
                "case_context": case_context,
                "record": (record or "The hearing has not begun.").replace(
                    "</history>", ""
                ),
                "terms": terms.replace("</user_argument>", ""),
                "current_law_rule": CURRENT_LAW_RULE,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "order_date": get_current_datetime().strftime("%d %B %Y"),
            }
        )
    except Exception as e:
        logger.exception("Error reviewing a compromise")
        raise LLMGenerationError("Failed to review the compromise") from e
    return parse_compromise_ruling(reply)
