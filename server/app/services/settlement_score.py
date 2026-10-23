# app/services/settlement_score.py
"""How well the user negotiated one attempt, out of 100.

Terms won 50%, deal closed 25%, offers used 15%, conditions 10%. Deterministic, so
the same talks always score the same; only the two coaching notes come from a model.
"""

from typing import Literal

from app.models.case import (
    NegotiationScore,
    ScoreFactor,
    Settlement,
    SettlementProfile,
    SettlementTerms,
)
from app.services.llm.settlement import inr

Outcome = Literal["granted", "refused", "adjourned"] | None

CLOSED = {"granted": 100, "refused": 60, "adjourned": 50, None: 0}
CLOSED_TEXT = {
    "granted": "The court accepted the settlement.",
    "refused": "Terms were agreed, but the court refused to act on them.",
    "adjourned": "Terms were agreed, but the court put the matter off.",
    None: "Talks ended without a deal.",
}
OFFERS = {0: 100, 1: 100, 2: 70, 3: 40}
NTH = {1: "first", 2: "second", 3: "third"}


def tier(score: int) -> str:
    if score >= 85:
        return "Exceptional"
    if score >= 70:
        return "Strong"
    if score >= 40:
        return "Capable"
    return "Developing"


def summary(t: SettlementTerms) -> str:
    interest = f"at {t.interest:g}%" if t.interest else "without interest"
    return f"{inr(t.amount).replace('Rs. ', '₹')} over {t.months} months {interest}"


def terms_won(
    theirs: SettlementTerms | None,
    mine: SettlementTerms | None,
    final: SettlementTerms | None,
) -> int:
    """How far the final terms moved from the other side's first offer toward the
    user's first offer, averaged over the terms the two first offers differed on."""
    if final is None or mine is None:
        return 0
    if theirs is None:  # they took the user's first offer as it stood
        return 100
    moves = []
    for key in ("amount", "instalments", "months", "interest"):
        a, b, f = getattr(theirs, key), getattr(mine, key), getattr(final, key)
        if a != b:
            moves.append(min(1.0, max(0.0, (f - a) / (b - a))))
    return round(100 * sum(moves) / len(moves)) if moves else 100


def score(
    attempt: Settlement,
    profile: SettlementProfile,
    user_is_accused: bool,
    outcome: Outcome,
) -> NegotiationScore:
    entries = attempt.entries
    theirs = next((e.terms for e in entries if e.by == "ai" and e.terms), None)
    mine = next((e.terms for e in entries if e.by == "user" and e.terms), None)
    final = attempt.agreed or attempt.last_terms("ai")
    offers = attempt.user_offers()
    client = "accused" if user_is_accused else "complainants"
    them = "The complainants" if user_is_accused else "The accused"
    deal = attempt.agreed is not None

    if theirs and final:
        terms_text = (
            f"{them} opened at {summary(theirs)}. "
            f"{'The deal ended' if deal else 'Their last offer was'} at {summary(final)}."
        )
    elif final:
        terms_text = f"They took your first offer: {summary(final)}."
    else:
        terms_text = "No terms were put on the table."

    if not deal:
        offers_text = (
            f"You made {offers} offer{'' if offers == 1 else 's'} before talks ended."
        )
    elif offers == 0:
        offers_text = "You accepted their opening terms."
    else:
        offers_text = f"Terms were agreed on your {NTH.get(offers, str(offers))} offer."

    favourable = {c.key for c in profile.conditions if c.favours == client}
    got = favourable & set(final.conditions if final else [])
    conditions_text = (
        f"{len(got)} of the {len(favourable)} conditions that favour your client "
        "are in the terms."
        if favourable
        else "No condition on the table favoured your client."
    )

    factors = [
        ScoreFactor(
            key="terms",
            label="Terms won",
            weight=50,
            value=terms_won(theirs, mine, final),
            text=terms_text,
        ),
        ScoreFactor(
            key="closed",
            label="Deal closed",
            weight=25,
            value=CLOSED[outcome] if deal else 0,
            text=CLOSED_TEXT[outcome] if deal else CLOSED_TEXT[None],
        ),
        ScoreFactor(
            key="offers",
            label="Offers used",
            weight=15,
            value=OFFERS.get(offers, 40),
            text=offers_text,
        ),
        ScoreFactor(
            key="conditions",
            label="Conditions",
            weight=10,
            value=round(100 * len(got) / len(favourable)) if favourable else 100,
            text=conditions_text,
        ),
    ]
    total = round(sum(f.value * f.weight for f in factors) / 100)
    return NegotiationScore(score=total, tier=tier(total), factors=factors)
