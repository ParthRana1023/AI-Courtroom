# app/services/llm/settlement.py
"""Settling a criminal case out of court: the route the case allows, AI counsel's side
of the talks, and the court's review of the compromise."""

import json
import re
from typing import Literal

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, ValidationError, model_validator

from app.logging_config import get_logger
from app.models.case import (
    INSTALMENTS,
    MONTHS,
    Settlement,
    SettlementCondition,
    SettlementEntry,
    SettlementProfile,
    SettlementTerms,
)
from app.utils.datetime import get_current_datetime
from app.utils.llm import (
    CURRENT_LAW_RULE,
    UNTRUSTED_TEXT_RULE,
    LLMGenerationError,
    get_llm,
    strip_thinking,
    tagged,
)

logger = get_logger(__name__)
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


def _json(text: str, what: str) -> dict:
    match = _JSON_OBJECT.search(strip_thinking(text))
    if not match:
        raise LLMGenerationError(f"{what} had no JSON object")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise LLMGenerationError(f"Invalid {what}: {e}") from e


def inr(amount: int) -> str:
    """Rupees with Indian digit grouping: 4200000 -> "Rs. 42,00,000"."""
    s = str(max(0, amount))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", head)
        s = f"{head},{tail}"
    return f"Rs. {s}"


def terms_text(terms: SettlementTerms, conditions: list[SettlementCondition]) -> str:
    """One line a reader (or a model) can follow."""
    schedule = (
        "in one payment"
        if terms.instalments == 1
        else f"in {terms.instalments} instalments"
    )
    interest = (
        f"with interest at {terms.interest:g}% a year"
        if terms.interest
        else "without interest"
    )
    labels = {c.key: c.label for c in conditions}
    conds = [labels[k] for k in terms.conditions if k in labels]
    return (
        f"{inr(terms.amount)} {schedule} within {terms.months} months, {interest}. "
        f"Conditions: {'; '.join(conds) if conds else 'none'}."
    )


_DID = {
    "offer": "offered",
    "counter": "countered",
    "accept": "accepted the last terms",
    "refuse": "refused and ended the talks",
    "ended": "ended the talks",
}


def entry_text(
    entry: SettlementEntry, who: str, conditions: list[SettlementCondition]
) -> str:
    """One move across the table, as a sentence."""
    text = f"{who} {_DID[entry.kind]}"
    if entry.terms:
        text += f": {terms_text(entry.terms, conditions)}"
    if entry.note:
        text += f' Said: "{entry.note}"'
    return text


def format_negotiation(
    settlements: list[Settlement],
    names: dict[str, str],
    conditions: list[SettlementCondition],
) -> str:
    """Every attempt in order. ``names`` labels each side ("user", "ai") for the reader."""
    lines = []
    for number, attempt in enumerate(settlements, 1):
        lines.append(f"Attempt {number} ({attempt.status.value}):")
        lines += [
            f"- {entry_text(e, names[e.by], conditions)}" for e in attempt.entries
        ]
        if attempt.ruling:
            lines.append(f"- The court: {attempt.ruling}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# The route
# ---------------------------------------------------------------------------


def parse_profile(text: str) -> SettlementProfile:
    """The route JSON, checked: an open route needs offences and conditions; "none"
    explains why each route is closed. Condition keys are made unique slugs."""
    data = _json(text, "Settlement route")
    try:
        profile = SettlementProfile.model_validate(data)
    except ValidationError as e:
        raise LLMGenerationError(f"Invalid settlement route: {e}") from e
    if profile.route == "none":
        if not profile.closed:
            raise LLMGenerationError("A closed route must say why")
        profile.conditions = []
        return profile
    if not profile.offences or not profile.title or not profile.complainants:
        raise LLMGenerationError("An open route needs offences and complainants")
    seen: set[str] = set()
    conditions = []
    for c in profile.conditions[:6]:
        key = re.sub(r"[^a-z0-9]+", "-", c.key.lower()).strip("-") or "term"
        while key in seen:
            key += "-2"
        seen.add(key)
        conditions.append(c.model_copy(update={"key": key}))
    if len(conditions) < 2:
        raise LLMGenerationError("An open route needs at least two conditions")
    profile.conditions = conditions
    return profile


async def assess_settlement(title: str, case_text: str) -> SettlementProfile:
    """Whether and how the case can be settled, read from the case file."""
    template = """SETTLEMENT ROUTE
You are an experienced Indian criminal-law advocate. Read the case file and work out whether, and how, this criminal case can be settled out of court, the way it is done in Indian practice today.

THE ROUTES
- "quash": the High Court quashes the FIR and the proceedings on the basis of a compromise, in its inherent power under Section 528 BNSS (Gian Singh v. State of Punjab (2012), Narinder Singh v. State of Punjab (2014)). Open only when a petition under Section 528 BNSS is before the High Court and the dispute is overwhelmingly private or civil in character (commercial, financial, matrimonial, family or property disputes, minor assaults). Every complainant or victim must join the compromise.
- "compound": compounding under Section 359 BNSS. Open only when every offence charged is compoundable under the tables in Section 359 (by the person the table names, with or without the court's permission). It is done before the trial court; when an appeal against conviction is pending, with the leave of the appellate court (Section 359(5)). Compounding has the effect of an acquittal (Section 359(8)).
- "plea": plea bargaining under Sections 289 to 295 BNSS before the trial court. Open only when the accused applies within 30 days of the charge being framed, every offence carries a maximum punishment of less than seven years, no offence affects the socio-economic condition of the country or is committed against a woman or a child below fourteen, and the accused has no previous conviction for the same offence. The accused pleads guilty; the court awards the agreed compensation and passes a reduced sentence (Section 293).
- "none": no route is open.
- Never open a route when any offence is heinous or against society: murder, rape or any sexual offence, dacoity, attempt to murder, grave injuries or the use of weapons, offences under the Arms Act or other special statutes, or corruption by public servants (State of Madhya Pradesh v. Laxmi Narayan (2019)).
- If more than one route is open, take the one a careful advocate would take first: "quash" when a Section 528 petition is before the High Court, else "compound", else "plea".
- A bail application is not a settlement route: a bail court can neither quash nor compound. For a bail case choose "compound" if every offence is compoundable before the trial court, else "none".
- {current_law_rule}
- Do not invent facts. Use the names, sections and courts in the case file.

WHAT TO WRITE
- "title": the route in a few words ("Quashing on compromise", "Compounding", "Plea bargaining"); "" for "none".
- "court": the provision and the court that acts on it, as "§ 528 BNSS · High Court of Delhi" or "§ 359 BNSS · Court of the CJM, Patiala House Courts" (the trial court in the case file, or the usual one for the place); "" for "none".
- "offences": for an open route, each offence charged as {{"section": "§ 318(4)", "title": "Cheating", "note": "<one sentence on how it fits this route>"}}. For plea bargaining, list the steps that apply instead ("§ 290" application, "§ 291" meeting).
- "must" and "must_detail": the condition that matters most, in two short sentences, such as "All eleven complainants must sign." and "The court won't quash the FIR on a part-settlement."
- "footnote": one sentence on why the other routes don't apply here, or on the effect of this one.
- "closed": only for "none": all three routes as {{"section": "§ 528" | "§ 359" | "§ 289", "title": "Quashing on compromise" | "Compounding" | "Plea bargaining", "note": "<why it is closed in this case, one sentence>"}}; [] otherwise.
- "conditions": for an open route, the terms beyond money that genuinely fit this kind of case and offence, 2 to 6 of them, each {{"key": "<short slug>", "label": "<the term, under 60 characters>", "short": "<two or three words>", "clause": "<the clause as it reads in the compromise deed, one sentence>", "favours": "accused" | "complainants"}}. For example: the first instalment deposited in court, a written apology, no contact with the complainant, cross-complaints or civil suits withdrawn on the final payment, documents or property returned. Never a term that is illegal or stifles a prosecution, such as a witness turning hostile. [] for "none".
- "accused": the accused person's name. "accused_side": "plaintiff" if the accused is among the applicants in this petition, else "defendant".
- "complainants": the complainants or victims who must join the compromise, the lead complainant first. If the file gives a number larger than the names it gives (for example eleven buyers), list the names it gives and add short Indian names for the rest so the count matches.
- "claim": the total money in dispute in rupees, as a whole number; 0 if the dispute is not about money.

Write plain English in short sentences.

THE CASE FILE
{title}
<case_file>
{case_text}
</case_file>

Reply with ONLY this JSON object and nothing else:
{{"route": "quash" | "compound" | "plea" | "none", "title": "...", "court": "...", "offences": [...], "must": "...", "must_detail": "...", "footnote": "...", "closed": [...], "conditions": [...], "accused": "...", "accused_side": "plaintiff" | "defendant", "complainants": ["..."], "claim": 0}}"""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("judge")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "title": title or "",
                "case_text": case_text.replace("</case_file>", ""),
                "current_law_rule": CURRENT_LAW_RULE,
            }
        )
    except Exception as e:
        logger.exception("Error working out the settlement route")
        raise LLMGenerationError("Failed to work out the settlement route") from e
    return parse_profile(reply)


# ---------------------------------------------------------------------------
# AI counsel across the table
# ---------------------------------------------------------------------------


def _nearest(value: float, allowed: tuple[int, ...]) -> int:
    return min(allowed, key=lambda a: (abs(a - value), a))


def snap_terms(raw: dict, keys: set[str]) -> SettlementTerms:
    """Terms as the model wrote them, moved onto the choices the desk offers."""
    return SettlementTerms(
        amount=max(0, round(float(raw.get("amount") or 0) / 1000) * 1000),
        instalments=_nearest(float(raw.get("instalments") or 1), INSTALMENTS),  # type: ignore[arg-type]
        months=_nearest(float(raw.get("months") or 6), MONTHS),  # type: ignore[arg-type]
        interest=round(min(18.0, max(0.0, float(raw.get("interest") or 0))), 1),
        conditions=[k for k in dict.fromkeys(raw.get("conditions") or []) if k in keys],
    )


class OfferReply(BaseModel):
    decision: Literal["accept", "counter", "reject"]
    terms: SettlementTerms | None = None  # the counter's terms
    message: str

    @model_validator(mode="after")
    def counter_needs_terms(self) -> "OfferReply":
        if self.decision == "counter" and self.terms is None:
            raise ValueError("a counter-offer needs terms")
        self.message = self.message.strip()[:1000]
        return self


def parse_offer_reply(text: str, keys: set[str]) -> OfferReply:
    """The JSON object in the model's reply, with its terms snapped to the desk's choices."""
    data = _json(text, "Offer reply")
    try:
        raw = data.get("terms")
        if isinstance(raw, dict):
            data["terms"] = snap_terms(raw, keys)
        else:
            data["terms"] = None
        return OfferReply.model_validate(data)
    except (ValidationError, TypeError, ValueError) as e:
        raise LLMGenerationError(f"Invalid offer reply: {e}") from e


async def respond_to_offer(
    ai_side: str,
    acts_for: str,
    opposite: str,
    profile: SettlementProfile,
    case_context: str,
    clients: str,
    evidence_context: str,
    record: str,
    negotiation: str,
    offer: SettlementTerms | None,
    note: str,
    offers_left: int,
) -> OfferReply:
    """AI counsel answers the user's offer, or makes the opening offer when there is none.

    ``acts_for`` is "the accused" or "the complainants"; ``opposite`` the other.
    """
    template = """SETTLEMENT OFFER
You are an experienced Indian advocate for {acts_for} in a criminal case ({ai_side} side). Opposing counsel, for {opposite}, is the user. Out of court, the two of you are negotiating a settlement. These talks are without prejudice: nothing said here goes before the court on the merits.

THE ROUTE
{route}
Even agreed terms only take effect when the court accepts them, and the court checks that every complainant consents freely.

HOW TO DECIDE
- Advise your client as a careful advocate would. Weigh how strong your client's case is on the record and the evidence, what your client wants, and what a settlement gives them compared with fighting on.
- Terms are always: an amount in rupees, paid in 1, 2, 3, 4 or 6 instalments, within 3, 6, 9, 12 or 18 months, at an interest rate of 0 to 18 per cent a year, plus any of the conditions listed below (by key).
- Do not accept a first offer unless it is genuinely fair to your client. Concede in steps, and ask for something back for every concession. Accept when the terms are fair to your client. Reject when the gap is too wide to bridge.
- In grave offences be very reluctant, and protect your client from pressure to settle.
- Opposing counsel has {offers_left} offer(s) left after this one. With none left, your counter is their last chance to accept your terms.
- {current_law_rule}

{untrusted_text_rule}

CONDITIONS (key: term, who it favours)
{conditions}

YOUR CLIENT(S)
{clients}

THE CASE
{case_context}

EVIDENCE
{evidence_context}

THE HEARING SO FAR
{record}

TALKS SO FAR
{negotiation}

{task}

Reply with ONLY this JSON object and nothing else:
{{"decision": "accept" | "counter" | "reject", "terms": {{"amount": <rupees>, "instalments": <1|2|3|4|6>, "months": <3|6|9|12|18>, "interest": <per cent a year>, "conditions": ["<key>", ...]}} or null unless you counter, "message": "<two to four sentences you say to opposing counsel across the table>"}}"""
    if offer is None:
        task = (
            "THE TASK\nThere is no offer yet. Make your client's opening offer: reply "
            'with decision "counter" and your terms. Open where a careful advocate '
            "would, leaving room to move."
        )
    else:
        task = "THE OFFER ON THE TABLE\n" + tagged(
            terms_text(offer, profile.conditions)
            + (f"\nTheir note: {note}" if note else ""),
            "user_argument",
        )
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("lawyer")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "acts_for": acts_for,
                "ai_side": ai_side,
                "opposite": opposite,
                "route": f"{profile.title} ({profile.court}). {profile.must} {profile.must_detail}",
                "current_law_rule": CURRENT_LAW_RULE,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "offers_left": offers_left,
                "conditions": "\n".join(
                    f"- {c.key}: {c.label} (favours the {c.favours})"
                    for c in profile.conditions
                ),
                "clients": clients or "Not on record.",
                "case_context": case_context,
                "evidence_context": evidence_context
                or "No structured evidence has been submitted.",
                "record": tagged(record or "The hearing has not begun.", "history"),
                "negotiation": tagged(
                    negotiation or "Nothing yet: this is the start of the talks.",
                    "history",
                ),
                "task": task,
            }
        )
    except Exception as e:
        logger.exception("Error responding to a settlement offer")
        raise LLMGenerationError("Failed to respond to the settlement offer") from e
    return parse_offer_reply(reply, {c.key for c in profile.conditions})


# ---------------------------------------------------------------------------
# Before the court
# ---------------------------------------------------------------------------


class CompromiseRuling(BaseModel):
    accepted: bool
    ruling: str
    order: str

    @model_validator(mode="after")
    def not_empty(self) -> "CompromiseRuling":
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
  - If every offence is compoundable under Section 359 BNSS, permit compounding. Compounding has the effect of an acquittal (Section 359(8) BNSS).
  - If any offence is not compoundable, the court may still quash the FIR and all proceedings on the settlement in its inherent power, as laid down in Gian Singh v. State of Punjab (2012) and Narinder Singh v. State of Punjab (2014). Do so only where the dispute is overwhelmingly private or civil in character (commercial, financial, matrimonial, family or property disputes, minor assaults), the parties have genuinely buried their dispute, and continuing the prosecution would be futile.
- Regular or anticipatory bail (Sections 483 and 482 BNSS): a court hearing bail cannot quash or compound the case. It may weigh the compromise as one factor for bail, because it lowers the risk of the complainant being influenced, but never as a ground on its own. If you act on it, grant bail on the usual conditions and give the parties liberty to apply for compounding before the trial court or for quashing under Section 528 BNSS.
- Criminal appeal against conviction (Section 415 BNSS): compounding needs the leave of the appellate court (Section 359(5) BNSS). Grant leave only if every offence of conviction is compoundable; the conviction and sentence are then set aside and the appellant is acquitted.
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
<ruling>{{"accepted": true | false, "ruling": "<one or two sentences from the bench saying what the court does with the compromise and why. Do not repeat the terms or any amount: if the compromise is refused, the case goes on to be heard on merits.>"}}</ruling>
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
