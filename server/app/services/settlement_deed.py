# app/services/settlement_deed.py
"""The compromise deed, or the plea-bargaining report, drawn up from the agreed terms.

A template, not a model call: the condition clauses and the route were already written
when the case's route was worked out, so drafting can't fail half way through.
"""

import re
from datetime import date, timedelta

from app.models.case import Case, SettlementProfile, SettlementTerms
from app.services.llm.settlement import inr

TITLE = {
    "quash": "Compromise Deed",
    "compound": "Compromise Deed",
    "plea": "Report of Mutually Satisfactory Disposition",
}
FILE_LABEL = {
    "quash": "File joint application · § 528",
    "compound": "File compounding application · § 359",
    "plea": "Submit the report · § 292",
}
HEARING_GAP = timedelta(days=12)  # from filing to the hearing


def _rupees(amount: int) -> str:
    return inr(amount).replace("Rs. ", "₹")


def _names(people: list[str]) -> str:
    """ "A", "A and B", "A, B and C", or "A, B and 9 others"."""
    if len(people) <= 3:
        return " and ".join(filter(None, [", ".join(people[:-1]), people[-1]]))
    return f"{people[0]}, {people[1]} and {len(people) - 2} others"


def case_numbers(text: str) -> str:
    """ "CRL.M.C. No. 1234/2026 · FIR No. 41/2025", from the petition."""
    case_no = re.search(
        r"CASE NO\.?:?\**\s*:?\s*(.+?)\**\s*$", text, re.IGNORECASE | re.MULTILINE
    )
    fir = re.search(r"FIR No\.?\s*([\w/.-]*\d[\w/.-]*)", text, re.IGNORECASE)
    parts = []
    if case_no:
        parts.append(case_no.group(1).strip(" *"))
    if fir:
        parts.append(f"FIR No. {fir.group(1)}")
    return " · ".join(parts)


def deed(case: Case, profile: SettlementProfile, terms: SettlementTerms) -> dict:
    """The document both sides sign: header, title, parties, clauses and signatories."""
    route = profile.route
    plea = route == "plea"
    court = profile.court.split("·")[-1].strip() or "the Court"
    complainants = profile.complainants or ["the complainant"]
    many = len(complainants) > 1
    who = "the complainants" if many else "the complainant"

    if plea:
        parties = (
            f"Prepared after a meeting of the accused {profile.accused}, "
            f"{who} {_names(complainants)}, "
            "the public prosecutor and the investigating officer."
        )
    else:
        parties = (
            f"Made between {profile.accused} (the accused) and {_names(complainants)} "
            f"({who})."
        )

    clauses = []
    if plea:
        sections = (
            ", ".join(o.section for o in profile.offences) or "the offences charged"
        )
        clauses.append(f"The accused pleads guilty to the offences under {sections}.")
    if terms.amount:
        schedule = (
            "in one payment"
            if terms.instalments == 1
            else f"in {terms.instalments} equal instalments"
        )
        interest = (
            f"with interest at {terms.interest:g}% a year"
            if terms.interest
            else "without interest"
        )
        clauses.append(
            f"The accused shall pay {who} {_rupees(terms.amount)}"
            f"{' as compensation' if plea else ''} {schedule} within {terms.months} "
            f"months of signing, {interest}."
        )
    clauses += [c.clause for c in profile.conditions if c.key in terms.conditions]
    if route == "quash":
        clauses.append(
            "The parties shall jointly ask this Court, under section 528 BNSS, to quash "
            "the FIR and all proceedings arising from it on the basis of this compromise."
        )
    elif route == "compound":
        sections = " and ".join(o.section for o in profile.offences)
        clauses.append(
            f"{who.capitalize()} shall apply to this Court under section 359 BNSS to "
            f"compound the offences under {sections}, with the Court's permission."
        )
    else:
        clauses.append(
            "The parties ask this Court to dispose of the case under section 293 BNSS "
            "on these terms."
        )

    # Who signs, and on which side of the table: the user signs for their client.
    accused_is_user = case.user_role.value == profile.accused_side
    side = {True: "user", False: "other"}
    signatories = [
        {"name": profile.accused, "role": "Accused", "side": side[accused_is_user]}
    ]
    signatories += [
        {
            "name": name,
            "role": (
                f"Complainant {i} of {len(complainants)}" if many else "Complainant"
            ),
            "side": side[not accused_is_user],
        }
        for i, name in enumerate(complainants, 1)
    ]
    if plea:
        signatories += [
            {
                "name": profile.prosecutor or "Public Prosecutor",
                "role": "Public prosecutor",
                "side": "other",
            },
            {
                "name": profile.officer or "Investigating Officer",
                "role": "Investigating officer",
                "side": "other",
            },
        ]

    return {
        "title": TITLE[route],
        "header": [f"In the {court}", case_numbers(case.details) or case.title],
        "parties": parties,
        "clauses": clauses,
        "signatories": signatories,
        "file_label": FILE_LABEL[route],
    }


def hearing_after(filed: date) -> date:
    """The listing date: twelve days on, moved to the Monday when it falls on a weekend."""
    day = filed + HEARING_GAP
    return day + timedelta(days=(7 - day.weekday()) % 7 if day.weekday() >= 5 else 0)
