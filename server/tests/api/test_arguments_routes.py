"""Tests for argument submission and closing statements."""

import pytest

from app import messages
from app.models.case import (
    ArgumentItem,
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    EvidenceItem,
    Roles,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.models.rate_limit import RateLimitEntry
from app.routes import arguments
from tests.helpers import boom, objection_aware, reload, turn_prompts


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


async def test_defendants_first_argument_is_their_opening_after_case_prep(
    client, auth_headers, courtroom_case, user, fake_llm
):
    # Case Prep already put the AI plaintiff's opening on the record.
    fake_llm.responses.append("AI plaintiff counter")
    case = await courtroom_case(
        "defendant",
        plaintiff_arguments=[arg("AI plaintiff opening", "plaintiff", type_="opening")],
        courtroom_proceedings=[
            event(EventType.OPENING_STATEMENT, "AI plaintiff opening", "plaintiff")
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "defendant", "argument": "We deny it"},
    )

    assert response.json() == {
        "ai_counter_argument": "AI plaintiff counter",
        "ai_counter_role": "plaintiff",
    }
    saved = await reload(case)
    assert [(e.type, e.content) for e in saved.courtroom_proceedings] == [
        (EventType.OPENING_STATEMENT, "AI plaintiff opening"),
        (EventType.OPENING_STATEMENT, "We deny it"),
        (EventType.AI_ARGUMENT, "AI plaintiff counter"),
    ]
    assert saved.defendant_arguments[0].type == "opening"
    assert len(fake_llm.prompts) == 1  # no second AI opening


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
    fake_llm.responder = objection_aware("AI counter argument reply")
    case = await in_progress(user_role)

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": user_role, "argument": "Second point"},
    )

    assert response.json() == {
        "ai_counter_argument": "AI counter argument reply",
        "ai_counter_role": ai_role,
        "ai_objection": None,
    }
    saved = await reload(case)
    assert getattr(saved, f"{ai_role}_arguments")[-1].type == "counter"
    assert saved.courtroom_proceedings[-1].type == EventType.AI_ARGUMENT
    assert "Second point" in turn_prompts(fake_llm)[0]
    assert await usage_count(user) == 1


AI_OBJECTS = (
    '{"object": true, "grounds": "Facts not in evidence", "details": "No exhibit."}'
)


@pytest.mark.parametrize("sustained", [True, False])
async def test_ai_counsel_objects_to_the_argument(
    client, auth_headers, in_progress, user, fake_llm, sustained
):
    ruling = "Sustained. It is struck." if sustained else "Overruled. Fair comment."
    fake_llm.responder = objection_aware(
        "My Lord, the claim fails.",  # a full sentence: no continuation call
        f'{{"sustained": {str(sustained).lower()}, "ruling": "{ruling}"}}',
        objection=AI_OBJECTS,
    )
    case = await in_progress()

    body = (
        await client.post(
            f"/cases/{case.cnr}/arguments",
            headers=auth_headers,
            json={"role": "plaintiff", "argument": "₹50 lakh went missing."},
        )
    ).json()

    assert body["ai_objection"] == {
        "grounds": "Facts not in evidence",
        "sustained": sustained,
        "ruling": ruling,
    }
    saved = await reload(case)
    mine, objection, ruled, *rest = saved.courtroom_proceedings[-4 + sustained :]
    assert mine.content == "₹50 lakh went missing."
    assert objection.type == EventType.OBJECTION
    assert objection.speaker_role == "defendant"
    assert ruled.type == EventType.RULING
    if sustained:
        # Struck, and the floor goes back to the user: no counter.
        assert mine.struck == "struck" and rest == []
        assert body["ai_counter_argument"] is None
        assert saved.defendant_arguments[-1].type == "opening"
    else:
        assert mine.struck is None and rest[0].type == EventType.AI_ARGUMENT
        assert body["ai_counter_argument"] == "My Lord, the claim fails."
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
    fake_llm.responder = objection_aware("AI counter argument reply")
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


async def test_ai_lawyer_and_judge_never_read_party_chats(
    client, auth_headers, in_progress, monkeypatch
):
    requested: list[list[str]] = []

    async def spy(case, query, source_types=None, **kwargs):
        requested.append(list(source_types or []))
        return ""

    monkeypatch.setattr(arguments, "retrieve_case_context", spy)
    case = await in_progress()

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "Point"},
    )
    await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "In conclusion"},
    )

    assert requested and all("party_chat" not in types for types in requested)


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


def test_recent_history_is_chronological_and_capped():
    case = Case.model_construct(
        courtroom_proceedings=[
            event(EventType.OPENING_STATEMENT, "P open", "plaintiff"),
            event(EventType.SYSTEM_MESSAGE, "Witness called", "judge"),
            event(EventType.OPENING_STATEMENT, "D open", "defendant"),
            event(EventType.ARGUMENT, "", "plaintiff"),
            event(EventType.ARGUMENT, "P point", "plaintiff"),
            event(EventType.AI_ARGUMENT, "D reply", "defendant"),
        ]
    )

    assert arguments.recent_history(case).splitlines() == [
        "Plaintiff: P open",
        "Defendant: D open",
        "Plaintiff: P point",
        "Defendant: D reply",
    ]
    assert arguments.recent_history(case, limit=2).splitlines() == [
        "Plaintiff: P point",
        "Defendant: D reply",
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


# ---------------------------------------------------------------------------
# pinned exhibits, the floor, and the closing on the record
# ---------------------------------------------------------------------------


def exhibits():
    return [
        EvidenceItem(
            exhibit_ref="EX-01",
            title="Booking receipts",
            evidence_type="document",
            description="Receipts.",
        ),
        EvidenceItem(
            exhibit_ref="EX-02",
            title="Sanction letter",
            evidence_type="document",
            description="Letter.",
        ),
    ]


async def test_argument_cites_exhibits(client, auth_headers, in_progress, fake_llm):
    fake_llm.responder = objection_aware("AI counter")
    case = await in_progress(evidence=exhibits())

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={
            "role": "plaintiff",
            "argument": "The receipts prove it",
            "exhibit_refs": ["EX-01", "EX-01"],
        },
    )

    assert response.status_code == 200
    saved = await reload(case)
    mine = next(e for e in saved.courtroom_proceedings if e.type == EventType.ARGUMENT)
    assert mine.exhibit_refs == ["EX-01"]
    assert mine.content == "The receipts prove it"  # the record keeps the words only
    assert "Counsel relies on EX-01 (Booking receipts)" in turn_prompts(fake_llm)[0]


def brief():
    """EX-01 is before the court; PN-01 is a privileged note in the user's brief."""
    public, private = exhibits()
    return [
        public,
        private.model_copy(update={"private": True, "exhibit_ref": "PN-01"}),
    ]


async def test_privileged_exhibit_is_hidden_until_cited(
    client, auth_headers, in_progress, fake_llm
):
    fake_llm.responses.append("My Lord, EX-02 proves nothing.")
    case = await in_progress(evidence=brief())

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={
            "role": "plaintiff",
            "argument": "The receipts",
            "exhibit_refs": ["EX-01"],
        },
    )

    saved = await reload(case)
    assert saved.evidence[1].private
    assert not any("Sanction letter" in prompt for prompt in fake_llm.prompts)
    # the other side can't cite what it has never seen
    assert saved.courtroom_proceedings[-1].exhibit_refs == []


async def test_citing_a_privileged_exhibit_tenders_it(
    client, auth_headers, in_progress, fake_llm
):
    fake_llm.responder = objection_aware("AI counter")
    case = await in_progress(evidence=brief())

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "The letter", "exhibit_refs": ["PN-01"]},
    )

    saved = await reload(case)
    assert (saved.evidence[1].private, saved.evidence[1].exhibit_ref) == (
        False,
        "EX-02",
    )
    note, mine = saved.courtroom_proceedings[-3:-1]
    assert note.content == (
        "Counsel for the Plaintiff tenders Sanction letter in evidence as EX-02"
    )
    # the argument cites the exhibit by its new number
    assert (mine.type, mine.exhibit_refs) == (EventType.ARGUMENT, ["EX-02"])
    assert "Counsel relies on EX-02 (Sanction letter)" in turn_prompts(fake_llm)[0]
    assert "EX-02: Sanction letter" in turn_prompts(fake_llm)[0]


async def test_ai_counter_cites_the_exhibits_it_names(
    client, auth_headers, in_progress, fake_llm
):
    fake_llm.responder = objection_aware(
        "My Lord, EX-02 and EX-02 again; EX-09 is not real."
    )
    case = await in_progress(evidence=exhibits())

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "The letter is forged"},
    )

    saved = await reload(case)
    theirs = saved.courtroom_proceedings[-1]
    assert theirs.type == EventType.AI_ARGUMENT
    assert theirs.exhibit_refs == ["EX-02"]  # only real exhibits, once each
    assert saved.defendant_arguments[-1].exhibit_refs == ["EX-02"]


async def test_argument_rejects_unknown_exhibits(client, auth_headers, in_progress):
    case = await in_progress(evidence=exhibits())

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "x", "exhibit_refs": ["EX-09"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Not an exhibit in this case: EX-09"


@pytest.mark.parametrize(
    "overrides",
    [
        {"current_witness_id": "someone"},
        {"is_ai_examining": True},
        {
            "pending_leave": {
                "event_id": "e",
                "witness_id": "w",
                "witness_name": "W",
                "called_by": "defendant",
            }
        },
    ],
)
@pytest.mark.parametrize("closing", [False, True])
async def test_no_arguments_while_witness_business_is_pending(
    client, auth_headers, in_progress, overrides, closing
):
    case = await in_progress(**overrides)

    if closing:
        response = await close(client, auth_headers, case)
    else:
        response = await client.post(
            f"/cases/{case.cnr}/arguments",
            headers=auth_headers,
            json={"role": "plaintiff", "argument": "x"},
        )

    assert response.status_code == 409


async def test_closing_statements_go_on_the_record(
    client, auth_headers, in_progress, user, fake_llm
):
    fake_llm.responses.extend(["AI closing statement text", "**FACTS**\n1. Done."])
    cited = ArgumentItem(
        type="user",
        content="The letter proves it",
        role=Roles.PLAINTIFF,
        user_id=user.id,
        exhibit_refs=["EX-02"],
    )
    case = await in_progress(
        evidence=exhibits(),
        plaintiff_arguments=[
            arg("user opening", "plaintiff", user_id=user.id, type_="opening"),
            cited,
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "I rest"},
    )

    assert response.status_code == 200
    saved = await reload(case)
    mine, theirs, note = saved.courtroom_proceedings[-3:]
    assert (mine.type, mine.content, mine.exhibit_refs) == (
        EventType.CLOSING_STATEMENT,
        "I rest",
        [],
    )
    assert (theirs.type, theirs.speaker_role, theirs.content) == (
        EventType.CLOSING_STATEMENT,
        "defendant",
        "AI closing statement text",
    )
    assert (
        note.type == EventType.SYSTEM_MESSAGE and note.content == "Judgment delivered"
    )
    # The judge weighs each argument with the exhibits it cited.
    assert (
        "The letter proves it\n\n[Counsel relies on EX-02 (Sanction letter).]"
        in fake_llm.prompts[1]
    )


async def test_closing_statement_cannot_cite_exhibits(
    client, auth_headers, in_progress, fake_llm
):
    case = await in_progress(evidence=exhibits())

    response = await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "I rest", "exhibit_refs": ["EX-02"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.NO_EXHIBITS_IN_STATEMENTS
    assert fake_llm.prompts == []
    assert (await reload(case)).status == CaseStatus.ACTIVE


async def test_opening_statement_cannot_cite_exhibits(
    client, auth_headers, in_progress, fake_llm
):
    case = await in_progress(
        evidence=exhibits(), plaintiff_arguments=[], defendant_arguments=[]
    )

    response = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "Opening", "exhibit_refs": ["EX-01"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.NO_EXHIBITS_IN_STATEMENTS
    assert fake_llm.prompts == []


def test_struck_arguments_leave_the_ai_history():
    case = Case.model_construct(
        courtroom_proceedings=[
            event(EventType.ARGUMENT, "kept", "plaintiff"),
            event(EventType.AI_ARGUMENT, "gone", "defendant", struck="struck"),
        ]
    )

    assert arguments.recent_history(case) == "Plaintiff: kept"
