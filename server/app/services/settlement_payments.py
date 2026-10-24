# app/services/settlement_payments.py
"""Instalments owed under a settlement order, and how the accused meets them.

Nothing runs on a timer: whether an instalment is paid, due or missed is worked out
each time it is read, from its due date, today and the draws made when the order was
passed. The accused pays on their own (the user's client when the user defends), one
instalment a day, each drawn against their payment reliability.

As in practice, a missed instalment is not the end of the deal: the deed gives notice
and a short time to pay. Only a default left uncured goes further (see REMEDY).
"""

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

from app.models.case import (
    Payment,
    PaymentDraw,
    PaymentPlan,
    Settlement,
    SettlementTerms,
)

# Simulated time: a day stands for the gap between instalments, and for the notice
# the deed gives after a missed one (fifteen days on paper).
PAY_EVERY = timedelta(days=1)
NOTICE = timedelta(days=1)
DEFAULT_RELIABILITY = 0.85  # when the accused's background gives no number

Status = Literal["paid", "late", "due", "upcoming", "missed", "defaulted", "held"]
Stage = Literal["paying", "notice", "defaulted", "closed"]

# The complainants' answer to a missed instalment on each route: recall the quashing
# order, sue on the deed after a legal notice, or have the court recover it as a fine.
REMEDY: dict[str, Literal["recall", "notice", "recover"]] = {
    "quash": "recall",
    "compound": "notice",
    "plea": "recover",
}


def amounts(terms: SettlementTerms) -> list[int]:
    """Equal instalments; simple interest for the whole term is added to the last."""
    n = terms.instalments
    base = terms.amount // n
    interest = round(terms.amount * terms.interest / 100 * terms.months / 12)
    return [base for _ in range(n - 1)] + [terms.amount - base * (n - 1) + interest]


def day_schedule(terms: SettlementTerms, ordered: date) -> list[Payment]:
    """One instalment a day from the day after the order. Nothing is owed when the
    terms carry no money."""
    if not terms.amount:
        return []
    return [
        Payment(amount=amount, due=ordered + PAY_EVERY * (i + 1))
        for i, amount in enumerate(amounts(terms))
    ]


def draw(count: int, reliability: float) -> PaymentPlan:
    """Every instalment and the court's direction, drawn once against the accused's
    reliability when the order is passed, and saved with it.

    From the OS's randomness, not a seed: the CNR is on screen and the code is public,
    so a seeded draw could be worked out ahead of time."""
    chance = random.SystemRandom()
    draws = [
        PaymentDraw(
            on_time=chance.random() < reliability, cures=chance.random() < reliability
        )
        for _ in range(count)
    ]
    return PaymentPlan(
        reliability=reliability, draws=draws, complies=chance.random() < reliability
    )


@dataclass
class Row:
    status: Status
    paid_on: date | None = None
    notice_until: date | None = None  # a missed instalment: the last day to pay it


@dataclass
class Timeline:
    rows: list[Row] = field(default_factory=list)
    stage: Stage = "closed"
    defaulted: int | None = None  # the instalment left unpaid after notice
    closed_on: date | None = None  # the day the last instalment was paid


def timeline(payments: list[Payment], plan: PaymentPlan, today: date) -> Timeline:
    """Where the accused stands on each instalment today, and overall.

    An instalment is due all its due day, whatever the draws: the day shows the
    outcome only once it is over. Then it is paid on that day, or missed and in notice
    until the notice runs out, and only after that paid late (cured) or defaulted, so
    nothing on screen gives the draws away early. A default holds up what wasn't paid
    by the time it took effect: what happens next is for the complainants and court.
    """
    out = Timeline(stage="paying")
    took_effect: date | None = None  # the last day of notice on the defaulted one
    for i, (payment, chance) in enumerate(zip(payments, plan.draws, strict=True)):
        last_day = payment.due + NOTICE
        if payment.paid_at:  # paid as the court directed
            paid = payment.paid_at.date()
            row = Row("late" if paid > payment.due else "paid", paid)
        elif took_effect is not None:
            paid_before = chance.on_time and payment.due <= took_effect
            row = Row("paid", payment.due) if paid_before else Row("held")
        elif today <= payment.due:
            row = Row("upcoming" if today < payment.due else "due")
        elif chance.on_time:
            row = Row("paid", payment.due)
        elif today <= last_day:
            row = Row("missed", notice_until=last_day)
            out.stage = "notice"
        elif chance.cures:
            row = Row("late", last_day)
        else:
            row = Row("defaulted")
            out.defaulted = i
            out.stage = "defaulted"
            took_effect = last_day
        out.rows.append(row)
    if all(r.status in ("paid", "late") for r in out.rows):
        out.stage = "closed"
        out.closed_on = max((r.paid_on for r in out.rows if r.paid_on), default=None)
    return out


def describe(attempt: Settlement, today: date) -> dict:
    """The timeline for the client, as JSON: each instalment's status and the day it
    was paid, the stage, and when the last was paid. Nothing of the draws.

    Once the complainants act on a default, the stage says how: "enforcement" while it
    is before this court, "punished" when the court sentenced the accused for contempt,
    "suit" when the rest is left to a suit on the deed in a civil court."""
    assert attempt.plan is not None
    payments = attempt.payments
    line = timeline(payments, attempt.plan, today)
    stage: str = line.stage
    enforcement = attempt.enforcement
    if enforcement and line.stage != "closed":
        if enforcement.result == "punished":
            stage = "punished"
        elif enforcement.kind == "suit" or enforcement.result == "civil":
            stage = "suit"
        else:
            stage = "enforcement"
    return {
        "pace": "days",
        "stage": stage,
        "closed_on": line.closed_on and line.closed_on.isoformat(),
        "payments": [
            payment.model_dump(mode="json")
            | {
                "status": row.status,
                "paid_on": row.paid_on and row.paid_on.isoformat(),
                "notice_until": row.notice_until and row.notice_until.isoformat(),
            }
            for payment, row in zip(payments, line.rows, strict=True)
        ],
    }


def status(
    payment: Payment, index: int, user_pays: bool, defaults_on: int | None, today: date
) -> Status:
    """Before plans: the user deposits for the accused, or the AI side pays on the
    day except the instalment it defaults on."""
    if payment.paid_at:
        return "late" if payment.paid_at.date() > payment.due else "paid"
    if payment.due > today:
        return "upcoming"
    if user_pays:
        return "missed" if payment.due < today else "due"
    return "missed" if index == defaults_on else "paid"
