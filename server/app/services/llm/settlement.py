# app/services/llm/settlement.py
"""Settling a criminal case out of court: the route the case allows, AI counsel's side
of the talks, the hearing that gives the compromise effect, and the analysis of how the
user negotiated.
"""

import json
import re
from datetime import date
from typing import Literal

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, ValidationError, model_validator

from app.logging_config import get_logger
from app.models.case import (
    INSTALMENTS,
    MONTHS,
    CoachNote,
    HearingCheck,
    HearingLine,
    NegotiationAnalysis,
    ScoreFactor,
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
        if attempt.agreed:
            lines.append(f"- Terms agreed: {terms_text(attempt.agreed, conditions)}")
        if attempt.hearing:
            lines.append(f"- The court {attempt.hearing.outcome} it: {attempt.ruling}")
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
- "prosecutor" and "officer": only for "plea": the public prosecutor and the investigating officer who take part in the disposition meeting, by name (from the case file, or short Indian names if it gives none); "" otherwise.

Write plain English in short sentences.

THE CASE FILE
{title}
<case_file>
{case_text}
</case_file>

Reply with ONLY this JSON object and nothing else:
{{"route": "quash" | "compound" | "plea" | "none", "title": "...", "court": "...", "offences": [...], "must": "...", "must_detail": "...", "footnote": "...", "closed": [...], "conditions": [...], "accused": "...", "accused_side": "plaintiff" | "defendant", "complainants": ["..."], "claim": 0, "prosecutor": "", "officer": ""}}"""
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

# What the court must be satisfied of, by route; the court rules on each.
CHECKS = {
    "quash": [
        "Every complainant agreed freely",
        "The dispute is private",
        "The State’s view",
    ],
    "compound": [
        "Every complainant compounded freely",
        "The court’s permission",
        "The offences can be compounded",
    ],
    "plea": [
        "The plea is voluntary",
        "Every complainant accepts",
        "The offences qualify",
    ],
}
HEARING = {
    "quash": "a verification hearing on a joint application under Section 528 BNSS to quash the FIR and all proceedings on the basis of a compromise",
    "compound": "a hearing on an application under Section 359 BNSS to compound the offences, which needs the court's permission where the table says so",
    "plea": "a sentencing hearing on the report of a mutually satisfactory disposition under Section 292 BNSS (plea bargaining)",
}


class HearingRecord(BaseModel):
    judge: str
    lines: list[HearingLine]
    checks: list[HearingCheck]
    outcome: Literal["granted", "refused", "adjourned"]
    ruling: str
    order: list[str]
    next_date: date | None = None

    @model_validator(mode="after")
    def complete(self) -> "HearingRecord":
        if not self.lines or not self.order or not self.judge.strip():
            raise ValueError("the hearing needs a record, an order and a judge")
        if self.outcome != "granted" and self.next_date is None:
            raise ValueError("a refused or adjourned matter needs its next date")
        self.ruling = self.ruling.strip()[:1000]
        return self


def parse_hearing(text: str) -> HearingRecord:
    try:
        return HearingRecord.model_validate(_json(text, "Settlement hearing"))
    except ValidationError as e:
        raise LLMGenerationError(f"Invalid settlement hearing: {e}") from e


async def hold_hearing(
    profile: SettlementProfile,
    title: str,
    case_context: str,
    deed: dict,
    user_side: str,
    submission: str,
    record: str = "",
) -> HearingRecord:
    """The court hears the filed compromise (or plea report) and passes its order. The
    same court has heard the case so far, so it knows the record."""
    template = """SETTLEMENT HEARING
You are the presiding judge of {court}, in a simulated Indian criminal case: {title}. This is {hearing}. Counsel for the {user_side} (the user) has just made a short submission. Write the rest of the hearing as it would happen in an Indian court, then pass the order.

WHAT HAPPENS
- Counsel for the other side confirms the compromise (one or two sentences).
- The Additional Public Prosecutor (APP) states the State's view: "No objection", "Opposes" or, on plea bargaining, "Agrees". The State is not a party to the compromise but may oppose it.
- The court examines the complainants or victims in person (on plea bargaining, first the accused on whether the plea is voluntary): short questions and answers by name. Ask whether they signed freely, whether anyone pressured them, and whether they are satisfied with the payments. If there are more than three complainants, a system line may say the investigating officer identified the rest and each confirmed.
- The court gives its reasons in a few sentences, then passes the order.

HOW TO DECIDE
- "granted": the law allows the court to act on this compromise and every complainant consents freely. Most genuine, lawful settlements of private disputes are granted.
- "refused": the law bars it, for instance a heinous offence or one against society (State of Madhya Pradesh v. Laxmi Narayan (2019)), victims not before the court who are affected by the same acts, an offence that cannot be compounded, terms that are illegal, or a plea of guilty that is not voluntary.
- "adjourned": a complainant is not fully satisfied, is absent, or the court needs something more before deciding. Mark that answer "unsure".
- Decide on the law and the case file, not on what the user would like. {current_law_rule}
- Do not invent facts beyond the case file, the deed and what is said at this hearing. Cite no case other than the one named.

THE ORDER
- Numbered paragraphs in plain English, 3 to 5 of them. When granted: what is quashed, compounded (the composition has the effect of an acquittal, Section 359(8) BNSS) or, on plea bargaining, the conviction on the plea, the compensation and the reduced sentence under Section 293 BNSS (for a first offender, a quarter or a sixth of the punishment provided, as the section says); the first instalment deposited in court within two weeks; what happens on default. When refused: that the application is dismissed and what continues. When adjourned: the next date and what the parties must do before it.
- "next_date": for refused or adjourned, the date the matter is listed next, two to six weeks after {today}, as YYYY-MM-DD; null when granted.

{untrusted_text_rule}

THE ROUTE
{route}

THE CASE
{case_context}

THE HEARING SO FAR (this court's record of the case before the compromise was placed before it)
{record}

THE DEED AS FILED
{deed}

COUNSEL'S SUBMISSION
{submission}

Reply with ONLY this JSON object and nothing else:
{{"judge": "<the presiding judge's name, invented, without 'J.'>", "lines": [{{"kind": "speech" | "question" | "answer" | "system", "role": "court" | "other" | "state" | "complainant" | "accused" | "system", "who": "<speaker as the record names them, e.g. 'Counsel for the accused', 'APP for the State', 'The Court to Priya Khanna', 'Priya Khanna'>", "tag": "<the State's stand on its line, else ''>", "unsure": false, "text": "..."}}], "checks": [{checks}], "outcome": "granted" | "refused" | "adjourned", "ruling": "<one sentence from the bench>", "order": ["<paragraph>", "..."], "next_date": "YYYY-MM-DD" | null}}"""
    labels = CHECKS[profile.route]
    deed_text = "\n".join(
        [deed["title"], deed["parties"]]
        + [f"{i}. {c}" for i, c in enumerate(deed["clauses"], 1)]
    )
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("hearing")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "court": profile.court.split("·")[-1].strip() or "the court",
                "title": title or "the case",
                "hearing": HEARING[profile.route],
                "user_side": user_side,
                "current_law_rule": CURRENT_LAW_RULE,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "today": get_current_datetime().date().isoformat(),
                "route": f"{profile.title} ({profile.court}). {profile.must} {profile.must_detail}",
                "case_context": case_context,
                "record": tagged(record or "Nothing has been argued yet.", "history"),
                "deed": deed_text,
                "submission": tagged(submission, "user_argument"),
                "checks": ", ".join(
                    f'{{"label": "{label}", "state": "ok" | "unsure" | "fail", "text": "<one short sentence>"}}'
                    for label in labels
                ),
            }
        )
    except Exception as e:
        logger.exception("Error holding the settlement hearing")
        raise LLMGenerationError("Failed to hold the settlement hearing") from e
    return parse_hearing(reply)


# What the court is hearing on a default, and the orders the law gives it.
ENFORCEMENT_HEARING = {
    "contempt": "a petition by the complainants for civil contempt under Section 2(b) of the Contempt of Courts Act, 1971: the accused undertook to this court to pay the amount settled, the court accepted the undertaking when it quashed the FIR, and an instalment is unpaid even after notice. The quashing itself cannot be recalled for a breach of the compromise (Section 403 BNSS bars a review), so contempt is the complainants' remedy here",
    "recovery": "an application by the complainants to recover compensation unpaid under the sentence passed on a plea bargain (Section 293 BNSS). The compensation is part of the sentence, so the court recovers it as it would a fine, under Section 461 BNSS",
}
ENFORCEMENT_ORDERS: dict[str, dict[str, str]] = {
    "contempt": {
        "time": "the breach is not shown to be wilful (genuine inability, shown by facts, not just said): no contempt; the court gives a short time to pay the balance and the notice stands discharged once it is paid",
        "last_chance": "the breach looks wilful (able to pay and chose not to, or no real explanation): the court holds the accused prima facie in contempt but, as courts almost always do, gives one last chance to purge it by paying the balance with costs; sentence under Section 12 (simple imprisonment up to six months, a fine up to Rs. 2,000, or both) follows only if that is not done. An unconditional apology counts only with payment",
        "relegated": "contempt is not a way to execute a money claim: the dispute is really about the amount or the terms, so the court closes the petition and leaves the complainants to sue on the deed in a civil court",
    },
    "recovery": {
        "time": "the accused shows a real reason and a way to pay: the court gives a short time to pay the balance before it issues a warrant",
        "warrant": "the court issues a warrant to levy the amount by attaching and selling the accused's movable property, or to the Collector to realise it as arrears of land revenue (Section 461(1) BNSS)",
    },
}


class EnforcementRecord(BaseModel):
    judge: str
    lines: list[HearingLine]
    outcome: Literal["time", "last_chance", "relegated", "warrant"]
    ruling: str
    order: list[str]

    @model_validator(mode="after")
    def complete(self) -> "EnforcementRecord":
        if not self.lines or not self.order or not self.judge.strip():
            raise ValueError("the hearing needs a record, an order and a judge")
        self.ruling = self.ruling.strip()[:1000]
        return self


def parse_enforcement(text: str, kind: str) -> EnforcementRecord:
    """The record of the hearing on a default. An order the law doesn't give on this
    application is read as the nearest one it does."""
    try:
        record = EnforcementRecord.model_validate(_json(text, "Enforcement hearing"))
    except ValidationError as e:
        raise LLMGenerationError(f"Invalid enforcement hearing: {e}") from e
    if record.outcome not in ENFORCEMENT_ORDERS[kind]:
        record.outcome = "last_chance" if kind == "contempt" else "time"
    return record


async def hear_enforcement(
    profile: SettlementProfile,
    kind: Literal["contempt", "recovery"],
    title: str,
    user_side: str,
    user_applies: bool,
    facts: str,
    order: str,
    submission: str,
    record: str = "",
) -> EnforcementRecord:
    """The court hears the complainants' application on a default. The user is
    counsel for the complainants moving it, or counsel for the accused answering it."""
    template = """ENFORCEMENT HEARING
You are the presiding judge of {court}, in a simulated Indian criminal case: {title}. The case was disposed of on a compromise, and this court passed the order below. This is {hearing}. Counsel for the {user_side} (the user), who {user_part}, has just made a short submission. Write the rest of the hearing as it would happen in an Indian court, then pass the order.

WHAT HAPPENS
- Counsel for the other side answers in one to three sentences.
- The court may put a short question or two to the accused, through counsel or in person, about the default and their means. Keep it brief.
- The court gives its reasons in a few sentences, then passes the order.

HOW TO DECIDE (pick one)
{outcomes}
- Decide on the law, the order, the payments and what is said at this hearing, not on what the user would like. Weigh what counsel shows about why the instalment went unpaid and whether the accused can pay. {current_law_rule}
- Do not invent facts beyond what is given here. Cite no case.

THE ORDER
- Numbered paragraphs in plain English, 2 to 4 of them: what the court finds, what it directs (for time, last_chance or warrant: the balance to be paid or levied within a short time) and what follows if that is not done.

{untrusted_text_rule}

THE ORDER ON THE COMPROMISE
{order}

THE PAYMENTS
{facts}

THE HEARING SO FAR (this court's record of the case)
{record}

COUNSEL'S SUBMISSION
{submission}

Reply with ONLY this JSON object and nothing else:
{{"judge": "<the presiding judge's name, invented, without 'J.'>", "lines": [{{"kind": "speech" | "question" | "answer" | "system", "role": "court" | "other" | "complainant" | "accused" | "system", "who": "<speaker as the record names them, e.g. 'Counsel for the complainants', 'The Court to Ravi Kumar', 'Ravi Kumar'>", "tag": "", "unsure": false, "text": "..."}}], "outcome": {choices}, "ruling": "<one sentence from the bench>", "order": ["<paragraph>", "..."]}}"""
    orders = ENFORCEMENT_ORDERS[kind]
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("hearing")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "court": profile.court.split("·")[-1].strip() or "the court",
                "title": title or "the case",
                "hearing": ENFORCEMENT_HEARING[kind],
                "user_side": user_side,
                "user_part": (
                    "moves the application for the complainants"
                    if user_applies
                    else "answers it for the accused"
                ),
                "outcomes": "\n".join(
                    f'- "{key}": {text}' for key, text in orders.items()
                ),
                "choices": " | ".join(f'"{key}"' for key in orders),
                "current_law_rule": CURRENT_LAW_RULE,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "order": order,
                "facts": facts,
                "record": tagged(record or "Nothing has been argued yet.", "history"),
                "submission": tagged(submission, "user_argument"),
            }
        )
    except Exception as e:
        logger.exception("Error holding the enforcement hearing")
        raise LLMGenerationError("Failed to hold the enforcement hearing") from e
    return parse_enforcement(reply, kind)


# The negotiator score: each factor 0-100 from the analysis, weighted.
FACTORS = {
    "terms": ("Terms won", 50),
    "closed": ("Deal closed", 25),
    "offers": ("Offers used", 15),
    "conditions": ("Conditions", 10),
}
_REVIEW = re.compile(r"<review>(.*?)(?:</review>|$)", re.DOTALL)


def tier(score: int) -> str:
    if score >= 85:
        return "Exceptional"
    if score >= 70:
        return "Strong"
    if score >= 40:
        return "Capable"
    return "Developing"


def parse_negotiation(text: str, keys: set[str]) -> NegotiationAnalysis:
    """The scores JSON, then the Markdown review; the score is the factors weighted."""
    text = strip_thinking(text)
    review = _REVIEW.search(text)
    if not review or not review.group(1).strip():
        raise LLMGenerationError("Negotiation analysis had no review")
    data = _json(text[: review.start()], "Negotiation analysis")
    try:
        factors = [
            ScoreFactor(
                key=key,  # type: ignore[arg-type]
                label=label,
                weight=weight,
                value=max(0, min(100, round(float(data["factors"][key]["value"])))),
                text=str(data["factors"][key]["text"]).strip()[:400],
            )
            for key, (label, weight) in FACTORS.items()
        ]
        score = round(sum(f.value * f.weight for f in factors) / 100)
        best = data.get("best")
        return NegotiationAnalysis(
            score=score,
            tier=tier(score),
            factors=factors,
            best=snap_terms(best, keys) if isinstance(best, dict) else None,
            best_text=str(data.get("best_text") or "").strip()[:600],
            call=data["call"],
            call_text=str(data["call_text"]).strip()[:600],
            notes=[
                CoachNote(kind=kind, text=str(data[kind]).strip()[:500])
                for kind in ("worked", "improve")
                if str(data.get(kind) or "").strip()
            ],
            review=review.group(1).strip(),
        )
    except (KeyError, TypeError, ValueError) as e:
        raise LLMGenerationError(f"Invalid negotiation analysis: {e}") from e


async def analyze_negotiation(
    *,
    title: str,
    client: str,
    profile: SettlementProfile,
    case_context: str,
    record: str,
    talks: str,
    ending: str,
) -> NegotiationAnalysis:
    """How the user negotiated, once the case is decided: the score, the best deal the
    other side would likely have taken, and whether settling beat fighting it out."""
    template = """NEGOTIATION ANALYSIS
You are a senior Indian criminal-law advocate mentoring a junior who acted for {client} in a simulated criminal case, {title}, and tried to settle it out of court with opposing counsel (an AI). The case is now decided. Judge how they negotiated, honestly and constructively, addressing them as "you".

{untrusted_text_rule}

THE ROUTE
{route}

CONDITIONS THAT COULD GO INTO THE TERMS (key: label, and whom it favours)
{conditions}

THE CASE
{case_context}

THE HEARING ON THE MERITS (what was argued in court, if anything)
{record}

THE TALKS (without prejudice; "You" is the user, "Opposing counsel" is the AI)
{talks}

HOW THE CASE ENDED
{ending}

WHAT TO JUDGE
1. How they negotiated: the opening offer and how well it was anchored, the size and order of each concession, whether they traded concessions or gave them away, what their notes said, and when they accepted or walked away.
2. The best deal on offer: from how opposing counsel moved and how strong each side's case was, the best terms opposing counsel would most likely still have agreed to. Be realistic, not a wish list. Compare them with the terms the user got, or the last terms on the table.
3. Settle or fight: given the evidence and the likely result on the merits (and, if the case went to judgment, the result it actually got), was negotiating the right call for the client rather than fighting the case in court? "right", "mixed" or "wrong".
4. Score each factor from 0 to 100:
   - terms (Terms won): how close the final terms, or the last terms on the table, came to the best deal on offer. 100 means they got all of it.
   - closed (Deal closed): whether a deal was reached and the court gave it effect. If talks failed, whether walking away was wise: a good walk-away can score well.
   - offers (Offers used): a strong anchor, few and well-sized moves, nothing conceded for free.
   - conditions (Conditions): the conditions favouring their client won, and those favouring the other side resisted.

Reply in exactly two parts. First, inside <scores></scores>, this JSON object:
{{"factors": {{"terms": {{"value": <0-100>, "text": "<one sentence>"}}, "closed": {{"value": <0-100>, "text": "<one sentence>"}}, "offers": {{"value": <0-100>, "text": "<one sentence>"}}, "conditions": {{"value": <0-100>, "text": "<one sentence>"}}}}, "best": {{"amount": <rupees>, "instalments": 1 | 2 | 3 | 4 | 6, "months": 3 | 6 | 9 | 12 | 18, "interest": <per cent a year>, "conditions": ["<condition key>"]}}, "best_text": "<one or two sentences: why opposing counsel would have taken these terms>", "call": "right" | "mixed" | "wrong", "call_text": "<one or two sentences>", "worked": "<one thing that worked>", "improve": "<the one thing to do better>"}}
Then, inside <review></review>, the full review in Markdown with these sections:
### How you negotiated
### The best deal on offer
### Settle or fight
### What to do differently
End with three to five numbered points. Quote the user's offers and notes. Write amounts in rupees with Indian digit grouping (₹42,00,000)."""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("analyzer")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "title": title or "the case",
                "client": client,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "route": f"{profile.title} ({profile.court}). {profile.must} {profile.must_detail}",
                "conditions": "\n".join(
                    f"- {c.key}: {c.label} (favours the {c.favours})"
                    for c in profile.conditions
                )
                or "None.",
                "case_context": case_context,
                "record": tagged(record or "Nothing was argued.", "history"),
                "talks": tagged(talks, "history"),
                "ending": ending,
            }
        )
    except Exception as e:
        logger.exception("Error analysing the negotiation")
        raise LLMGenerationError("Failed to analyse the negotiation") from e
    return parse_negotiation(reply, {c.key for c in profile.conditions})
