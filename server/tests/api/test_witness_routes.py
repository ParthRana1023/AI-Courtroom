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
    WitnessPhase,
    WitnessTestimony,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.routes import witness as witness_routes
from tests.helpers import boom, reload


@pytest.fixture(autouse=True)
def fast_background_task(monkeypatch):
    """Skip the 3-second courtroom pause."""

    async def no_sleep(seconds):
        return None

    monkeypatch.setattr(
        witness_routes, "asyncio", types.SimpleNamespace(sleep=no_sleep)
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


async def test_examine_witness_ai_failure_is_a_503(
    client, auth_headers, on_stand, fake_llm
):
    case = await on_stand()
    fake_llm.error = RuntimeError("provider down")

    response = await client.post(
        f"/cases/{case.cnr}/witness/examine",
        headers=auth_headers,
        json={"question": "Where were you?"},
    )

    assert response.status_code == 503


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


async def test_examine_witness_records_the_phase(
    client, auth_headers, on_stand, witness_party, fake_llm
):
    case = await on_stand(
        witness_testimonies=[
            open_testimony(witness_party, called_by="defendant", phase="cross")
        ]
    )

    await client.post(
        f"/cases/{case.cnr}/witness/examine",
        headers=auth_headers,
        json={"question": "You were not there, were you?"},
    )

    item = (await reload(case)).witness_testimonies[0].examination[0]
    assert (item.examiner, item.phase) == ("plaintiff", WitnessPhase.CROSS)


@pytest.mark.parametrize(
    "testimony, ai_examining",
    [
        # the AI called this witness and is still examining in chief
        ({"called_by": "defendant", "phase": "chief"}, False),
        # the user's witness is being cross-examined by the AI
        ({"called_by": "plaintiff", "phase": "cross"}, False),
        # the user's own turn, but the AI is mid-examination
        ({"called_by": "plaintiff", "phase": "chief"}, True),
    ],
)
async def test_user_cannot_question_out_of_turn(
    client, auth_headers, on_stand, witness_party, testimony, ai_examining
):
    case = await on_stand(
        is_ai_examining=ai_examining,
        witness_testimonies=[open_testimony(witness_party, **testimony)],
    )

    response = await client.post(
        f"/cases/{case.cnr}/witness/examine",
        headers=auth_headers,
        json={"question": "Q?"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "It is not your turn to examine the witness."


@pytest.mark.parametrize("developer, allowance", [(False, 20), (True, 40)])
async def test_witness_questions_are_rate_limited(
    client, auth_headers, on_stand, user, monkeypatch, developer, allowance
):
    from app.config import settings
    from app.utils.rate_limiter import witness_question_limiter_for

    if developer:
        monkeypatch.setattr(settings, "dev_mode_emails", user.email)
    limiter = witness_question_limiter_for(user)
    assert limiter.requests == allowance
    for _ in range(allowance - 1):
        await limiter.register_usage(str(user.id))
    case = await on_stand()
    url = f"/cases/{case.cnr}/witness/examine"

    last_allowed = await client.post(url, headers=auth_headers, json={"question": "Q?"})
    blocked = await client.post(url, headers=auth_headers, json={"question": "Q?"})

    assert last_allowed.status_code == 200
    assert blocked.status_code == 429
    assert "enough from the witnesses" in blocked.json()["detail"]


async def test_witness_question_limit_status(client, auth_headers):
    body = (await client.get("/limit/witness-question", headers=auth_headers)).json()

    assert (body["remaining_attempts"], body["max_attempts"]) == (20, 20)


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


class ExamResponder:
    """AI asks up to ``questions`` questions, then declines when it is allowed to;
    every other prompt (the witness) gets an answer."""

    def __init__(self, questions: int = 99):
        self.questions = questions
        self.asked: list[str] = []

    def __call__(self, prompt: str) -> str:
        if "Respond with ONLY the question" in prompt:
            if len(self.asked) >= self.questions and "instead of a question" in prompt:
                return "NO_FURTHER_QUESTIONS"
            self.asked.append(prompt)
            return f"Question: Where were you on day {len(self.asked)}?"
        return "I was at home."


async def finish_turn(client, headers, case):
    return await client.post(
        f"/cases/{case.cnr}/witness/ai-cross-examine", headers=headers
    )


async def test_ai_cross_examines_the_users_witness_then_user_may_re_examine(
    client, auth_headers, on_stand, fake_llm, witness_party
):
    fake_llm.responder = ExamResponder(questions=2)
    case = await on_stand(
        plaintiff_arguments=[ArgumentItem(type="user", content="Plaintiff point")],
        defendant_arguments=[ArgumentItem(type="counter", content="Defence point")],
        witness_testimonies=[
            open_testimony(
                witness_party,
                examination=[
                    ExaminationItem(
                        examiner="plaintiff", question="Q", answer="A", phase="chief"
                    )
                ],
            )
        ],
    )

    response = await finish_turn(client, auth_headers, case)

    assert response.json()["state"] == "ai_cross_examining"
    saved = await reload(case)
    testimony = saved.witness_testimonies[0]
    assert saved.is_ai_examining is False
    assert [e.phase for e in testimony.examination] == [
        WitnessPhase.CHIEF,
        WitnessPhase.CROSS,
        WitnessPhase.CROSS,
    ]
    # the user called the witness, so re-examination is the user's
    assert testimony.phase == WitnessPhase.RE_EXAM
    assert testimony.examining_side() == "plaintiff"
    assert saved.courtroom_proceedings[-1].content == "Cross-examination completed."
    assert "Plaintiff point" in fake_llm.responder.asked[0]
    assert "CROSS-EXAMINATION" in fake_llm.responder.asked[0]


async def test_ai_may_decline_to_cross_examine_and_witness_is_discharged(
    client, auth_headers, on_stand, fake_llm
):
    fake_llm.responder = ExamResponder(questions=0)
    case = await on_stand()

    await finish_turn(client, auth_headers, case)

    saved = await reload(case)
    assert saved.witness_testimonies[0].examination == []
    assert saved.current_witness_id is None
    assert saved.witness_testimonies[0].ended_at is not None
    assert [e.content for e in saved.courtroom_proceedings[-2:]] == [
        "Cross-examination completed.",
        "Ravi Kumar dismissed from the stand as the examination is complete.",
    ]


@pytest.mark.parametrize("phase", [WitnessPhase.CROSS, WitnessPhase.RE_EXAM])
async def test_ai_asks_at_most_four_in_cross_and_re_examination(
    on_stand, witness_party, fake_llm, phase
):
    fake_llm.responder = ExamResponder()  # never volunteers to stop
    case = await on_stand(
        is_ai_examining=True,
        witness_testimonies=[
            open_testimony(
                witness_party,
                called_by="plaintiff" if phase == WitnessPhase.CROSS else "defendant",
                phase=phase,
            )
        ],
    )

    await witness_routes.process_ai_examination(case.cnr)

    asked = [
        e
        for e in (await reload(case)).witness_testimonies[0].examination
        if e.phase == phase
    ]
    assert len(asked) == 4


@pytest.mark.parametrize(
    "willing, expected",
    [(0, 3), (4, 4), (99, 5)],  # at least 3 in chief, at most 5
)
async def test_ai_examination_in_chief_asks_three_to_five(
    on_stand, witness_party, fake_llm, willing, expected
):
    fake_llm.responder = ExamResponder(questions=willing)
    case = await on_stand(
        is_ai_examining=True,
        witness_testimonies=[open_testimony(witness_party, called_by="defendant")],
    )

    await witness_routes.process_ai_examination(case.cnr)

    saved = await reload(case)
    testimony = saved.witness_testimonies[0]
    assert len(testimony.examination) == expected
    # now the user cross-examines the AI's witness
    assert testimony.phase == WitnessPhase.CROSS
    assert testimony.examining_side() == "plaintiff"
    assert saved.current_witness_id == witness_party.id


async def test_user_cross_then_ai_re_examines_then_witness_is_discharged(
    client, auth_headers, on_stand, witness_party, fake_llm
):
    fake_llm.responder = ExamResponder(questions=1)
    case = await on_stand(
        witness_testimonies=[
            open_testimony(
                witness_party,
                called_by="defendant",
                phase="cross",
                examination=[
                    ExaminationItem(
                        examiner="plaintiff", question="Q", answer="A", phase="cross"
                    )
                ],
            )
        ]
    )

    response = await finish_turn(client, auth_headers, case)

    assert response.json()["state"] == "ai_cross_examining"
    saved = await reload(case)
    assert [e.phase for e in saved.witness_testimonies[0].examination] == [
        WitnessPhase.CROSS,
        WitnessPhase.RE_EXAM,
    ]
    assert "RE-EXAMINATION" in fake_llm.responder.asked[0]
    assert saved.current_witness_id is None
    assert saved.courtroom_proceedings[-1].content == (
        "Ravi Kumar dismissed from the stand as the examination is complete."
    )


@pytest.mark.parametrize(
    "testimony",
    [
        # user did not cross-examine the AI's witness: nothing to re-examine
        {"called_by": "defendant", "phase": "cross"},
        # user finished re-examining their own witness
        {"called_by": "plaintiff", "phase": "re_exam"},
    ],
)
async def test_finishing_the_last_turn_discharges_the_witness(
    client, auth_headers, on_stand, witness_party, fake_llm, testimony
):
    case = await on_stand(
        witness_testimonies=[open_testimony(witness_party, **testimony)]
    )

    response = await finish_turn(client, auth_headers, case)

    assert response.json()["state"] == "concluded"
    saved = await reload(case)
    assert saved.current_witness_id is None
    assert fake_llm.calls == []


@pytest.mark.parametrize(
    "overrides, status",
    [
        ({"status": CaseStatus.ADJOURNED}, 400),
        ({"current_witness_id": None}, 400),
        ({"is_ai_examining": True}, 400),
    ],
)
async def test_finish_turn_rejections(
    client, auth_headers, on_stand, overrides, status
):
    case = await on_stand(**overrides)

    assert (await finish_turn(client, auth_headers, case)).status_code == status


async def test_finish_turn_out_of_turn(client, auth_headers, on_stand, witness_party):
    case = await on_stand(
        witness_testimonies=[open_testimony(witness_party, called_by="defendant")]
    )

    assert (await finish_turn(client, auth_headers, case)).status_code == 409


async def test_finish_turn_unknown_witness(client, auth_headers, on_stand):
    case = await on_stand(current_witness_id="ghost")

    assert (await finish_turn(client, auth_headers, case)).status_code == 404


async def test_background_task_stops_early_in_edge_cases(on_stand, courtroom_case):
    await witness_routes.process_ai_examination("NOPE000000000000")  # no error

    no_witness = await courtroom_case(is_ai_examining=True)
    await witness_routes.process_ai_examination(no_witness.cnr)
    assert (await reload(no_witness)).is_ai_examining is False

    ghost = await on_stand(current_witness_id="ghost", is_ai_examining=True)
    await witness_routes.process_ai_examination(ghost.cnr)
    assert (await reload(ghost)).is_ai_examining is False

    no_testimony = await on_stand(witness_testimonies=[], is_ai_examining=True)
    await witness_routes.process_ai_examination(no_testimony.cnr)
    assert (await reload(no_testimony)).is_ai_examining is False


async def test_background_task_stops_when_flag_cleared(on_stand, fake_llm):
    case = await on_stand(is_ai_examining=False)

    await witness_routes.process_ai_examination(case.cnr)

    assert fake_llm.calls == []


@pytest.mark.parametrize("failing", ["generate_witness_question", "examine_witness"])
async def test_background_task_stops_on_generation_errors(
    on_stand, monkeypatch, failing
):
    monkeypatch.setattr(witness_routes.witness_service, failing, boom)
    case = await on_stand(is_ai_examining=True)

    await witness_routes.process_ai_examination(case.cnr)

    saved = await reload(case)
    assert saved.is_ai_examining is False
    assert saved.witness_testimonies[0].examination == []


async def test_background_task_survives_unexpected_errors(on_stand, monkeypatch):
    monkeypatch.setattr(witness_routes, "upsert_memory_item", boom)
    case = await on_stand(is_ai_examining=True)

    await witness_routes.process_ai_examination(case.cnr)

    assert (await reload(case)).is_ai_examining is False


async def test_dismissal_during_ai_examination_is_not_undone(
    on_stand, monkeypatch, fake_llm
):
    fake_llm.responder = ExamResponder()
    case = await on_stand(is_ai_examining=True)
    original = witness_routes.witness_service.generate_witness_question

    async def question_then_user_dismisses(**kwargs):
        question = await original(**kwargs)
        # Meanwhile the user dismisses the witness from another request.
        await Case.find_one(Case.cnr == case.cnr).update_one(
            {"$set": {"current_witness_id": None, "is_ai_examining": False}}
        )
        return question

    monkeypatch.setattr(
        witness_routes.witness_service,
        "generate_witness_question",
        question_then_user_dismisses,
    )

    await witness_routes.process_ai_examination(case.cnr)

    saved = await reload(case)
    assert saved.current_witness_id is None
    # finishing the AI's turn must not touch a witness the user dismissed
    assert saved.witness_testimonies[0].phase == WitnessPhase.CHIEF


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
    assert (body["phase"], body["next_examiner"]) == ("chief", "plaintiff")


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
    examine = ExamResponder(questions=0)

    def respond(prompt):
        if "Should you call a witness now?" in prompt:
            return "CALL: 1"
        return examine(prompt)

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
    testimony = saved.witness_testimonies[0]
    # the AI examined in chief (at least 3 questions) and handed over for cross
    assert len(testimony.examination) == 3
    assert testimony.phase == WitnessPhase.CROSS
    assert any(
        e.type == EventType.WITNESS_CALLED and e.speaker_role == "defendant"
        for e in saved.courtroom_proceedings
    )


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
    fake_llm.responder = ExamResponder()
    case = await on_stand(is_ai_examining=True)
    original_upsert = witness_routes.upsert_memory_item

    async def upsert_then_interrupt(
        case_arg, source_type, source_id, content, metadata=None
    ):
        await original_upsert(case_arg, source_type, source_id, content, metadata)
        if metadata and metadata.get("event_type") == "witness_examined_a":
            await Case.find_one(Case.cnr == case.cnr).update_one(interruption)

    monkeypatch.setattr(witness_routes, "upsert_memory_item", upsert_then_interrupt)

    await witness_routes.process_ai_examination(case.cnr)

    assert len(fake_llm.responder.asked) == 1  # stopped before a second question


async def test_answer_is_discarded_if_user_stops_examination_before_it_arrives(
    on_stand, monkeypatch, fake_llm
):
    fake_llm.responder = ExamResponder()
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

    await witness_routes.process_ai_examination(case.cnr)

    saved = await reload(case)
    assert saved.current_witness_id is None
    assert saved.witness_testimonies[0].examination == []
    assert not any(
        e.type == EventType.WITNESS_EXAMINED_A for e in saved.courtroom_proceedings
    )
