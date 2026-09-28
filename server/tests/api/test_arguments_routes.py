"""Tests for argument submission and closing statements."""

import pytest

from app import messages
from app.models.case import (
    ArgumentItem,
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    Roles,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.models.rate_limit import RateLimitEntry
from app.routes import arguments
from tests.helpers import boom, reload


async def usage_count(user) -> int:
    return await RateLimitEntry.find(
        RateLimitEntry.user_id == str(user.id),
        RateLimitEntry.rate_limiter_type == "argument_rate_limiter",
    ).count()


def arg(content, role, user_id=None, type_="user"):
    return ArgumentItem(type=type_, content=content, role=Roles(role), user_id=user_id)


def event(type_, content=None, role=None, **extra):
    return CourtroomProceedingsEvent(
        type=type_, content=content, speaker_role=role, **extra
    )


# ---------------------------------------------------------------------------
# submit_argument: guards
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "role, overrides, status",
    [
        ("judge", {}, 400),
        ("not_started", {"user_role": Roles.NOT_STARTED}, 400),
        ("defendant", {}, 403),  # assigned role is plaintiff
        ("plaintiff", {"status": CaseStatus.RESOLVED}, 400),
    ],
)
async def test_submit_argument_rejections(
    client, auth_headers, courtroom_case, role, overrides, status
):
    case = await courtroom_case("plaintiff", **overrides)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": role, "argument": "x"},
    )

    assert response.status_code == status


async def test_closing_statement_needs_court_in_session(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case(status=CaseStatus.ADJOURNED)

    response = await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "In conclusion"},
    )

    assert response.status_code == 409


async def test_defendant_cannot_go_before_plaintiff(
    client, auth_headers, courtroom_case, user
):
    case = await courtroom_case(
        "defendant", defendant_arguments=[arg("earlier", "defendant")]
    )

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "defendant", "argument": "x"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "The plaintiff must go first in the case."


async def test_cannot_switch_roles(client, auth_headers, courtroom_case, user):
    case = await courtroom_case(
        "plaintiff",
        user_role=Roles.NOT_STARTED,
        plaintiff_arguments=[arg("mine", "plaintiff", user_id=user.id)],
        defendant_arguments=[arg("ai", "defendant")],
    )

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "defendant", "argument": "x"},
    )

    assert response.status_code == 403
    assert "Cannot switch roles" in response.json()["detail"]


# ---------------------------------------------------------------------------
# submit_argument: first submission
# ---------------------------------------------------------------------------


async def test_first_argument_as_defendant_generates_ai_opening_and_counter(
    client, auth_headers, courtroom_case, user, fake_llm
):
    fake_llm.responses.extend(["AI plaintiff opening", "AI plaintiff counter"])
    case = await courtroom_case("defendant", status=CaseStatus.NOT_STARTED)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "defendant", "argument": "We deny it"},
    )

    assert response.json() == {
        "ai_opening_statement": "AI plaintiff opening",
        "ai_opening_role": "plaintiff",
        "ai_counter_argument": "AI plaintiff counter",
        "ai_counter_role": "plaintiff",
    }
    saved = await reload(case)
    assert [a.content for a in saved.plaintiff_arguments] == [
        "AI plaintiff opening",
        "AI plaintiff counter",
    ]
    assert [a.content for a in saved.defendant_arguments] == ["We deny it"]
    assert [e.type for e in saved.courtroom_proceedings] == [
        EventType.OPENING_STATEMENT,
        EventType.OPENING_STATEMENT,
        EventType.AI_ARGUMENT,
    ]
    assert saved.status == CaseStatus.ACTIVE
    assert await usage_count(user) == 1


async def test_first_argument_as_plaintiff_generates_defence_opening(
    client, auth_headers, courtroom_case, user, fake_llm
):
    fake_llm.responses.append("AI defence opening statement")
    case = await courtroom_case("plaintiff", status=CaseStatus.NOT_STARTED)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "Pay us"},
    )

    assert response.json() == {
        "ai_opening_statement": "AI defence opening statement",
        "ai_opening_role": "defendant",
    }
    saved = await reload(case)
    assert saved.plaintiff_arguments[0].user_id == user.id
    assert saved.defendant_arguments[0].content == "AI defence opening statement"
    assert saved.status == CaseStatus.ACTIVE


@pytest.mark.parametrize("user_role", ["plaintiff", "defendant"])
async def test_first_argument_save_failure_returns_500(
    client, auth_headers, courtroom_case, monkeypatch, user_role
):
    monkeypatch.setattr(arguments, "upsert_memory_item", boom)
    case = await courtroom_case(user_role)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": user_role, "argument": "x"},
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# submit_argument: regular turns and closing
# ---------------------------------------------------------------------------


@pytest.fixture
def in_progress(courtroom_case, user):
    async def _make(user_role="plaintiff", **overrides):
        ai_role = "defendant" if user_role == "plaintiff" else "plaintiff"
        sides = {
            f"{user_role}_arguments": [
                arg("user opening", user_role, user_id=user.id, type_="opening")
            ],
            f"{ai_role}_arguments": [arg("ai opening", ai_role, type_="opening")],
        }
        sides.update(overrides)
        return await courtroom_case(user_role, **sides)

    return _make


@pytest.mark.parametrize("user_role", ["plaintiff", "defendant"])
async def test_regular_argument_gets_ai_counter(
    client, auth_headers, in_progress, user, fake_llm, user_role
):
    ai_role = "defendant" if user_role == "plaintiff" else "plaintiff"
    fake_llm.responses.append("AI counter argument reply")
    case = await in_progress(user_role)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": user_role, "argument": "Second point"},
    )

    assert response.json() == {
        "ai_counter_argument": "AI counter argument reply",
        "ai_counter_role": ai_role,
    }
    saved = await reload(case)
    assert getattr(saved, f"{ai_role}_arguments")[-1].type == "counter"
    assert saved.courtroom_proceedings[-1].type == EventType.AI_ARGUMENT
    assert "Second point" in fake_llm.prompts[0]
    assert await usage_count(user) == 1


async def test_regular_argument_in_not_started_case_activates_it(
    client, auth_headers, in_progress
):
    case = await in_progress("plaintiff", status=CaseStatus.NOT_STARTED)

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "x"},
    )

    assert (await reload(case)).status == CaseStatus.ACTIVE


@pytest.mark.parametrize("user_role", ["plaintiff", "defendant"])
async def test_closing_argument_resolves_case(
    client, auth_headers, in_progress, fake_llm, user_role
):
    ai_role = "defendant" if user_role == "plaintiff" else "plaintiff"
    fake_llm.responses.append("AI closing. I rest my case here.")
    case = await in_progress(user_role)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": user_role, "argument": "My closing", "is_closing": True},
    )

    assert response.json()["ai_counter_argument"] == "AI closing. I rest my case here."
    saved = await reload(case)
    assert saved.status == CaseStatus.RESOLVED
    assert "closing" in [a.type for a in getattr(saved, f"{user_role}_arguments")]
    assert "AI closing. I rest my case here." in [
        a.content for a in getattr(saved, f"{ai_role}_arguments")
    ]


async def test_closing_argument_is_recorded_once(
    client, auth_headers, in_progress, fake_llm
):
    fake_llm.responses.append("AI closing statement text")
    case = await in_progress("plaintiff")

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "My closing", "is_closing": True},
    )

    saved = await reload(case)
    assert [a.content for a in saved.plaintiff_arguments].count("My closing") == 1
    assert [a.content for a in saved.defendant_arguments].count(
        "AI closing statement text"
    ) == 1


@pytest.mark.parametrize("is_closing", [False, True])
async def test_llm_failure_is_a_503_and_nothing_is_saved(
    client, auth_headers, in_progress, user, fake_llm, is_closing
):
    fake_llm.error = RuntimeError("provider down")
    case = await in_progress()

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "x", "is_closing": is_closing},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == messages.LLM_UNAVAILABLE
    saved = await reload(case)
    assert len(saved.plaintiff_arguments) == 1 and saved.status == CaseStatus.ACTIVE
    assert await usage_count(user) == 0


@pytest.mark.parametrize("user_role", ["plaintiff", "defendant"])
async def test_llm_failure_on_first_argument_is_a_503(
    client, auth_headers, courtroom_case, fake_llm, user_role
):
    fake_llm.error = RuntimeError("provider down")
    case = await courtroom_case(user_role)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": user_role, "argument": "x"},
    )

    assert response.status_code == 503
    assert (await reload(case)).plaintiff_arguments == []


async def test_regular_argument_save_failure_returns_500(
    client, auth_headers, in_progress, monkeypatch
):
    monkeypatch.setattr(arguments, "upsert_memory_item", boom)
    case = await in_progress()

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "x"},
    )

    assert response.status_code == 500


async def test_last_argument_of_the_day_announces_adjournment(
    client, auth_headers, in_progress, user, fake_llm
):
    from app.utils.rate_limiter import argument_rate_limiter

    for _ in range(argument_rate_limiter.requests - 1):
        await argument_rate_limiter.register_usage(str(user.id))
    fake_llm.responses.append("AI counter argument reply")
    case = await in_progress()

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "Final point for today"},
    )

    body = response.json()
    assert body["ai_counter_argument"] == "AI counter argument reply"
    assert body["court_adjourns"] is True
    assert "back in session in" in body["adjournment_message"]


async def test_argument_limit_is_enforced_by_server(
    client, auth_headers, in_progress, user
):
    from app.utils.rate_limiter import argument_rate_limiter

    for _ in range(argument_rate_limiter.requests):
        await argument_rate_limiter.register_usage(str(user.id))
    case = await in_progress()

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "x"},
    )

    assert response.status_code == 429


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def test_argument_history_lists_given_side_first():
    case = Case.model_construct(
        plaintiff_arguments=[arg("P1", "plaintiff"), arg("", "plaintiff")],
        defendant_arguments=[arg("D1", "defendant")],
    )

    assert arguments.argument_history(case, "defendant").splitlines() == [
        "Defendant: D1",
        "Plaintiff: P1",
    ]
    assert arguments.argument_history(case, "plaintiff").splitlines() == [
        "Plaintiff: P1",
        "Defendant: D1",
    ]


def test_record_argument_adds_argument_and_timeline_event():
    case = Case.model_construct(
        plaintiff_arguments=[], defendant_arguments=[], courtroom_proceedings=[]
    )

    arguments.record_argument(
        case, "defendant", "counter", "No.", EventType.AI_ARGUMENT, "Defense Lawyer"
    )

    assert (case.defendant_arguments[0].role, case.defendant_arguments[0].type) == (
        Roles.DEFENDANT,
        "counter",
    )
    event = case.courtroom_proceedings[0]
    assert (event.type, event.speaker_role, event.content) == (
        EventType.AI_ARGUMENT,
        "defendant",
        "No.",
    )


# ---------------------------------------------------------------------------
# closing statement and verdict
# ---------------------------------------------------------------------------


async def close(client, headers, case, role="plaintiff", statement="I rest my case"):
    return await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=headers,
        json={"role": role, "statement": statement},
    )


async def test_closing_statement_guards(
    client, auth_headers, courtroom_case, make_user, make_case, user
):
    foreign = await make_case(await make_user())
    case = await courtroom_case("plaintiff")
    switched = await courtroom_case(
        "plaintiff",
        user_role=Roles.NOT_STARTED,
        defendant_arguments=[arg("mine", "defendant", user_id=user.id)],
    )

    assert (
        await client.post(
            "/cases/NOPE000000000000/closing-statement",
            headers=auth_headers,
            json={"role": "plaintiff", "statement": "x"},
        )
    ).status_code == 404
    assert (await close(client, auth_headers, foreign)).status_code == 403
    assert (await close(client, auth_headers, case, role="judge")).status_code == 400
    assert (
        await close(client, auth_headers, case, role="defendant")
    ).status_code == 403
    assert (
        await close(client, auth_headers, switched, role="plaintiff")
    ).status_code == 403


@pytest.mark.parametrize("user_role", ["plaintiff", "defendant"])
async def test_closing_statement_generates_verdict(
    client, auth_headers, in_progress, user, fake_llm, user_role
):
    fake_llm.responses.extend(
        ["AI closing statement text", "**FACTS**\n1. Suit decreed."]
    )
    case = await in_progress(user_role)

    response = await close(client, auth_headers, case, role=user_role)

    assert response.json()["verdict"] == "**FACTS**\n1. Suit decreed."
    assert response.json()["ai_closing_statement"] == "AI closing statement text"
    saved = await reload(case)
    assert saved.status == CaseStatus.RESOLVED and saved.verdict.startswith("**FACTS**")
    judge_prompt = fake_llm.prompts[1]
    assert (
        "user opening" in judge_prompt
        and "ai opening" in judge_prompt
        and "AI closing statement text" in judge_prompt
    )
    assert await usage_count(user) == 1


@pytest.mark.parametrize(
    "target", ["upsert_first", "closing", "verdict", "upsert_verdict"]
)
async def test_closing_statement_failures_return_500(
    client, auth_headers, in_progress, monkeypatch, target
):
    case = await in_progress()

    if target == "closing":
        monkeypatch.setattr(arguments.lawyer, "closing_statement", boom)
    elif target == "verdict":
        monkeypatch.setattr(arguments.judge, "generate_verdict", boom)
    else:
        calls = {"n": 0}

        async def upsert(*args, **kwargs):
            calls["n"] += 1
            if target == "upsert_first" or calls["n"] > 1:
                raise RuntimeError("db down")

        monkeypatch.setattr(arguments, "upsert_memory_item", upsert)

    response = await close(client, auth_headers, case)

    assert response.status_code == 500


async def test_verdict_failure_does_not_resolve_case(
    client, auth_headers, in_progress, fake_llm
):
    def respond(prompt):
        if "impartial Indian Court judge" in prompt:
            raise RuntimeError("judge model down")
        return "AI closing statement text"

    fake_llm.responder = respond
    case = await in_progress()

    response = await close(client, auth_headers, case)

    assert response.status_code >= 500
    assert (await reload(case)).status != CaseStatus.RESOLVED
