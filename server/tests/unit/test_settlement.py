"""Settlement reply parsing, and keeping settlement talks away from the merits."""

import ast
import json
from pathlib import Path

import pytest

from app.models.case import (
    Settlement,
    SettlementCondition,
    SettlementEntry,
    SettlementStatus,
    SettlementTerms,
)
from app.services.llm.settlement import (
    format_negotiation,
    inr,
    parse_compromise_ruling,
    parse_offer_reply,
    parse_profile,
)
from app.utils.llm import LLMGenerationError

APP = Path(__file__).resolve().parents[2] / "app"
# The only retrieval that may read settlement talks: the case analysis.
MAY_READ_SETTLEMENT = {APP / "routes" / "case_analysis.py"}

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


def test_parses_a_compromise_ruling():
    result = parse_compromise_ruling(
        '<think>x</think><ruling>{"accepted": true, '
        '"ruling": "The FIR is quashed on the compromise."}</ruling>\n'
        "<order>\n**ORDER**\n1. Quashed.\n</order>"
    )

    assert result.accepted
    assert result.order == "**ORDER**\n1. Quashed."


def test_tolerates_an_unclosed_order():
    result = parse_compromise_ruling(
        '<ruling>{"accepted": false, "ruling": "Refused."}'
        "</ruling><order>**ORDER**\n1. Not accepted."
    )

    assert not result.accepted
    assert result.order.endswith("Not accepted.")


@pytest.mark.parametrize(
    "text",
    [
        "Quashed.",
        '<ruling>{"ruling": "Quashed."}</ruling><order>O</order>',
        '<ruling>{"accepted": false, "ruling": "No."}</ruling><order>  </order>',
        "<ruling>not json</ruling><order>O</order>",
    ],
)
def test_rejects_bad_compromise_rulings(text):
    with pytest.raises(LLMGenerationError):
        parse_compromise_ruling(text)


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
