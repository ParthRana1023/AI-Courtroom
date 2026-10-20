"""Settlement reply parsing, and keeping settlement talks away from the merits."""

import ast
from pathlib import Path

import pytest

from app.models.case import Roles, Settlement, SettlementOffer, SettlementStatus
from app.services.llm.settlement import format_negotiation, parse_offer_reply
from app.utils.llm import LLMGenerationError

APP = Path(__file__).resolve().parents[2] / "app"
# The only retrieval that may read settlement talks: the case analysis.
MAY_READ_SETTLEMENT = {APP / "routes" / "case_analysis.py"}


def test_parses_a_counter():
    result = parse_offer_reply(
        '<think>hmm</think>{"decision": "counter", "terms": " Rs. 2 lakh. ", '
        '"compensation": 200000, "message": "Too low."}'
    )

    assert result.decision == "counter"
    assert result.terms == "Rs. 2 lakh."
    assert result.compensation == 200000


@pytest.mark.parametrize(
    "text",
    [
        "no json here",
        '{"decision": "maybe", "message": "Hm."}',
        '{"decision": "counter", "message": "Hm."}',  # a counter needs terms
        '{"decision": "accept", "message": "Yes.", "compensation": -1}',
    ],
)
def test_rejects_bad_replies(text):
    with pytest.raises(LLMGenerationError):
        parse_offer_reply(text)


def test_formats_the_talks_in_order():
    attempt = Settlement(
        status=SettlementStatus.NEGOTIATING,
        offers=[
            SettlementOffer(
                side=Roles.PLAINTIFF,
                terms="An apology.",
                compensation=50000,
                response="countered",
                reply="Not enough.",
            ),
            SettlementOffer(side=Roles.DEFENDANT, terms="An apology and Rs. 1 lakh."),
        ],
    )

    text = format_negotiation([attempt], {"plaintiff": "User", "defendant": "AI"})

    assert text == (
        "Attempt 1 (negotiating):\n"
        "- User offered: An apology. Compensation: Rs. 50,000.\n"
        "  Answer: countered (Not enough.)\n"
        "- AI offered: An apology and Rs. 1 lakh."
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
