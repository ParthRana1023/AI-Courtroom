"""Tests for argument submission, regeneration and closing statements."""

import pytest
from beanie import PydanticObjectId

from app.models.case import (
    ArgumentItem,
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    ExaminationItem,
    Roles,
    WitnessTestimony,
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
    fake_llm.responses.append("AI defence opening")
    case = await courtroom_case("plaintiff", status=CaseStatus.NOT_STARTED)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "Pay us"},
    )

    assert response.json() == {
        "ai_opening_statement": "AI defence opening",
        "ai_opening_role": "defendant",
    }
    saved = await reload(case)
    assert saved.plaintiff_arguments[0].user_id == user.id
    assert saved.defendant_arguments[0].content == "AI defence opening"
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
    fake_llm.responses.append("AI counter")
    case = await in_progress(user_role)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": user_role, "argument": "Second point"},
    )

    assert response.json() == {
        "ai_counter_argument": "AI counter",
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
    fake_llm.responses.append("AI closing")
    case = await in_progress("plaintiff")

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "My closing", "is_closing": True},
    )

    saved = await reload(case)
    assert [a.content for a in saved.plaintiff_arguments].count("My closing") == 1
    assert [a.content for a in saved.defendant_arguments].count("AI closing") == 1


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
    assert (
        response.json()["detail"]
        == "The AI could not respond right now. Please try again."
    )
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


def test_build_argument_history_until_skips_replaced_and_non_argument_events():
    case = Case.model_construct(
        courtroom_proceedings=[
            event(EventType.OPENING_STATEMENT, "open", "plaintiff"),
            event(EventType.WITNESS_CALLED, "called"),
            event(EventType.AI_ARGUMENT, "replace me", "defendant", id="skip"),
            event(EventType.ARGUMENT, "later", None),
        ]
    )

    assert (
        arguments.build_argument_history_until(case, 4, "skip")
        == "plaintiff: open\nlawyer: later\n"
    )


def test_update_matching_ai_argument_falls_back_to_latest_ai_item():
    case = Case.model_construct(
        plaintiff_arguments=[],
        defendant_arguments=[
            arg("ai 1", "defendant"),
            arg("user", "defendant", user_id=PydanticObjectId()),
            arg("ai 2", "defendant"),
        ],
    )
    ev = event(EventType.AI_ARGUMENT, role="defendant")

    arguments.update_matching_ai_argument(case, ev, "ai 1", "ai 1 v2")
    arguments.update_matching_ai_argument(case, ev, "no match", "fallback")

    assert [a.content for a in case.defendant_arguments] == [
        "ai 1 v2",
        "user",
        "fallback",
    ]


def test_update_matching_witness_answer():
    testimony = WitnessTestimony(
        witness_id="w1",
        witness_name="W",
        called_by="plaintiff",
        examination=[ExaminationItem(examiner="plaintiff", question="Q", answer="old")],
    )
    case = Case.model_construct(
        witness_testimonies=[
            testimony,
            WitnessTestimony(
                witness_id="w2", witness_name="Other", called_by="plaintiff"
            ),
        ]
    )

    assert (
        arguments.update_matching_witness_answer(case, "w1", "Q", "old", "new")
        == testimony.examination[0].id
    )
    assert testimony.examination[0].answer == "new"
    assert (
        arguments.update_matching_witness_answer(case, None, "Q", "missing", "x")
        is None
    )


def test_remove_proceedings_after_rolls_back_state():
    testimony = WitnessTestimony(
        witness_id="w1",
        witness_name="W",
        called_by="plaintiff",
        examination=[ExaminationItem(examiner="defendant", question="Q", answer="A")],
    )
    empty_testimony = WitnessTestimony(
        witness_id="w2", witness_name="W2", called_by="plaintiff"
    )
    case = Case.model_construct(
        cnr="C",
        status=CaseStatus.RESOLVED,
        current_witness_id="w2",
        is_ai_examining=True,
        plaintiff_arguments=[arg("keep", "plaintiff"), arg("drop p", "plaintiff")],
        defendant_arguments=[arg("drop d", "defendant")],
        witness_testimonies=[testimony, empty_testimony],
        courtroom_proceedings=[
            event(EventType.ARGUMENT, "keep", "plaintiff"),
            event(EventType.WITNESS_DISMISSED, witness_id="w1"),
            event(EventType.WITNESS_EXAMINED_A, "A", witness_id="w1"),
            event(EventType.WITNESS_CALLED, witness_id="w2"),
            event(EventType.ARGUMENT, "drop p", "plaintiff"),
            event(EventType.AI_ARGUMENT, "drop d", "defendant"),
        ],
    )
    testimony.ended_at = testimony.started_at

    arguments.remove_proceedings_after(case, 0)

    assert len(case.courtroom_proceedings) == 1
    assert [a.content for a in case.plaintiff_arguments] == ["keep"]
    assert case.defendant_arguments == []
    assert testimony.examination == [] and testimony.ended_at is None
    assert case.witness_testimonies == [testimony]
    assert case.current_witness_id == "w1" and case.is_ai_examining is False
    assert case.status == CaseStatus.ACTIVE


def test_remove_proceedings_after_last_event_is_noop():
    case = Case.model_construct(
        courtroom_proceedings=[event(EventType.ARGUMENT, "x")],
        status=CaseStatus.RESOLVED,
    )

    arguments.remove_proceedings_after(case, 0)

    assert case.status == CaseStatus.RESOLVED


# ---------------------------------------------------------------------------
# regenerate
# ---------------------------------------------------------------------------


async def regenerate(client, headers, case, event_id):
    return await client.post(
        f"/cases/{case.cnr}/proceedings/{event_id}/regenerate", headers=headers
    )


async def test_regenerate_guards(
    client, auth_headers, courtroom_case, make_user, make_case
):
    foreign = await make_case(await make_user())
    system = event(EventType.SYSTEM_MESSAGE, "hi")
    case = await courtroom_case(courtroom_proceedings=[system])

    assert (
        await client.post(
            "/cases/NOPE000000000000/proceedings/x/regenerate", headers=auth_headers
        )
    ).status_code == 404
    assert (await regenerate(client, auth_headers, foreign, "x")).status_code == 403
    assert (await regenerate(client, auth_headers, case, "missing")).status_code == 404
    assert (await regenerate(client, auth_headers, case, system.id)).status_code == 400


async def test_regenerate_ai_argument_truncates_later_proceedings(
    client, auth_headers, courtroom_case, user, fake_llm
):
    fake_llm.responses.append("Better counter")
    ai_event = event(EventType.AI_ARGUMENT, "weak counter", "defendant")
    case = await courtroom_case(
        plaintiff_arguments=[
            arg("user point", "plaintiff", user_id=user.id),
            arg("later point", "plaintiff", user_id=user.id),
        ],
        defendant_arguments=[
            arg("weak counter", "defendant", type_="counter"),
            arg("later counter", "defendant", type_="counter"),
        ],
        courtroom_proceedings=[
            event(EventType.ARGUMENT, "user point", "plaintiff"),
            ai_event,
            event(EventType.ARGUMENT, "later point", "plaintiff"),
            event(EventType.AI_ARGUMENT, "later counter", "defendant"),
        ],
    )

    response = await regenerate(client, auth_headers, case, ai_event.id)

    assert response.json() == {
        "success": True,
        "event_id": ai_event.id,
        "content": "Better counter",
    }
    saved = await reload(case)
    assert [e.content for e in saved.courtroom_proceedings] == [
        "user point",
        "Better counter",
    ]
    assert [a.content for a in saved.defendant_arguments] == ["Better counter"]
    assert "user point" in fake_llm.prompts[0]


async def test_regenerate_ai_argument_needs_prior_user_argument(
    client, auth_headers, courtroom_case
):
    ai_event = event(EventType.AI_ARGUMENT, "orphan", "defendant")
    case = await courtroom_case(courtroom_proceedings=[ai_event])

    response = await regenerate(client, auth_headers, case, ai_event.id)

    assert response.status_code == 400


async def test_regenerate_opening_infers_roles_when_not_chosen(
    client, auth_headers, courtroom_case, fake_llm
):
    fake_llm.responses.append("Fresh opening")
    opening = event(EventType.OPENING_STATEMENT, "old opening", "plaintiff")
    case = await courtroom_case(
        user_role=Roles.NOT_STARTED,
        plaintiff_arguments=[arg("old opening", "plaintiff", type_="opening")],
        courtroom_proceedings=[opening],
    )

    response = await regenerate(client, auth_headers, case, opening.id)

    assert response.json()["content"] == "Fresh opening"
    assert "plaintiff's side" in fake_llm.prompts[0]
    assert (await reload(case)).plaintiff_arguments[0].content == "Fresh opening"


async def test_regenerate_witness_answer(
    client, auth_headers, courtroom_case, witness_party, fake_llm
):
    fake_llm.responses.append("New answer")
    question = event(
        EventType.WITNESS_EXAMINED_Q,
        "Did you pay?",
        "defendant",
        witness_id=witness_party.id,
        question="Did you pay?",
    )
    answer = event(
        EventType.WITNESS_EXAMINED_A,
        "Old answer",
        "applicant",
        witness_id=witness_party.id,
        answer="Old answer",
    )
    case = await courtroom_case(
        current_witness_id=witness_party.id,
        witness_testimonies=[
            WitnessTestimony(
                witness_id=witness_party.id,
                witness_name=witness_party.name,
                called_by="defendant",
                examination=[
                    ExaminationItem(
                        examiner="defendant",
                        question="Did you pay?",
                        answer="Old answer",
                    )
                ],
            )
        ],
        courtroom_proceedings=[question, answer],
    )

    response = await regenerate(client, auth_headers, case, answer.id)

    assert response.json()["content"] == "New answer"
    saved = await reload(case)
    assert saved.witness_testimonies[0].examination[0].answer == "New answer"
    assert saved.courtroom_proceedings[1].answer == "New answer"
    assert "the defendant's lawyer" in fake_llm.prompts[0]


async def test_regenerate_witness_answer_without_context(
    client, auth_headers, courtroom_case
):
    answer = event(
        EventType.WITNESS_EXAMINED_A, "Old", "applicant", witness_id="unknown-witness"
    )
    case = await courtroom_case(courtroom_proceedings=[answer])

    response = await regenerate(client, auth_headers, case, answer.id)

    assert response.status_code == 400


async def test_regenerate_unexpected_error_returns_500(
    client, auth_headers, courtroom_case, monkeypatch
):
    monkeypatch.setattr(arguments.lawyer, "opening_statement", boom)
    opening = event(EventType.OPENING_STATEMENT, "old", "defendant")
    case = await courtroom_case(courtroom_proceedings=[opening])

    response = await regenerate(client, auth_headers, case, opening.id)

    assert response.status_code == 500


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
    fake_llm.responses.extend(["AI closing", "**FACTS**\n1. Suit decreed."])
    case = await in_progress(user_role)

    response = await close(client, auth_headers, case, role=user_role)

    assert response.json()["verdict"] == "**FACTS**\n1. Suit decreed."
    assert response.json()["ai_closing_statement"] == "AI closing"
    saved = await reload(case)
    assert saved.status == CaseStatus.RESOLVED and saved.verdict.startswith("**FACTS**")
    judge_prompt = fake_llm.prompts[1]
    assert (
        "user opening" in judge_prompt
        and "ai opening" in judge_prompt
        and "AI closing" in judge_prompt
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
        return "AI closing"

    fake_llm.responder = respond
    case = await in_progress()

    response = await close(client, auth_headers, case)

    assert response.status_code >= 500
    assert (await reload(case)).status != CaseStatus.RESOLVED
