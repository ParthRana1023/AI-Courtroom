"""Tests for parties, evidence, location, feedback, client-log, analysis and rate-limit routes."""

import pytest

from app.config import settings
from app.models.case import (
    ArgumentItem,
    CaseStatus,
    EvidenceItem,
    EvidenceMediaStatus,
    Roles,
)
from app.models.client_log import ClientLog
from app.models.feedback import Feedback
from app.models.party import PartyInvolved, PartyRole
from app.routes import case_analysis as analysis_routes
from app.routes import evidence as evidence_routes
from app.routes import location as location_routes
from app.routes import parties as parties_routes
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import argument_rate_limiter, case_generation_rate_limiter
from tests.helpers import boom, reload

# ---------------------------------------------------------------------------
# parties
# ---------------------------------------------------------------------------


@pytest.fixture
def prep_case(courtroom_case, witness_party, other_party):
    """Case in preparation (not yet in the courtroom), plaintiff chosen."""

    async def _make(side="plaintiff", **overrides):
        return await courtroom_case(side, status=CaseStatus.NOT_STARTED, **overrides)

    return _make


def test_can_user_chat_with_party_rules():
    can = parties_routes.can_user_chat_with_party

    assert can(Roles.PLAINTIFF, PartyRole.APPLICANT) is True
    assert can(Roles.DEFENDANT, PartyRole.NON_APPLICANT) is True
    assert can(Roles.PLAINTIFF, PartyRole.NON_APPLICANT) is False
    assert can(None, PartyRole.APPLICANT) is False


async def test_list_parties_with_chat_access(
    client, auth_headers, prep_case, witness_party
):
    case = await prep_case(
        party_chats={witness_party.id: [{"sender": "user", "content": "hi"}]}
    )

    body = (await client.get(f"/cases/{case.cnr}/parties", headers=auth_headers)).json()

    assert {p["name"]: p["can_chat"] for p in body["parties"]} == {
        "Ravi Kumar": True,
        "Asha Rao": False,
    }
    assert body["can_access_courtroom"] is True
    assert (body["user_role"], body["is_in_courtroom"], body["case_status"]) == (
        "plaintiff",
        False,
        "not started",
    )


async def test_list_parties_in_courtroom_disables_chat(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case()

    body = (await client.get(f"/cases/{case.cnr}/parties", headers=auth_headers)).json()

    assert not any(p["can_chat"] for p in body["parties"])
    assert body["can_access_courtroom"] is False


async def test_party_details_generates_missing_bio(
    client, auth_headers, prep_case, fake_llm
):
    fake_llm.responses.append("## Role\n**NON-APPLICANT**\nA landlord.")
    no_bio = PartyInvolved(name="New Person", role=PartyRole.NON_APPLICANT)
    case = await prep_case(parties_involved=[no_bio])

    body = (
        await client.get(f"/cases/{case.cnr}/parties/{no_bio.id}", headers=auth_headers)
    ).json()

    assert "A landlord." in body["bio"]
    assert (await reload(case)).parties_involved[0].bio == body["bio"]


async def test_party_details_existing_bio_and_missing_party(
    client, auth_headers, prep_case, witness_party, fake_llm
):
    case = await prep_case()

    ok = await client.get(
        f"/cases/{case.cnr}/parties/{witness_party.id}", headers=auth_headers
    )
    missing = await client.get(
        f"/cases/{case.cnr}/parties/nobody", headers=auth_headers
    )

    assert ok.json()["can_chat"] is True and fake_llm.calls == []
    assert missing.status_code == 404


@pytest.mark.parametrize("target", ["generate_party_details", "upsert_memory_item"])
async def test_party_details_failures(
    client, auth_headers, prep_case, monkeypatch, target
):
    monkeypatch.setattr(parties_routes, target, boom)
    no_bio = PartyInvolved(name="New Person", role=PartyRole.APPLICANT)
    case = await prep_case(parties_involved=[no_bio])

    response = await client.get(
        f"/cases/{case.cnr}/parties/{no_bio.id}", headers=auth_headers
    )

    assert response.status_code == 500


async def test_chat_with_party_saves_history(
    client, auth_headers, prep_case, witness_party, fake_llm
):
    fake_llm.responses.append("I paid on the first of every month.")
    case = await prep_case()

    response = await client.post(
        f"/cases/{case.cnr}/parties/{witness_party.id}/chat",
        headers=auth_headers,
        json={"message": "When did you pay?"},
    )

    body = response.json()
    assert body["party_response"]["content"] == "I paid on the first of every month."
    history = (
        await client.get(
            f"/cases/{case.cnr}/parties/{witness_party.id}/chat-history",
            headers=auth_headers,
        )
    ).json()
    assert [m["sender"] for m in history["messages"]] == ["user", "party"]
    assert history["party_name"] == "Ravi Kumar"


async def test_chat_is_limited_to_a_few_messages_per_minute(
    client, auth_headers, prep_case, witness_party, fake_llm
):
    fake_llm.responses.extend(["ok"] * settings.party_chat_rate_limit)
    case = await prep_case()
    url = f"/cases/{case.cnr}/parties/{witness_party.id}/chat"

    for _ in range(settings.party_chat_rate_limit):
        response = await client.post(url, headers=auth_headers, json={"message": "Hi?"})
        assert response.status_code == 200

    blocked = await client.post(url, headers=auth_headers, json={"message": "Hi?"})

    assert blocked.status_code == 429
    assert "wait a minute" in blocked.json()["detail"]
    assert len(fake_llm.calls) == settings.party_chat_rate_limit


async def test_chat_generates_bio_first_for_new_party(
    client, auth_headers, prep_case, fake_llm
):
    fake_llm.responses.extend(["## Role\n**APPLICANT**", "Hello, sir."])
    no_bio = PartyInvolved(name="New Person", role=PartyRole.APPLICANT)
    case = await prep_case(parties_involved=[no_bio])

    response = await client.post(
        f"/cases/{case.cnr}/parties/{no_bio.id}/chat",
        headers=auth_headers,
        json={"message": "Hi"},
    )

    assert response.json()["party_response"]["content"] == "Hello, sir."
    assert (await reload(case)).parties_involved[0].bio == "## Role\n**APPLICANT**"


@pytest.mark.parametrize(
    "status, party_key, side, expected",
    [
        (CaseStatus.ACTIVE, "witness", "plaintiff", 403),
        (CaseStatus.RESOLVED, "witness", "plaintiff", 403),
        (CaseStatus.NOT_STARTED, "missing", "plaintiff", 404),
        (CaseStatus.NOT_STARTED, "other", "plaintiff", 403),
        (CaseStatus.NOT_STARTED, "witness", "defendant", 403),
    ],
)
async def test_chat_rejections(
    client,
    auth_headers,
    courtroom_case,
    witness_party,
    other_party,
    status,
    party_key,
    side,
    expected,
):
    case = await courtroom_case(side, status=status)
    party_id = {
        "witness": witness_party.id,
        "other": other_party.id,
        "missing": "nobody",
    }[party_key]

    response = await client.post(
        f"/cases/{case.cnr}/parties/{party_id}/chat",
        headers=auth_headers,
        json={"message": "Hi"},
    )

    assert response.status_code == expected


@pytest.mark.parametrize(
    "target, needs_bio",
    [
        ("generate_party_details", True),
        ("upsert_memory_item", True),
        ("chat_with_party", False),
        ("upsert_memory_item", False),
    ],
)
async def test_chat_failures(
    client, auth_headers, prep_case, witness_party, monkeypatch, target, needs_bio
):
    monkeypatch.setattr(parties_routes, target, boom)
    party = (
        PartyInvolved(name="New", role=PartyRole.APPLICANT)
        if needs_bio
        else witness_party
    )
    case = await prep_case(parties_involved=[party])

    response = await client.post(
        f"/cases/{case.cnr}/parties/{party.id}/chat",
        headers=auth_headers,
        json={"message": "Hi"},
    )

    assert response.status_code == 500


async def test_chat_history_defaults_and_missing_party(
    client, auth_headers, prep_case, witness_party
):
    case = await prep_case(
        party_chats={
            witness_party.id: [
                {
                    "content": "legacy message",
                    "timestamp": get_current_datetime().isoformat(),
                }
            ]
        }
    )

    history = (
        await client.get(
            f"/cases/{case.cnr}/parties/{witness_party.id}/chat-history",
            headers=auth_headers,
        )
    ).json()
    missing = await client.get(
        f"/cases/{case.cnr}/parties/nobody/chat-history", headers=auth_headers
    )

    assert history["messages"][0]["sender"] == "party"
    assert missing.status_code == 404


async def test_chat_message_with_braces_gets_real_reply(
    client, auth_headers, prep_case, witness_party, fake_llm
):
    fake_llm.responses.append("Yes, it said paid.")
    case = await prep_case()

    response = await client.post(
        f"/cases/{case.cnr}/parties/{witness_party.id}/chat",
        headers=auth_headers,
        json={"message": "Did it say {paid}?"},
    )

    assert response.json()["party_response"]["content"] == "Yes, it said paid."


# ---------------------------------------------------------------------------
# evidence
# ---------------------------------------------------------------------------


async def test_get_evidence_backfills_legacy_case(
    client, user, auth_headers, make_case, fake_llm
):
    fake_llm.responses.append(
        '[{"title": "Lease", "evidence_type": "Document", "description": "Signed lease"}]'
    )
    case = await make_case(user)

    body = (
        await client.get(f"/cases/{case.cnr}/evidence", headers=auth_headers)
    ).json()

    assert [e["exhibit_ref"] for e in body["evidence"]] == ["EX-01"]
    assert len((await reload(case)).evidence) == 1


async def test_get_evidence_existing_and_backfill_failure(
    client, user, auth_headers, make_case, monkeypatch, fake_llm
):
    existing = await make_case(
        user,
        evidence=[
            EvidenceItem(
                exhibit_ref="EX-01", title="T", evidence_type="Doc", description="D"
            )
        ],
    )
    assert (
        len(
            (
                await client.get(
                    f"/cases/{existing.cnr}/evidence", headers=auth_headers
                )
            ).json()["evidence"]
        )
        == 1
    )

    fake_llm.responses.append('[{"title": "Lease"}]')

    monkeypatch.setattr(evidence_routes, "index_evidence_item", boom)
    legacy = await make_case(user)
    assert (
        await client.get(f"/cases/{legacy.cnr}/evidence", headers=auth_headers)
    ).status_code == 500


async def test_add_evidence_generates_image_when_role_selected(
    client, auth_headers, courtroom_case, image_pipeline, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 2)
    case = await courtroom_case(
        evidence=[
            EvidenceItem(
                exhibit_ref="EX-04", title="Old", evidence_type="Doc", description="d"
            )
        ]
    )

    response = await client.post(
        f"/cases/{case.cnr}/evidence",
        headers=auth_headers,
        json={
            "title": "Photo",
            "evidence_type": "Digital",
            "description": "Scene photo",
            "image_prompt": "A photo",
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert body["evidence"]["exhibit_ref"] == "EX-05"
    assert body["image_generation"]["generated"] == 1


async def test_add_evidence_without_role_skips_images(
    client, user, auth_headers, make_case
):
    case = await make_case(user)

    response = await client.post(
        f"/cases/{case.cnr}/evidence",
        headers=auth_headers,
        json={"title": "T", "evidence_type": "Document", "description": "D"},
    )

    assert response.json()["image_generation"] is None


async def test_extract_evidence(client, user, auth_headers, make_case, fake_llm):
    fake_llm.responses.append(
        '{"title": "Receipt", "evidence_type": "Document", "description": "Paid 5000"}'
    )
    case = await make_case(user)

    response = await client.post(
        f"/cases/{case.cnr}/evidence/extract",
        headers=auth_headers,
        json={"text": "I paid 5000", "source": "Ravi"},
    )

    assert response.json()["evidence"]["title"] == "Receipt"
    assert response.json()["evidence"]["source"] == "Ravi"


@pytest.mark.parametrize(
    "path, body",
    [
        ("evidence", {"title": "T", "evidence_type": "Document", "description": "D"}),
        ("evidence/extract", {"text": "x"}),
    ],
)
async def test_add_and_extract_failures(
    client, user, auth_headers, make_case, monkeypatch, path, body
):
    monkeypatch.setattr(evidence_routes, "index_evidence_item", boom)
    case = await make_case(user)

    response = await client.post(
        f"/cases/{case.cnr}/{path}", headers=auth_headers, json=body
    )

    assert response.status_code == 500


async def test_generate_missing_and_regenerate_images(
    client, user, auth_headers, make_case, image_pipeline, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 3)
    failed = EvidenceItem(
        exhibit_ref="EX-02",
        title="B",
        evidence_type="Doc",
        description="d",
        image_prompt="p",
        media_status=EvidenceMediaStatus.FAILED,
    )
    case = await make_case(
        user,
        evidence=[
            EvidenceItem(
                exhibit_ref="EX-01",
                title="A",
                evidence_type="Doc",
                description="d",
                image_prompt="p",
            ),
            failed,
        ],
    )

    missing = (
        await client.post(
            f"/cases/{case.cnr}/evidence/images/generate-missing", headers=auth_headers
        )
    ).json()
    assert missing["image_generation"]["generated"] == 2

    again = (
        await client.post(
            f"/cases/{case.cnr}/evidence/{failed.id}/image/regenerate",
            headers=auth_headers,
        )
    ).json()
    assert (
        again["image_generation"]["message"]
        == "Evidence image has already been generated."
    )
    assert (
        await client.post(
            f"/cases/{case.cnr}/evidence/unknown/image/regenerate", headers=auth_headers
        )
    ).status_code == 404


# ---------------------------------------------------------------------------
# location (CSC service functions faked at the route boundary)
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_locations(monkeypatch):
    async def countries():
        return [{"name": "India", "iso2": "IN"}]

    async def states(country):
        return [{"name": "Goa", "iso2": "GA"}]

    async def cities(country, state):
        return [{"name": "Panaji"}]

    async def search(q, limit):
        return [{"name": q, "limit": limit}]

    async def phone(country):
        return "91" if country == "IN" else None

    for name, fn in [
        ("get_countries", countries),
        ("get_states", states),
        ("get_cities", cities),
        ("search_locations", search),
        ("get_phone_code", phone),
    ]:
        monkeypatch.setattr(location_routes, name, fn)


async def test_location_routes(client, fake_locations):
    assert (await client.get("/location/countries")).json()[0]["iso2"] == "IN"
    assert (await client.get("/location/states/IN")).json()[0]["name"] == "Goa"
    assert (await client.get("/location/cities/IN/GA")).json()[0]["name"] == "Panaji"
    assert (await client.get("/location/search?q=Pan&limit=5")).json() == [
        {"name": "Pan", "limit": 5}
    ]
    assert (await client.get("/location/phone-code/IN")).json() == {"phone_code": "91"}
    assert (await client.get("/location/phone-code/XX")).status_code == 404
    assert (await client.get("/location/search?q=P")).status_code == 422
    states = (await client.get("/location/indian-states")).json()
    assert any(s["state_iso2"] == "MH" for s in states)


@pytest.mark.parametrize(
    "path, target",
    [
        ("/location/countries", "get_countries"),
        ("/location/states/IN", "get_states"),
        ("/location/cities/IN/GA", "get_cities"),
        ("/location/search?q=Pune", "search_locations"),
        ("/location/phone-code/IN", "get_phone_code"),
    ],
)
async def test_location_routes_report_provider_errors(
    client, monkeypatch, path, target
):
    async def api_timeout(*args, **kwargs):
        raise RuntimeError("Request to location API timed out")

    monkeypatch.setattr(location_routes, target, api_timeout)

    response = await client.get(path)

    assert response.status_code == 500
    assert "timed out" in response.json()["detail"]


# ---------------------------------------------------------------------------
# feedback
# ---------------------------------------------------------------------------


async def test_submit_feedback_uses_profile_details(client, user, auth_headers):
    response = await client.post(
        "/feedback/submit",
        headers=auth_headers,
        json={
            "feedback_category": "bug_report",
            "message": "The gavel sound is too loud.",
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert (body["email"], body["feedback_category"]) == (user.email, "bug_report")
    assert await Feedback.find(Feedback.user_id == str(user.id)).count() == 1


async def test_submit_feedback_validation_and_failure(
    client, auth_headers, monkeypatch
):
    short = await client.post(
        "/feedback/submit",
        headers=auth_headers,
        json={"feedback_category": "other", "message": "short"},
    )
    assert short.status_code == 422

    monkeypatch.setattr(Feedback, "insert", boom)
    failed = await client.post(
        "/feedback/submit",
        headers=auth_headers,
        json={"feedback_category": "other", "message": "A long enough message"},
    )
    assert failed.status_code == 500


# ---------------------------------------------------------------------------
# client logs
# ---------------------------------------------------------------------------


def log_entry(**overrides):
    entry = {
        "level": "info",
        "category": "api",
        "message": "Loaded",
        "timestamp": "2026-09-26T10:00:00Z",
        "session_id": "s1",
        "url": "/dashboard",
        "user_agent": "pytest",
    }
    entry.update(overrides)
    return entry


async def test_client_logs_are_stored_and_counted(client):
    response = await client.post(
        "/logs/client",
        json={
            "logs": [
                log_entry(),
                log_entry(level="error", error_stack="Traceback"),
                log_entry(level="warn", timestamp="not-a-date"),
            ]
        },
    )

    assert response.json() == {"received": 3}
    assert await ClientLog.find_all().count() == 3
    stored = {log.level: log for log in await ClientLog.find_all().to_list()}
    assert stored["error"].error_stack == "Traceback"


async def test_client_log_stats_counts_recent_logs(client):
    await client.post(
        "/logs/client", json={"logs": [log_entry(level="warn", timestamp="not-a-date")]}
    )

    stats = (await client.get("/logs/client/stats")).json()

    assert stats["period"] == "last_24_hours"
    assert stats["counts"] == {"warn": 1}


async def test_client_log_storage_errors_are_swallowed(client, monkeypatch):
    monkeypatch.setattr(ClientLog, "insert", boom)

    assert (
        await client.post("/logs/client", json={"logs": [log_entry()]})
    ).status_code == 200


async def test_client_log_stats_error_is_reported(client, monkeypatch):
    def broken_collection():
        raise RuntimeError("db down")

    monkeypatch.setattr(ClientLog, "get_pymongo_collection", broken_collection)

    assert (await client.get("/logs/client/stats")).json() == {"error": "db down"}


# ---------------------------------------------------------------------------
# case analysis
# ---------------------------------------------------------------------------


async def test_analysis_uses_role_from_user_arguments(
    client, user, auth_headers, make_case, fake_llm
):
    fake_llm.responses.append("### Outcome\nYou won.")
    case = await make_case(
        user,
        ai_role=Roles.PLAINTIFF,
        verdict="Suit dismissed",
        plaintiff_arguments=[
            ArgumentItem(type="counter", content="AI point", role=Roles.PLAINTIFF)
        ],
        defendant_arguments=[
            ArgumentItem(
                type="user", content="My point", role=Roles.DEFENDANT, user_id=user.id
            )
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    assert response.json() == {"analysis": "### Outcome\nYou won."}
    assert "USER'S ROLE: DEFENDANT" in fake_llm.prompts[0]
    assert (await reload(case)).analysis == "### Outcome\nYou won."


async def test_analysis_role_from_plaintiff_arguments_or_case(
    client, user, auth_headers, make_case, fake_llm
):
    by_argument = await make_case(
        user,
        plaintiff_arguments=[
            ArgumentItem(
                type="user", content="P", role=Roles.PLAINTIFF, user_id=user.id
            )
        ],
    )
    by_case = await make_case(
        user,
        user_role=Roles.DEFENDANT,
        defendant_arguments=[ArgumentItem(type="counter", content="x")],
    )

    await client.post(f"/cases/{by_argument.cnr}/analyze-case", headers=auth_headers)
    await client.post(f"/cases/{by_case.cnr}/analyze-case", headers=auth_headers)

    assert "USER'S ROLE: PLAINTIFF" in fake_llm.prompts[0]
    assert "USER'S ROLE: DEFENDANT" in fake_llm.prompts[1]


async def test_analysis_rejections(client, user, auth_headers, make_case, make_user):
    undetermined = await make_case(user)
    foreign = await make_case(await make_user(), user_role=Roles.PLAINTIFF)

    assert (
        await client.post(
            f"/cases/{undetermined.cnr}/analyze-case", headers=auth_headers
        )
    ).status_code == 400
    assert (
        await client.post(f"/cases/{foreign.cnr}/analyze-case", headers=auth_headers)
    ).status_code == 403


async def test_analysis_failures(
    client, user, auth_headers, make_case, fake_llm, monkeypatch
):
    case = await make_case(
        user,
        user_role=Roles.PLAINTIFF,
        plaintiff_arguments=[ArgumentItem(type="user", content="P")],
    )

    fake_llm.error = RuntimeError("down")
    assert (
        await client.post(f"/cases/{case.cnr}/analyze-case", headers=auth_headers)
    ).status_code == 500

    fake_llm.error = None

    monkeypatch.setattr(analysis_routes, "upsert_memory_item", boom)
    assert (
        await client.post(f"/cases/{case.cnr}/analyze-case", headers=auth_headers)
    ).status_code == 500


# ---------------------------------------------------------------------------
# rate-limit status
# ---------------------------------------------------------------------------


async def test_rate_limit_status_endpoints(client, user, auth_headers):
    await argument_rate_limiter.register_usage(str(user.id))

    argument = (await client.get("/limit/argument", headers=auth_headers)).json()
    generation = (
        await client.get("/limit/case-generation", headers=auth_headers)
    ).json()

    assert argument == {
        "remaining_attempts": argument_rate_limiter.requests - 1,
        "max_attempts": argument_rate_limiter.requests,
        "seconds_until_next": None,
    }
    assert generation["remaining_attempts"] == case_generation_rate_limiter.requests


@pytest.mark.parametrize(
    "path, limiter",
    [
        ("/limit/argument", argument_rate_limiter),
        ("/limit/case-generation", case_generation_rate_limiter),
    ],
)
async def test_rate_limit_status_errors(
    client, auth_headers, monkeypatch, path, limiter
):
    monkeypatch.setattr(limiter, "get_remaining_attempts", boom)

    assert (await client.get(path, headers=auth_headers)).status_code == 500
