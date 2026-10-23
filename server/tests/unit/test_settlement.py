"""Settlement reply parsing, and keeping settlement talks away from the merits."""

import ast
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from app.models.case import (
    Payment,
    PaymentDraw,
    PaymentPlan,
    Settlement,
    SettlementCondition,
    SettlementEntry,
    SettlementProfile,
    SettlementStatus,
    SettlementTerms,
)
from app.services.llm.settlement import (
    format_negotiation,
    hear_enforcement,
    inr,
    parse_enforcement,
    parse_hearing,
    parse_offer_reply,
    parse_profile,
)
from app.services.settlement_deed import owed_paragraph
from app.services.settlement_payments import (
    day_schedule,
    default_on,
    describe,
    draw,
    schedule,
    timeline,
)
from app.services.settlement_payments import status as payment_status
from app.utils.llm import LLMGenerationError

APP = Path(__file__).resolve().parents[2] / "app"
# The only retrieval that may read settlement talks: the case analysis.
MAY_READ_SETTLEMENT = {APP / "routes" / "case_analysis.py"}  # the negotiation analysis

KEYS = {"deposit", "apology"}
CONDITIONS = [
    SettlementCondition(
        key="deposit",
        label="First instalment deposited in court",
        short="Deposit in court",
        clause="The first instalment shall be deposited in court.",
        favours="complainants",
    ),
    SettlementCondition(
        key="apology",
        label="Written apology to each complainant",
        short="Written apology",
        clause="The accused shall apologise in writing.",
        favours="complainants",
    ),
]


@pytest.mark.parametrize(
    ("amount", "text"),
    [
        (0, "Rs. 0"),
        (999, "Rs. 999"),
        (50000, "Rs. 50,000"),
        (4200000, "Rs. 42,00,000"),
        (123456789, "Rs. 12,34,56,789"),
    ],
)
def test_rupees_use_indian_grouping(amount, text):
    assert inr(amount) == text


def test_a_counter_is_snapped_to_the_desk_choices():
    result = parse_offer_reply(
        '<think>hmm</think>{"decision": "counter", "terms": {"amount": 4234567, '
        '"instalments": 5, "months": 10, "interest": 30, "conditions": '
        '["apology", "made-up", "apology"]}, "message": " Too low. "}',
        KEYS,
    )

    assert result.decision == "counter" and result.message == "Too low."
    assert result.terms == SettlementTerms(
        amount=4235000, instalments=4, months=9, interest=18, conditions=["apology"]
    )


@pytest.mark.parametrize(
    "text",
    [
        "no json here",
        '{"decision": "maybe", "message": "Hm."}',
        '{"decision": "counter", "message": "Hm."}',  # a counter needs terms
        '{"decision": "counter", "terms": {"amount": "lots"}, "message": "Hm."}',
    ],
)
def test_rejects_bad_replies(text):
    with pytest.raises(LLMGenerationError):
        parse_offer_reply(text, KEYS)


def profile_json(**over):
    data = {
        "route": "quash",
        "title": "Quashing on compromise",
        "court": "§ 528 BNSS · High Court of Delhi",
        "offences": [{"section": "§ 318(4)", "title": "Cheating", "note": "Private."}],
        "must": "Both must sign.",
        "must_detail": "No part-settlement.",
        "footnote": "Compounding needs a trial.",
        "closed": [],
        "conditions": [c.model_dump() for c in CONDITIONS],
        "accused": "Raghav Menon",
        "accused_side": "plaintiff",
        "complainants": ["Priya Khanna"],
        "claim": 4200000,
    }
    return json.dumps(data | over)


def test_parses_an_open_route_with_unique_condition_keys():
    conds = [c.model_dump() for c in CONDITIONS]
    conds[1]["key"] = "Deposit!"  # slugged, then made unique
    profile = parse_profile(profile_json(conditions=conds))

    assert profile.route == "quash" and profile.claim == 4200000
    assert [c.key for c in profile.conditions] == ["deposit", "deposit-2"]


def test_a_closed_route_drops_conditions():
    profile = parse_profile(
        profile_json(
            route="none",
            closed=[{"section": "§ 528", "title": "Quashing", "note": "No petition."}],
        )
    )

    assert profile.route == "none" and profile.conditions == []


@pytest.mark.parametrize(
    "over",
    [
        {"route": "none", "closed": []},  # closed without a reason
        {"offences": []},
        {"complainants": []},
        {"conditions": [CONDITIONS[0].model_dump()]},  # fewer than two
        {"route": "bail"},
    ],
)
def test_rejects_bad_routes(over):
    with pytest.raises(LLMGenerationError):
        parse_profile(profile_json(**over))


def hearing_json(**over):
    data = {
        "judge": "R. K. Mehta",
        "lines": [
            {
                "kind": "speech",
                "role": "state",
                "who": "APP for the State",
                "tag": "No objection",
                "text": "No objection.",
            },
            {
                "kind": "answer",
                "role": "complainant",
                "who": "Asha Rao",
                "text": "Yes, My Lord.",
            },
        ],
        "checks": [
            {
                "label": "Every complainant agreed freely",
                "state": "ok",
                "text": "Confirmed.",
            }
        ],
        "outcome": "granted",
        "ruling": " The FIR is quashed. ",
        "order": ["The FIR is quashed."],
        "next_date": None,
    }
    return json.dumps(data | over)


def test_parses_a_hearing():
    record = parse_hearing("<think>x</think>" + hearing_json())

    assert record.outcome == "granted" and record.judge == "R. K. Mehta"
    assert record.ruling == "The FIR is quashed."
    assert record.lines[0].tag == "No objection"
    assert record.lines[1].role == "complainant"


@pytest.mark.parametrize(
    "over",
    [
        {"outcome": "adjourned"},  # no next date
        {"outcome": "dismissed"},
        {"order": []},
        {"lines": []},
        {"judge": " "},
    ],
)
def test_rejects_bad_hearings(over):
    with pytest.raises(LLMGenerationError):
        parse_hearing(hearing_json(**over))


@pytest.mark.parametrize(
    "reply",
    [
        '{"judge": "S. Iyer", "lines": [], "outcome": "time", "ruling": "x", "order": []}',
        '{"judge": "S. Iyer", "outcome": "acquit"}',
    ],
)
def test_an_enforcement_hearing_needs_a_record_and_a_lawful_order(reply):
    with pytest.raises(LLMGenerationError):
        parse_enforcement(reply, "contempt")


async def test_a_failed_enforcement_model_call_is_reported(fake_llm):
    fake_llm.error = RuntimeError("down")
    profile = SettlementProfile(route="quash", court="§ 528 BNSS · High Court")

    with pytest.raises(LLMGenerationError):
        await hear_enforcement(
            profile, "contempt", "T", "defendant", False, "", "", "x"
        )


def test_an_adjournment_carries_its_next_date():
    record = parse_hearing(hearing_json(outcome="adjourned", next_date="2026-11-20"))

    assert record.next_date == date(2026, 11, 20)


def test_instalments_fall_on_real_dates_with_interest_on_the_last():
    terms = SettlementTerms(amount=4200000, instalments=3, months=6, interest=9)

    plan = schedule(terms, date(2026, 11, 4))

    assert [p.due for p in plan] == [
        date(2026, 11, 18),
        date(2027, 2, 4),
        date(2027, 5, 4),
    ]
    assert [p.amount for p in plan] == [1400000, 1400000, 1400000 + 189000]


def test_one_payment_is_due_in_two_weeks():
    plan = schedule(
        SettlementTerms(amount=100000, instalments=1, months=3, interest=0),
        date(2026, 1, 31),
    )

    assert [(p.amount, p.due) for p in plan] == [(100000, date(2026, 2, 14))]


@pytest.mark.parametrize(
    ("paid", "due", "user_pays", "index", "expected"),
    [
        (None, date(2027, 1, 1), True, 0, "upcoming"),
        (None, date(2026, 12, 1), True, 0, "due"),
        (None, date(2026, 11, 1), True, 0, "missed"),
        (datetime(2026, 11, 5, tzinfo=UTC), date(2026, 11, 1), True, 0, "late"),
        (datetime(2026, 10, 30, tzinfo=UTC), date(2026, 11, 1), True, 0, "paid"),
        (None, date(2026, 11, 1), False, 0, "paid"),  # the AI side pays on time
        (None, date(2026, 11, 1), False, 1, "missed"),  # except where it defaults
    ],
)
def test_payment_status_is_worked_out_on_read(paid, due, user_pays, index, expected):
    payment = Payment(amount=1, due=due, paid_at=paid)

    assert payment_status(payment, index, user_pays, 1, date(2026, 12, 1)) == expected


def test_the_same_case_always_defaults_the_same_way():
    draws = {default_on("DLND010004212026", 3) for _ in range(5)}

    assert len(draws) == 1
    assert default_on("DLND010004212026", 1) is None


def test_instalments_fall_a_day_apart_from_the_order():
    terms = SettlementTerms(amount=4200000, instalments=3, months=6, interest=9)

    plan = day_schedule(terms, date(2026, 11, 4))

    assert [p.due for p in plan] == [
        date(2026, 11, 5),
        date(2026, 11, 6),
        date(2026, 11, 7),
    ]
    assert [p.amount for p in plan] == [1400000, 1400000, 1400000 + 189000]
    assert day_schedule(terms.model_copy(update={"amount": 0}), date(2026, 11, 4)) == []


def test_draws_follow_the_accused_reliability():
    sure, never = draw("DLND010004212026", 4, 1.0), draw("DLND010004212026", 4, 0.0)

    assert all(d.on_time and d.cures for d in sure.draws) and sure.complies
    assert not any(d.on_time or d.cures for d in never.draws) and not never.complies
    assert draw("DLND010004212026", 4, 0.6) == draw("DLND010004212026", 4, 0.6)
    assert sure.reliability == 1.0 and len(sure.draws) == 4


ORDERED = date(2026, 11, 4)
THREE = SettlementTerms(amount=300000, instalments=3, months=6, interest=0)


def day(n):
    return ORDERED + timedelta(days=n)


def plan_of(*draws, complies=True):
    return PaymentPlan(
        reliability=0.5,
        draws=[PaymentDraw(on_time=o, cures=c) for o, c in draws],
        complies=complies,
    )


# On time; missed then paid within notice; missed and never paid.
MIXED = plan_of((True, False), (False, True), (False, False))


@pytest.mark.parametrize(
    ("today", "statuses", "stage"),
    [
        (0, ["upcoming", "upcoming", "upcoming"], "paying"),
        (1, ["paid", "upcoming", "upcoming"], "paying"),
        (2, ["paid", "due", "upcoming"], "paying"),
        (3, ["paid", "late", "due"], "paying"),
        (4, ["paid", "late", "missed"], "notice"),
        (5, ["paid", "late", "defaulted"], "defaulted"),
    ],
)
def test_the_timeline_as_days_pass(today, statuses, stage):
    line = timeline(day_schedule(THREE, ORDERED), MIXED, day(today))

    assert [r.status for r in line.rows] == statuses
    assert line.stage == stage


def test_a_missed_instalment_shows_its_notice_and_a_cure_its_day():
    line = timeline(day_schedule(THREE, ORDERED), MIXED, day(4))

    assert [r.paid_on for r in line.rows] == [day(1), day(3), None]
    assert line.rows[2].notice_until == day(4)
    assert line.defaulted is None and line.closed_on is None


def test_a_default_holds_up_the_rest():
    plan = plan_of((False, False), (True, True), (True, True))

    line = timeline(day_schedule(THREE, ORDERED), plan, day(9))

    assert [r.status for r in line.rows] == ["defaulted", "held", "held"]
    assert line.defaulted == 0 and line.stage == "defaulted"


def test_paying_every_instalment_closes_the_order():
    owed = day_schedule(THREE, ORDERED)
    owed[2].paid_at = datetime(2026, 11, 20, tzinfo=UTC)  # as the court directed
    plan = plan_of((True, True), (False, True), (False, False))

    line = timeline(owed, plan, day(30))

    assert [r.status for r in line.rows] == ["paid", "late", "late"]
    assert line.stage == "closed" and line.closed_on == date(2026, 11, 20)
    assert timeline([], plan_of(), day(1)).stage == "closed"


def test_the_client_sees_the_timeline_not_the_draws():
    view = describe(
        Settlement(payments=day_schedule(THREE, ORDERED), plan=MIXED), day(4)
    )

    assert view["pace"] == "days" and view["stage"] == "notice"
    assert view["closed_on"] is None
    assert view["payments"][2] == {
        "amount": 100000,
        "due": "2026-11-07",
        "paid_at": None,
        "remedy": None,
        "remedy_at": None,
        "status": "missed",
        "paid_on": None,
        "notice_until": "2026-11-08",
    }
    assert "draws" not in str(view) and "reliability" not in str(view)


@pytest.mark.parametrize(
    ("route", "complainants", "expected"),
    [
        ("quash", ["A"], "the complainant shall be at liberty to move this Court."),
        ("compound", ["A", "B"], "the complainants shall be at liberty to recover"),
        ("plea", ["A"], "fine under section 461 BNSS."),
    ],
)
def test_the_order_states_the_remedy_for_default(route, complainants, expected):
    profile = SettlementProfile(route=route, complainants=complainants)

    assert expected in owed_paragraph(profile)


def terms(amount, conditions=()):
    return SettlementTerms(
        amount=amount, instalments=3, months=6, interest=0, conditions=list(conditions)
    )


def test_formats_the_talks_in_order():
    attempt = Settlement(
        status=SettlementStatus.REJECTED,
        entries=[
            SettlementEntry(
                by="user",
                kind="offer",
                terms=SettlementTerms(
                    amount=50000,
                    instalments=1,
                    months=3,
                    interest=0,
                    conditions=["apology"],
                ),
            ),
            SettlementEntry(
                by="ai",
                kind="counter",
                terms=SettlementTerms(
                    amount=100000, instalments=2, months=6, interest=9
                ),
                note="Not enough.",
            ),
            SettlementEntry(by="ai", kind="refuse"),
        ],
    )

    text = format_negotiation([attempt], {"user": "User", "ai": "AI"}, CONDITIONS)

    assert text == (
        "Attempt 1 (rejected):\n"
        "- User offered: Rs. 50,000 in one payment within 3 months, without interest. "
        "Conditions: Written apology to each complainant.\n"
        "- AI countered: Rs. 1,00,000 in 2 instalments within 6 months, with interest "
        'at 9% a year. Conditions: none. Said: "Not enough."\n'
        "- AI refused and ended the talks"
    )


def _retrievals():
    for path in APP.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and getattr(node.func, "id", getattr(node.func, "attr", None))
                == "retrieve_case_context"
            ):
                yield path, node


def test_settlement_talks_reach_only_the_case_analysis():
    """Without prejudice: every retrieval names its source types, and only the
    case analysis asks for settlement talks."""
    calls = list(_retrievals())
    assert calls
    for path, call in calls:
        where = f"{path.relative_to(APP)}:{call.lineno}"
        source_types = next(
            (k.value for k in call.keywords if k.arg == "source_types"), None
        )
        assert isinstance(source_types, ast.List), f"{where} must list source_types"
        names = {getattr(item, "value", None) for item in source_types.elts}
        if path not in MAY_READ_SETTLEMENT:
            assert "settlement" not in names, f"{where} must not read settlement talks"
