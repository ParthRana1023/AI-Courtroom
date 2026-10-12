"""Tests for objections, reports of AI responses and the court's session lines."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models.case import (
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    WitnessTestimony,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.models.report import Report
from app.routes import courtroom
from tests.helpers import reload

SUSTAINED = '{"sustained": true, "ruling": "No exhibit supports that figure. It is struck from the record."}'
OVERRULED = '{"sustained": false, "ruling": "Overruled. Counsel may argue inferences from the record."}'


def said(type_, content, role, **extra):
    return CourtroomProceedingsEvent(
        type=type_, content=content, speaker_role=role, **extra
    )


async def object_to(client, headers, case, target_id, grounds, details=""):
    return await client.post(
        f"/cases/{case.cnr}/objections",
        headers=headers,
        json={"target_id": target_id, "grounds": grounds, "details": details},
    )


# ---------------------------------------------------------------------------
# objections
# ---------------------------------------------------------------------------


async def test_sustained_objection_strikes_the_argument(
    client, auth_headers, courtroom_case, fake_llm
):
    fake_llm.responses.append(SUSTAINED)
    theirs = said(EventType.AI_ARGUMENT, "₹50 lakh went missing.", "defendant")
    case = await courtroom_case(courtroom_proceedings=[theirs])

    response = await object_to(
        client, auth_headers, case, theirs.id, "Facts not in evidence", "No exhibit."
    )

    assert response.json() == {
        "sustained": True,
        "ruling": "Sustained. No exhibit supports that figure. It is struck from the record.",
    }
    saved = await reload(case)
    target, objection, ruling = saved.courtroom_proceedings
    assert target.struck == "struck"
    assert objection.type == EventType.OBJECTION
    assert objection.content == "Objection. Facts not in evidence. No exhibit."
    assert objection.speaker_role == "plaintiff"
    assert objection.objection.target_id == theirs.id
    assert ruling.type == EventType.RULING and ruling.sustained is True
    assert "Facts not in evidence" in fake_llm.prompts[0]


async def test_overruled_objection_leaves_the_record_alone(
    client, auth_headers, courtroom_case, fake_llm
):
    fake_llm.responses.append(OVERRULED)
    theirs = said(EventType.AI_ARGUMENT, "Intent is shown by conduct.", "defendant")
    case = await courtroom_case(courtroom_proceedings=[theirs])

    body = (
        await object_to(client, auth_headers, case, theirs.id, "Argumentative")
    ).json()

    assert body["sustained"] is False
    saved = await reload(case)
    assert saved.courtroom_proceedings[0].struck is None
    assert saved.courtroom_proceedings[-1].content.startswith("Overruled.")


async def test_sustained_objection_withdraws_question_and_strikes_answer(
    client, auth_headers, courtroom_case, fake_llm, witness_party
):
    fake_llm.responses.append(
        '{"sustained": true, "ruling": "Sustained. Counsel will rephrase."}'
    )
    question = said(
        EventType.WITNESS_EXAMINED_Q,
        "You knew, didn't you?",
        "defendant",
        witness_id=witness_party.id,
    )
    answer = said(
        EventType.WITNESS_EXAMINED_A, "Yes.", "applicant", witness_id=witness_party.id
    )
    case = await courtroom_case(
        courtroom_proceedings=[question, answer],
        witness_testimonies=[
            WitnessTestimony(
                witness_id=witness_party.id,
                witness_name=witness_party.name,
                called_by="defendant",  # the AI's own witness: leading isn't allowed
            )
        ],
    )

    body = (
        await object_to(client, auth_headers, case, question.id, "Leading question")
    ).json()

    assert body["sustained"] is True
    q, a = (await reload(case)).courtroom_proceedings[:2]
    assert q.struck == "withdrawn" and a.struck == "struck"


async def test_leading_questions_are_allowed_in_cross(
    client, auth_headers, courtroom_case, fake_llm, witness_party
):
    question = said(
        EventType.WITNESS_EXAMINED_Q,
        "You signed it, didn't you?",
        "defendant",
        witness_id=witness_party.id,
    )
    case = await courtroom_case(
        courtroom_proceedings=[question],
        witness_testimonies=[
            WitnessTestimony(
                witness_id=witness_party.id,
                witness_name=witness_party.name,
                called_by="plaintiff",  # the user's witness: the AI is cross-examining
            )
        ],
    )

    body = (
        await object_to(client, auth_headers, case, question.id, "Leading question")
    ).json()

    assert body == {"sustained": False, "ruling": courtroom.LEADING_IN_CROSS}
    assert fake_llm.calls == []  # no judge needed


async def test_objection_rejections(client, auth_headers, courtroom_case, fake_llm):
    fake_llm.responses.append(OVERRULED)
    mine = said(EventType.ARGUMENT, "My point", "plaintiff")
    theirs = said(EventType.AI_ARGUMENT, "Their point", "defendant")
    later = said(EventType.ARGUMENT, "Moving on", "plaintiff")
    leave = said(EventType.LEAVE_REQUEST, "Leave to call", "defendant")
    case = await courtroom_case(courtroom_proceedings=[mine, theirs, leave])
    moved_on = await courtroom_case(courtroom_proceedings=[theirs, later])
    adjourned = await courtroom_case(
        status=CaseStatus.ADJOURNED, courtroom_proceedings=[theirs]
    )

    async def status(c, target, grounds="Argumentative"):
        return (await object_to(client, auth_headers, c, target, grounds)).status_code

    assert await status(case, "missing") == 404
    assert await status(case, mine.id) == 400  # your own side
    assert await status(case, leave.id) == 400  # answered from the request itself
    assert await status(case, theirs.id, "Hearsay") == 400  # a question's grounds
    assert await status(moved_on, theirs.id) == 409
    assert await status(adjourned, theirs.id) == 409
    assert await status(case, theirs.id) == 200
    assert await status(case, theirs.id) == 409  # only once


async def test_unparseable_ruling_is_a_503(
    client, auth_headers, courtroom_case, fake_llm
):
    fake_llm.responses.append("I think it should be sustained")
    theirs = said(EventType.AI_ARGUMENT, "Their point", "defendant")
    case = await courtroom_case(courtroom_proceedings=[theirs])

    response = await object_to(client, auth_headers, case, theirs.id, "Irrelevant")

    assert response.status_code == 503
    saved = await reload(case)
    assert len(saved.courtroom_proceedings) == 1
    assert saved.objection_pending is False  # the examination isn't left waiting


async def test_examination_waits_while_the_court_rules(
    client, auth_headers, courtroom_case, monkeypatch, witness_party
):
    question = said(
        EventType.WITNESS_EXAMINED_Q,
        "You knew, didn't you?",
        "defendant",
        witness_id=witness_party.id,
    )
    case = await courtroom_case(courtroom_proceedings=[question])
    seen: list[bool] = []

    async def judge_rules(**kwargs):
        seen.append((await reload(case)).objection_pending)
        return True, "Sustained. Counsel will rephrase."

    monkeypatch.setattr(courtroom.judge, "rule_on_objection", judge_rules)

    response = await object_to(client, auth_headers, case, question.id, "Hearsay")

    assert response.status_code == 200
    assert seen == [True]  # the AI's examination held off during the ruling
    assert (await reload(case)).objection_pending is False


async def test_opening_the_objection_holds_the_examination(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case()
    adjourned = await courtroom_case(status=CaseStatus.ADJOURNED)

    async def hold(c, on):
        return await client.post(
            f"/cases/{c.cnr}/objections/hold", headers=auth_headers, json={"on": on}
        )

    assert (await hold(case, True)).json() == {"held": True}
    assert (await reload(case)).objection_pending is True
    assert (await hold(case, False)).status_code == 200  # withdrawn
    assert (await reload(case)).objection_pending is False
    assert (await hold(adjourned, True)).status_code == 409


def test_a_forgotten_objection_stops_holding_the_examination():
    now = datetime.now(UTC)
    assert Case.model_construct(objection_pending_at=now).objection_pending
    stale = now - Case.OBJECTION_HOLD - timedelta(seconds=1)
    assert not Case.model_construct(objection_pending_at=stale).objection_pending
    naive = now.replace(tzinfo=None)  # as MongoDB returns it
    assert Case.model_construct(objection_pending_at=naive).objection_pending


# ---------------------------------------------------------------------------
# reports
# ---------------------------------------------------------------------------


async def report(client, headers, case, entry_id, reason="law", details=""):
    return await client.post(
        f"/cases/{case.cnr}/reports",
        headers=headers,
        json={"entry_id": entry_id, "reason": reason, "details": details},
    )


async def test_report_an_ai_response_once(client, auth_headers, courtroom_case, user):
    theirs = said(EventType.AI_ARGUMENT, "Section 999 applies.", "defendant")
    case = await courtroom_case(courtroom_proceedings=[theirs], verdict="Judgment.")

    first = await report(
        client, auth_headers, case, theirs.id, "law", "No such section"
    )
    again = await report(client, auth_headers, case, theirs.id, "facts")
    verdict = await report(client, auth_headers, case, "verdict", "role")

    assert first.json() == again.json() == verdict.json() == {"reported": True}
    saved = await Report.find(Report.cnr == case.cnr).to_list()
    assert [(r.entry_id, r.reason, r.excerpt) for r in saved] == [
        (theirs.id, "law", "Section 999 applies."),
        ("verdict", "role", "Judgment."),
    ]
    assert saved[0].details == "No such section" and saved[0].user_id == user.id

    body = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()
    assert sorted(body["reported"]) == sorted([theirs.id, "verdict"])


async def test_report_rejections(client, auth_headers, courtroom_case):
    mine = said(EventType.ARGUMENT, "My point", "plaintiff")
    theirs = said(EventType.AI_ARGUMENT, "Their point", "defendant")
    case = await courtroom_case(courtroom_proceedings=[mine, theirs])

    async def status(entry_id, reason="law"):
        return (await report(client, auth_headers, case, entry_id, reason)).status_code

    assert await status(mine.id) == 400  # not an AI response
    assert await status("verdict") == 400  # no verdict yet
    assert await status(theirs.id, "other") == 400  # "other" needs details
    assert await status(theirs.id, "rude") == 422


# ---------------------------------------------------------------------------
# the court's own lines in the record
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body, note",
    [
        ({"status": "adjourned"}, "Court adjourned by counsel"),
        ({"status": "adjourned", "reason": "limit"}, "Court adjourned for the day"),
    ],
)
async def test_adjourning_is_recorded(client, auth_headers, courtroom_case, body, note):
    case = await courtroom_case()

    await client.put(f"/cases/{case.cnr}/status", headers=auth_headers, json=body)

    assert (await reload(case)).courtroom_proceedings[-1].content == note


async def test_opening_the_session_is_recorded_once(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case(status=CaseStatus.ADJOURNED)

    for _ in range(2):
        await client.put(
            f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
        )

    notes = [e.content for e in (await reload(case)).courtroom_proceedings]
    assert notes == ["Court is in session"]


async def test_court_sits_before_the_opening_prepared_in_case_prep(
    client, auth_headers, courtroom_case
):
    # Case Prep put the AI plaintiff's opening on the record before the court sat.
    prepared = said(EventType.OPENING_STATEMENT, "AI plaintiff opening", "plaintiff")
    case = await courtroom_case(
        "defendant", status=CaseStatus.NOT_STARTED, courtroom_proceedings=[prepared]
    )

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )

    first, opening = (await reload(case)).courtroom_proceedings
    assert first.content == "Court is in session"
    assert opening.content == "AI plaintiff opening"
    assert opening.timestamp >= first.timestamp
