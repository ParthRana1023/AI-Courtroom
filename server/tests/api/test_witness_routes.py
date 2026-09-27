"""Tests for witness routes and the AI cross-examination background task."""

import types

import pytest

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
from app.routes import witness as witness_routes
from tests.helpers import boom, reload


@pytest.fixture(autouse=True)
def fast_background_task(monkeypatch):
    """Skip the 3-second courtroom pause and fix the question count at the maximum."""

    async def no_sleep(seconds):
        return None

    monkeypatch.setattr(
        witness_routes, "asyncio", types.SimpleNamespace(sleep=no_sleep)
    )
    monkeypatch.setattr(
        witness_routes, "random", types.SimpleNamespace(randint=lambda low, high: high)
    )


def open_testimony(party, called_by="plaintiff", **extra):
    return WitnessTestimony(
        witness_id=party.id, witness_name=party.name, called_by=called_by, **extra
    )


@pytest.fixture
def on_stand(courtroom_case, witness_party):
    async def _make(**overrides):
        data = {
            "current_witness_id": witness_party.id,
            "witness_testimonies": [open_testimony(witness_party)],
        }
        data.update(overrides)
        return await courtroom_case(**data)

    return _make


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def test_count_arguments_since_last_witness_activity():
    case = Case.model_construct(
        user_role=Roles.PLAINTIFF,
        courtroom_proceedings=[
            CourtroomProceedingsEvent(type=EventType.ARGUMENT),
            CourtroomProceedingsEvent(type=EventType.WITNESS_DISMISSED),
            CourtroomProceedingsEvent(
                type=EventType.OPENING_STATEMENT, speaker_role="plaintiff"
            ),
            CourtroomProceedingsEvent(
                type=EventType.OPENING_STATEMENT, speaker_role="defendant"
            ),
            CourtroomProceedingsEvent(type=EventType.ARGUMENT),
        ],
    )

    assert witness_routes.count_arguments_since_last_witness_activity(case) == 2


def test_get_current_testimony_ignores_finished_sessions(witness_party):
    finished = open_testimony(witness_party)
    finished.ended_at = finished.started_at
    case = Case.model_construct(
        current_witness_id=witness_party.id, witness_testimonies=[finished]
    )

    assert witness_routes.get_current_testimony(case) is None
    assert (
        witness_routes.get_current_testimony(
            Case.model_construct(current_witness_id=None)
        )
        is None
    )


# ---------------------------------------------------------------------------
# ownership guards (every witness route)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# listing and calling
# ---------------------------------------------------------------------------


async def test_available_witnesses_marks_who_testified(
    client, auth_headers, courtroom_case, witness_party
):
    case = await courtroom_case(witness_testimonies=[open_testimony(witness_party)])

    body = (
        await client.get(f"/cases/{case.cnr}/witness/available", headers=auth_headers)
    ).json()

    assert {w["name"]: w["has_testified"] for w in body["witnesses"]} == {
        "Ravi Kumar": True,
        "Asha Rao": False,
    }


async def test_call_witness(client, auth_headers, courtroom_case, witness_party):
    case = await courtroom_case("defendant")

    response = await client.post(
        f"/cases/{case.cnr}/witness/call",
        headers=auth_headers,
        json={"witness_id": witness_party.id},
    )

    assert response.json()["witness_name"] == "Ravi Kumar"
    saved = await reload(case)
    assert saved.current_witness_id == witness_party.id
    assert saved.witness_testimonies[0].called_by == "defendant"
    assert saved.courtroom_proceedings[-1].type == EventType.WITNESS_CALLED


async def test_call_witness_defaults_caller_to_plaintiff(
    client, auth_headers, courtroom_case, witness_party
):
    case = await courtroom_case(user_role=Roles.NOT_STARTED)

    await client.post(
        f"/cases/{case.cnr}/witness/call",
        headers=auth_headers,
        json={"witness_id": witness_party.id},
    )

    assert (await reload(case)).witness_testimonies[0].called_by == "plaintiff"


@pytest.mark.parametrize(
    "overrides, witness_id, status",
    [
        ({"status": CaseStatus.ADJOURNED}, None, 400),
        ({"current_witness_id": "someone"}, None, 400),
        ({}, "unknown-party", 404),
    ],
)
async def test_call_witness_rejections(
    client, auth_headers, courtroom_case, witness_party, overrides, witness_id, status
):
    case = await courtroom_case(**overrides)

    response = await client.post(
        f"/cases/{case.cnr}/witness/call",
        headers=auth_headers,
        json={"witness_id": witness_id or witness_party.id},
    )

    assert response.status_code == status


async def test_call_witness_save_failure(
    client, auth_headers, courtroom_case, witness_party, monkeypatch
):
    case = await courtroom_case()

    monkeypatch.setattr(Case, "save", boom)

    response = await client.post(
        f"/cases/{case.cnr}/witness/call",
        headers=auth_headers,
        json={"witness_id": witness_party.id},
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# user examination
# ---------------------------------------------------------------------------


async def test_examine_witness_records_question_and_answer(
    client, auth_headers, on_stand, fake_llm
):
    fake_llm.responses.append("Yes, I paid in cash.")
    case = await on_stand()

    response = await client.post(
        f"/cases/{case.cnr}/witness/examine",
        headers=auth_headers,
        json={"question": "Did you pay?"},
    )

    assert response.json()["answer"] == "Yes, I paid in cash."
    saved = await reload(case)
    assert saved.witness_testimonies[0].examination[0].question == "Did you pay?"
    assert [e.type for e in saved.courtroom_proceedings[-2:]] == [
        EventType.WITNESS_EXAMINED_Q,
        EventType.WITNESS_EXAMINED_A,
    ]


@pytest.mark.parametrize(
    "overrides, status",
    [
        ({"status": CaseStatus.ADJOURNED}, 400),
        ({"current_witness_id": None}, 400),
        ({"witness_testimonies": []}, 400),
        (
            {
                "current_witness_id": "ghost",
                "witness_testimonies": [
                    WitnessTestimony(
                        witness_id="ghost", witness_name="G", called_by="plaintiff"
                    )
                ],
            },
            404,
        ),
    ],
)
async def test_examine_witness_rejections(
    client, auth_headers, on_stand, overrides, status
):
    case = await on_stand(**overrides)

    response = await client.post(
        f"/cases/{case.cnr}/witness/examine",
        headers=auth_headers,
        json={"question": "Q?"},
    )

    assert response.status_code == status


@pytest.mark.parametrize("target", ["examine_witness", "upsert_memory_item"])
async def test_examine_witness_failures(
    client, auth_headers, on_stand, monkeypatch, target
):
    if target == "examine_witness":
        monkeypatch.setattr(witness_routes.witness_service, "examine_witness", boom)
    else:
        monkeypatch.setattr(witness_routes, "upsert_memory_item", boom)
    case = await on_stand(user_role=Roles.NOT_STARTED)

    response = await client.post(
        f"/cases/{case.cnr}/witness/examine",
        headers=auth_headers,
        json={"question": "Q?"},
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# AI cross-examination
# ---------------------------------------------------------------------------


def cross_exam_responder(decisions=("CONTINUE",)):
    decisions = list(decisions)

    def respond(prompt):
        if "Generate ONE strategic cross-examination question" in prompt:
            return "Question: Where were you on 5 May?"
        if "Evaluate whether you should ask another question" in prompt:
            return decisions.pop(0) if decisions else "STOP"
        return "I was at home, My Lord."

    return respond


async def test_ai_cross_examination_runs_in_background(
    client, auth_headers, on_stand, fake_llm
):
    fake_llm.responder = cross_exam_responder(["CONTINUE", "STOP"])
    case = await on_stand(
        plaintiff_arguments=[ArgumentItem(type="user", content="Plaintiff point")],
        defendant_arguments=[ArgumentItem(type="counter", content="Defence point")],
    )

    response = await client.post(
        f"/cases/{case.cnr}/witness/ai-cross-examine", headers=auth_headers
    )

    assert response.json()["state"] == "ai_cross_examining"
    saved = await reload(case)
    assert saved.is_ai_examining is False
    assert len(saved.witness_testimonies[0].examination) == 2
    assert saved.courtroom_proceedings[-1].content == "Cross-examination completed."
    question_prompt = next(
        p for p in fake_llm.prompts if "strategic cross-examination" in p
    )
    assert "Plaintiff point" in question_prompt


@pytest.mark.parametrize(
    "overrides, status",
    [
        ({"status": CaseStatus.ADJOURNED}, 400),
        ({"current_witness_id": None}, 400),
        ({"is_ai_examining": True}, 400),
    ],
)
async def test_ai_cross_examination_rejections(
    client, auth_headers, on_stand, overrides, status
):
    case = await on_stand(**overrides)

    response = await client.post(
        f"/cases/{case.cnr}/witness/ai-cross-examine", headers=auth_headers
    )

    assert response.status_code == status


async def test_ai_cross_examination_unknown_witness(client, auth_headers, on_stand):
    case = await on_stand(current_witness_id="ghost")

    response = await client.post(
        f"/cases/{case.cnr}/witness/ai-cross-examine", headers=auth_headers
    )

    assert response.status_code == 404


async def test_background_task_stops_early_in_edge_cases(on_stand, courtroom_case):
    await witness_routes.process_ai_cross_examination(
        "NOPE000000000000"
    )  # missing case: no error

    no_witness = await courtroom_case(is_ai_examining=True)
    await witness_routes.process_ai_cross_examination(no_witness.cnr)
    assert (await reload(no_witness)).is_ai_examining is False

    ghost = await on_stand(current_witness_id="ghost", is_ai_examining=True)
    await witness_routes.process_ai_cross_examination(ghost.cnr)
    assert (await reload(ghost)).is_ai_examining is False

    no_testimony = await on_stand(
        witness_testimonies=[], is_ai_examining=True, ai_role=Roles.NOT_STARTED
    )
    await witness_routes.process_ai_cross_examination(no_testimony.cnr)
    assert (await reload(no_testimony)).courtroom_proceedings[
        -1
    ].content == "Cross-examination completed."


async def test_background_task_stops_when_flag_cleared(on_stand, fake_llm):
    case = await on_stand(is_ai_examining=False)

    await witness_routes.process_ai_cross_examination(case.cnr)

    assert fake_llm.calls == []


@pytest.mark.parametrize(
    "failing", ["generate_cross_examination_questions", "examine_witness"]
)
async def test_background_task_stops_on_generation_errors(
    on_stand, monkeypatch, failing
):
    monkeypatch.setattr(witness_routes.witness_service, failing, boom)
    case = await on_stand(is_ai_examining=True)

    await witness_routes.process_ai_cross_examination(case.cnr)

    saved = await reload(case)
    assert saved.is_ai_examining is False
    assert saved.witness_testimonies[0].examination == []


async def test_background_task_survives_unexpected_errors(on_stand, monkeypatch):
    monkeypatch.setattr(witness_routes, "upsert_memory_item", boom)
    case = await on_stand(is_ai_examining=True)

    await witness_routes.process_ai_cross_examination(case.cnr)

    assert (await reload(case)).is_ai_examining is False


async def test_dismissal_during_ai_examination_is_not_undone(
    on_stand, monkeypatch, fake_llm
):
    fake_llm.responder = cross_exam_responder(["STOP"])
    case = await on_stand(is_ai_examining=True)
    original = witness_routes.witness_service.generate_cross_examination_questions

    async def question_then_user_dismisses(**kwargs):
        question = await original(**kwargs)
        # Meanwhile the user dismisses the witness from another request.
        await Case.find_one(Case.cnr == case.cnr).update_one(
            {"$set": {"current_witness_id": None, "is_ai_examining": False}}
        )
        return question

    monkeypatch.setattr(
        witness_routes.witness_service,
        "generate_cross_examination_questions",
        question_then_user_dismisses,
    )

    await witness_routes.process_ai_cross_examination(case.cnr)

    assert (await reload(case)).current_witness_id is None


# ---------------------------------------------------------------------------
# conclude, dismiss, current state and testimonies
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("action", ["conclude", "dismiss"])
async def test_conclude_and_dismiss_end_the_testimony(
    client, auth_headers, on_stand, witness_party, action
):
    case = await on_stand(
        is_ai_examining=True,
        witness_testimonies=[
            open_testimony(
                witness_party,
                examination=[
                    ExaminationItem(examiner="plaintiff", question="Q", answer="A")
                ],
            )
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/witness/{action}", headers=auth_headers
    )

    assert response.json()["success"] is True
    if action == "conclude":
        assert response.json()["total_questions_asked"] == 1
    saved = await reload(case)
    assert saved.current_witness_id is None and saved.is_ai_examining is False
    assert saved.witness_testimonies[0].ended_at is not None
    assert (
        saved.courtroom_proceedings[-1].content
        == "Ravi Kumar dismissed from the stand."
    )


@pytest.mark.parametrize("action", ["conclude", "dismiss"])
async def test_conclude_and_dismiss_unknown_witness(
    client, auth_headers, on_stand, action
):
    case = await on_stand(current_witness_id="ghost")

    response = await client.post(
        f"/cases/{case.cnr}/witness/{action}", headers=auth_headers
    )

    assert response.json()["success"] is True
    assert (await reload(case)).courtroom_proceedings[
        -1
    ].content == "Witness dismissed from the stand."


@pytest.mark.parametrize("action", ["conclude", "dismiss"])
async def test_conclude_and_dismiss_without_witness(
    client, auth_headers, courtroom_case, action
):
    case = await courtroom_case()

    assert (
        await client.post(f"/cases/{case.cnr}/witness/{action}", headers=auth_headers)
    ).status_code == 400


@pytest.mark.parametrize("action", ["conclude", "dismiss"])
async def test_conclude_and_dismiss_save_failure(
    client, auth_headers, on_stand, monkeypatch, action
):
    case = await on_stand()

    monkeypatch.setattr(Case, "save", boom)

    assert (
        await client.post(f"/cases/{case.cnr}/witness/{action}", headers=auth_headers)
    ).status_code == 500


async def test_current_witness_states(
    client, auth_headers, courtroom_case, on_stand, witness_party
):
    empty = await courtroom_case()
    ghost = await on_stand(current_witness_id="ghost")
    active = await on_stand(
        witness_testimonies=[
            open_testimony(
                witness_party,
                examination=[
                    ExaminationItem(examiner="plaintiff", question="Q1", answer="A1")
                ],
            )
        ]
    )

    assert (
        await client.get(f"/cases/{empty.cnr}/witness/current", headers=auth_headers)
    ).json()["has_witness"] is False
    assert (
        await client.get(f"/cases/{ghost.cnr}/witness/current", headers=auth_headers)
    ).json()["has_witness"] is False
    body = (
        await client.get(f"/cases/{active.cnr}/witness/current", headers=auth_headers)
    ).json()
    assert body["witness_name"] == "Ravi Kumar"
    assert [e["question"] for e in body["examination_history"]] == ["Q1"]


async def test_current_witness_shows_pending_ai_question(
    client, auth_headers, on_stand, witness_party
):
    case = await on_stand(
        is_ai_examining=True,
        courtroom_proceedings=[
            CourtroomProceedingsEvent(
                type=EventType.WITNESS_EXAMINED_Q,
                witness_id=witness_party.id,
                content="Pending question?",
                speaker_role=None,
            )
        ],
    )

    body = (
        await client.get(f"/cases/{case.cnr}/witness/current", headers=auth_headers)
    ).json()

    pending = body["examination_history"][-1]
    assert (pending["question"], pending["answer"], pending["examiner"]) == (
        "Pending question?",
        "",
        "opposition",
    )


async def test_all_testimonies(client, auth_headers, courtroom_case, witness_party):
    case = await courtroom_case(
        witness_testimonies=[
            open_testimony(
                witness_party,
                examination=[
                    ExaminationItem(
                        examiner="defendant",
                        question="Q",
                        answer="A",
                        objection="Leading",
                    )
                ],
            )
        ]
    )

    body = (
        await client.get(f"/cases/{case.cnr}/witness/testimonies", headers=auth_headers)
    ).json()

    assert body["testimonies"][0]["examination"][0]["objection"] == "Leading"


# ---------------------------------------------------------------------------
# AI decides whether to call a witness
# ---------------------------------------------------------------------------


def argued(n):
    return [
        CourtroomProceedingsEvent(type=EventType.ARGUMENT, content=f"a{i}")
        for i in range(n)
    ]


async def ai_call(client, headers, case):
    return (
        await client.post(f"/cases/{case.cnr}/witness/ai-call", headers=headers)
    ).json()


async def test_ai_call_witness_calls_and_examines(
    client, auth_headers, courtroom_case, fake_llm, witness_party
):
    def respond(prompt):
        if "should you call a witness now" in prompt:
            return "CALL: 1"
        return cross_exam_responder(["STOP"])(prompt)

    fake_llm.responder = respond
    case = await courtroom_case(
        ai_role=Roles.NOT_STARTED,
        courtroom_proceedings=argued(2),
        plaintiff_arguments=[ArgumentItem(type="user", content="P")],
        defendant_arguments=[ArgumentItem(type="counter", content="D")],
    )

    body = await ai_call(client, auth_headers, case)

    assert (
        body["should_call"] is True
        and body["witness_name"] == "Ravi Kumar"
        and body["called_by"] == "defendant"
    )
    saved = await reload(case)
    assert saved.current_witness_id == witness_party.id
    assert saved.witness_testimonies[0].examination  # background examination ran


@pytest.mark.parametrize(
    "overrides, reason",
    [
        ({"current_witness_id": "someone"}, "A witness is already on the stand"),
        (
            {"courtroom_proceedings": argued(1)},
            "Skipping witness evaluation until more arguments are presented",
        ),
    ],
)
async def test_ai_call_witness_skips(
    client, auth_headers, courtroom_case, overrides, reason
):
    case = await courtroom_case(**overrides)

    assert (await ai_call(client, auth_headers, case))["reason"] == reason


async def test_ai_call_witness_no_one_left(
    client, auth_headers, courtroom_case, witness_party, other_party
):
    case = await courtroom_case(
        courtroom_proceedings=argued(2),
        witness_testimonies=[
            open_testimony(witness_party),
            open_testimony(other_party),
        ],
    )

    assert (await ai_call(client, auth_headers, case))[
        "reason"
    ] == "No untestified witnesses available"


async def test_ai_call_witness_declines(client, auth_headers, courtroom_case, fake_llm):
    fake_llm.responses.append("NO_WITNESS")
    case = await courtroom_case(courtroom_proceedings=argued(3))

    assert (await ai_call(client, auth_headers, case))[
        "reason"
    ] == "AI decided not to call a witness at this time"


async def test_ai_call_witness_error(client, auth_headers, courtroom_case, monkeypatch):
    monkeypatch.setattr(witness_routes.witness_service, "should_ai_call_witness", boom)
    case = await courtroom_case(courtroom_proceedings=argued(2))

    assert (await ai_call(client, auth_headers, case))[
        "reason"
    ] == "Error evaluating witness strategy"


@pytest.mark.parametrize(
    "overrides, status",
    [({"status": CaseStatus.ADJOURNED}, 400), ({"is_ai_examining": True}, 409)],
)
async def test_ai_call_witness_rejections(
    client, auth_headers, courtroom_case, overrides, status
):
    case = await courtroom_case(**overrides)

    response = await client.post(
        f"/cases/{case.cnr}/witness/ai-call", headers=auth_headers
    )

    assert response.status_code == status


@pytest.mark.parametrize(
    "interruption",
    [
        {"$set": {"current_witness_id": "someone-else"}},  # witness replaced
        {
            "$set": {"witness_testimonies.0.ended_at": "2026-01-01T00:00:00"}
        },  # testimony closed
    ],
)
async def test_background_task_stops_when_state_changes_between_questions(
    on_stand, monkeypatch, fake_llm, interruption
):
    fake_llm.responder = cross_exam_responder(["CONTINUE", "CONTINUE"])
    case = await on_stand(is_ai_examining=True)
    original_upsert = witness_routes.upsert_memory_item

    async def upsert_then_interrupt(
        case_arg, source_type, source_id, content, metadata=None
    ):
        await original_upsert(case_arg, source_type, source_id, content, metadata)
        if metadata and metadata.get("event_type") == "witness_examined_a":
            await Case.find_one(Case.cnr == case.cnr).update_one(interruption)

    monkeypatch.setattr(witness_routes, "upsert_memory_item", upsert_then_interrupt)

    await witness_routes.process_ai_cross_examination(case.cnr)

    questions = [p for p in fake_llm.prompts if "strategic cross-examination" in p]
    assert len(questions) == 1  # stopped before a second question


async def test_answer_is_discarded_if_user_stops_examination_before_it_arrives(
    on_stand, monkeypatch, fake_llm
):
    fake_llm.responder = cross_exam_responder()
    case = await on_stand(is_ai_examining=True)
    original = witness_routes.witness_service.examine_witness

    async def answer_after_user_dismisses(**kwargs):
        answer = await original(**kwargs)
        await Case.find_one(Case.cnr == case.cnr).update_one(
            {"$set": {"current_witness_id": None, "is_ai_examining": False}}
        )
        return answer

    monkeypatch.setattr(
        witness_routes.witness_service, "examine_witness", answer_after_user_dismisses
    )

    await witness_routes.process_ai_cross_examination(case.cnr)

    saved = await reload(case)
    assert saved.current_witness_id is None
    assert saved.witness_testimonies[0].examination == []
    assert not any(
        e.type == EventType.WITNESS_EXAMINED_A for e in saved.courtroom_proceedings
    )
