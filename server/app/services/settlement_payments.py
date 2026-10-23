# app/services/settlement_payments.py
"""Instalments owed under a settlement order, on real dates.

Nothing runs on a timer: whether an instalment is paid, due or missed is worked out
each time it is read, from its due date and today.
"""

import calendar
import random
from datetime import date, timedelta
from typing import Literal

from app.models.case import Payment, SettlementTerms

FIRST_DUE = timedelta(days=14)  # the first instalment, from the order
DEFAULT_CHANCE = 0.25  # how often the AI side misses one instalment

Status = Literal["paid", "late", "due", "upcoming", "missed"]

# The complainants' answer to a missed instalment on each route: recall the quashing
# order, sue on the deed after a legal notice, or have the court recover it as a fine.
REMEDY: dict[str, Literal["recall", "notice", "recover"]] = {
    "quash": "recall",
    "compound": "notice",
    "plea": "recover",
}


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def schedule(terms: SettlementTerms, ordered: date) -> list[Payment]:
    """Equal instalments: the first two weeks after the order, the rest spread over the
    agreed months; simple interest for the whole term is added to the last."""
    n = terms.instalments
    base = terms.amount // n
    interest = round(terms.amount * terms.interest / 100 * terms.months / 12)
    payments = []
    for i in range(n):
        last = i == n - 1
        amount = base + (terms.amount - base * n if last else 0)
        due = (
            ordered + FIRST_DUE
            if i == 0
            else add_months(ordered, round(terms.months * i / (n - 1)))
        )
        payments.append(Payment(amount=amount + (interest if last else 0), due=due))
    return payments


def default_on(cnr: str, count: int) -> int | None:
    """The instalment the AI side will miss, if any: drawn once, the same for a case.

    ponytail: a fixed chance; weigh the accused's means and conduct if it feels arbitrary.
    """
    draw = random.Random(f"{cnr}:payments")
    if count < 2 or draw.random() >= DEFAULT_CHANCE:
        return None
    return draw.randrange(1, count)


def status(
    payment: Payment, index: int, user_pays: bool, defaults_on: int | None, today: date
) -> Status:
    if payment.paid_at:
        return "late" if payment.paid_at.date() > payment.due else "paid"
    if payment.due > today:
        return "upcoming"
    if user_pays:
        return "missed" if payment.due < today else "due"
    # The AI side pays on the day, except the instalment it defaults on.
    return "missed" if index == defaults_on else "paid"
