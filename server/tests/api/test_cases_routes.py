"""Tests for /cases routes: listing, status, roles, recycle bin, history and generation."""

from datetime import timedelta

import pytest

from app.models.case import (
    ArgumentItem,
    Case,
    CaseStatus,
    EvidenceItem,
    Roles,
    WitnessTestimony,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.models.case_memory import CaseMemoryChunk
from app.models.rate_limit import RateLimitEntry
from app.routes import cases as cases_routes
from app.services.high_court_mapping import INDIAN_HIGH_COURTS
from app.utils.datetime import get_current_datetime
from tests.helpers import boom, reload

# ---------------------------------------------------------------------------
# read endpoints
# ---------------------------------------------------------------------------


async def test_cases_require_authentication(client):
    assert (await client.get("/cases")).status_code == 401


async def test_list_cases_excludes_deleted(client, user, auth_headers, make_case):
    live = await make_case(user)
    await make_case(user, is_deleted=True)

    response = await client.get("/cases", headers=auth_headers)

    assert [c["cnr"] for c in response.json()] == [live.cnr]


async def test_get_case_returns_courtroom_view(client, user, auth_headers, make_case):
    case = await make_case(user, user_role=Roles.DEFENDANT, verdict="Decreed")

    body = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()

    assert body["case_text"] == case.details
    assert body["user_role"] == "defendant" and body["verdict"] == "Decreed"
    assert body["courtroom_proceedings"] == [] and body["evidence"] == []


async def test_get_missing_case(client, auth_headers):
    assert (
        await client.get("/cases/NOPE000000000000", headers=auth_headers)
    ).status_code == 404


async def test_history_by_cnr_and_object_id(client, user, auth_headers, make_case):
    case = await make_case(
        user,
        verdict="V",
        plaintiff_arguments=[ArgumentItem(type="opening", content="P")],
    )

    by_cnr = (
        await client.get(f"/cases/{case.cnr}/history", headers=auth_headers)
    ).json()
    by_id = (await client.get(f"/cases/{case.id}/history", headers=auth_headers)).json()

    assert by_cnr["verdict"] == by_id["verdict"] == "V"
    assert by_cnr["plaintiff_arguments"][0]["content"] == "P"


async def test_history_not_found_and_forbidden(
    client, auth_headers, make_user, make_case
):
    foreign = await make_case(await make_user())

    assert (
        await client.get("/cases/unknown/history", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.get("/cases/" + "f" * 24 + "/history", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.get("/cases/" + "z" * 24 + "/history", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.get(f"/cases/{foreign.cnr}/history", headers=auth_headers)
    ).status_code == 403


# ---------------------------------------------------------------------------
# ownership checks shared by mutating endpoints
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body, detail",
    [
        ({}, "Status not provided"),
        ({"status": "paused"}, "Invalid status: paused"),
        ({"status": "active"}, "Cannot activate case without selecting a role first"),
    ],
)
async def test_status_validation(client, user, auth_headers, make_case, body, detail):
    case = await make_case(user)

    response = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json=body
    )

    assert response.status_code == 400 and response.json()["detail"] == detail


async def test_activating_records_session_argument_count(
    client, user, auth_headers, make_case
):
    case = await make_case(
        user,
        user_role=Roles.PLAINTIFF,
        plaintiff_arguments=[ArgumentItem(type="user", content="a", user_id=user.id)],
        defendant_arguments=[ArgumentItem(type="counter", content="b")],
    )

    response = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )

    assert response.json()["new_status"] == "active"
    saved = await reload(case)
    assert saved.status == CaseStatus.ACTIVE and saved.session_args_at_start == 1


async def test_opening_a_case_adjourns_it_when_its_session_expired(
    client, user, auth_headers, make_case
):
    case = await make_case(
        user,
        status=CaseStatus.ACTIVE,
        active_session_id="expired-session",
        active_session_expires_at=get_current_datetime() - timedelta(seconds=1),
    )

    response = await client.get(f"/cases/{case.cnr}", headers=auth_headers)

    assert response.json()["status"] == "adjourned"
    saved = await reload(case)
    assert saved.adjourned_by_session_end and saved.active_session_id is None


async def test_entering_court_claims_the_hearing_for_this_session(
    client, user, auth_headers, make_case
):
    case = await make_case(user, user_role=Roles.PLAINTIFF, status=CaseStatus.ADJOURNED)

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )

    saved = await reload(case)
    assert saved.active_session_id and saved.active_session_expires_at


async def test_other_device_is_view_only_until_it_takes_over(
    client, auth_headers, courtroom_case, fake_llm
):
    fake_llm.responses.append("AI counter argument reply")
    case = await courtroom_case(
        active_session_id="laptop-session",
        active_session_expires_at=get_current_datetime() + timedelta(hours=1),
    )
    argue = {"role": "plaintiff", "argument": "From the phone"}

    view = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()
    blocked = await client.post(
        f"/cases/{case.cnr}/arguments", headers=auth_headers, json=argue
    )
    adjourn = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "adjourned"}
    )

    assert view["hearing_controlled_here"] is False
    assert blocked.status_code == 409 and "another device" in blocked.json()["detail"]
    assert adjourn.status_code == 409

    taken = await client.post(f"/cases/{case.cnr}/take-over", headers=auth_headers)
    allowed = await client.post(
        f"/cases/{case.cnr}/arguments", headers=auth_headers, json=argue
    )

    assert taken.json() == {"hearing_controlled_here": True}
    assert allowed.status_code == 200
    view = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()
    assert view["hearing_controlled_here"] is True


async def test_unclaimed_hearing_is_claimed_by_the_first_device_to_act(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case()  # running, no session recorded yet

    await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "First to speak"},
    )

    assert (await reload(case)).active_session_id is not None


async def test_adjourned_hearing_rejects_arguments_and_take_over(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case(status=CaseStatus.ADJOURNED)

    argue = await client.post(
        f"/cases/{case.cnr}/arguments",
        headers=auth_headers,
        json={"role": "plaintiff", "argument": "Anyone there?"},
    )
    take_over = await client.post(f"/cases/{case.cnr}/take-over", headers=auth_headers)

    assert argue.status_code == 409 and take_over.status_code == 409
    assert "not in session" in argue.json()["detail"]


async def test_court_stays_in_recess_while_ai_counsel_confers(
    client, user, auth_headers, make_case
):
    case = await make_case(user, user_role=Roles.PLAINTIFF, status=CaseStatus.ADJOURNED)
    await Case.set_counsel_recess(
        case.id, get_current_datetime() + timedelta(minutes=2)
    )

    blocked = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )

    assert blocked.status_code == 409
    assert "short recess" in blocked.json()["detail"]
    assert "2 minutes" in blocked.json()["detail"]

    await Case.set_counsel_recess(
        case.id, get_current_datetime() - timedelta(seconds=1)
    )
    resumed = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )
    assert resumed.status_code == 200  # a lapsed recess never blocks


async def test_recess_length_is_random_within_configured_range(
    client, user, auth_headers, courtroom_case, monkeypatch
):
    from datetime import UTC, datetime

    from app.config import settings

    starts: list[float] = []
    real_set = Case.set_counsel_recess

    async def record(case_id, until):
        if until is not None:
            starts.append((until - datetime.now(UTC)).total_seconds())
        await real_set(case_id, until)

    monkeypatch.setattr(Case, "set_counsel_recess", record)
    for _ in range(3):
        case = await courtroom_case()
        await client.put(
            f"/cases/{case.cnr}/status",
            headers=auth_headers,
            json={"status": "adjourned"},
        )

    low, high = settings.counsel_recess_min_seconds, settings.counsel_recess_max_seconds
    assert len(starts) == 3
    assert all(low - 5 <= seconds <= high for seconds in starts)


async def test_adjournment_recess_ends_when_conferences_finish(
    client, user, auth_headers, courtroom_case
):
    case = await courtroom_case()

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "adjourned"}
    )

    # The background conferences ran after the response and lifted the recess.
    assert await Case.get_counsel_recess(case.id) is None


async def test_court_cannot_resume_while_out_of_arguments(
    client, user, auth_headers, make_case
):
    from app.utils.rate_limiter import argument_rate_limiter

    for _ in range(argument_rate_limiter.requests):
        await argument_rate_limiter.register_usage(str(user.id))
    case = await make_case(user, user_role=Roles.PLAINTIFF, status=CaseStatus.ADJOURNED)

    response = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )

    assert response.status_code == 429
    assert "back in session in" in response.json()["detail"]
    assert (await reload(case)).status == CaseStatus.ADJOURNED


async def test_adjourning_dismisses_witness_on_stand(
    client, auth_headers, courtroom_case, witness_party
):
    case = await courtroom_case(
        current_witness_id=witness_party.id,
        is_ai_examining=True,
        witness_testimonies=[
            WitnessTestimony(
                witness_id=witness_party.id,
                witness_name="Ravi (stand)",
                called_by="plaintiff",
            )
        ],
    )

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "adjourned"}
    )

    saved = await reload(case)
    assert saved.status == CaseStatus.ADJOURNED
    assert saved.current_witness_id is None and saved.is_ai_examining is False
    assert saved.witness_testimonies[0].ended_at is not None
    dismissal = saved.courtroom_proceedings[-1]
    assert dismissal.type == EventType.WITNESS_DISMISSED
    assert dismissal.content.startswith("Ravi (stand) dismissed")


async def test_adjourning_uses_party_name_without_open_testimony(
    client, auth_headers, courtroom_case, witness_party
):
    case = await courtroom_case(current_witness_id=witness_party.id)

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "adjourned"}
    )

    assert (
        (await reload(case))
        .courtroom_proceedings[-1]
        .content.startswith("Ravi Kumar dismissed")
    )


async def test_adjourning_unknown_witness_uses_generic_name(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case(current_witness_id="ghost")

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "adjourned"}
    )

    assert (
        (await reload(case))
        .courtroom_proceedings[-1]
        .content.startswith("Witness dismissed")
    )


async def test_status_save_failure(client, user, auth_headers, make_case, monkeypatch):
    case = await make_case(user)

    monkeypatch.setattr(Case, "save", boom)

    response = await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "resolved"}
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# roles
# ---------------------------------------------------------------------------


async def test_choose_roles_and_generate_images(
    client, user, auth_headers, make_case, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 1)
    case = await make_case(
        user,
        evidence=[
            EvidenceItem(
                exhibit_ref="EX-01",
                title="CCTV",
                evidence_type="Digital",
                description="d",
                image_prompt="p",
            )
        ],
    )

    response = await client.put(
        f"/cases/{case.cnr}/roles",
        headers=auth_headers,
        json={"user_role": "defendant", "ai_role": "plaintiff"},
    )

    body = response.json()
    assert (body["user_role"], body["ai_role"]) == ("defendant", "plaintiff")
    # Cloudflare is not configured in tests, so the attempt is recorded as failed.
    assert body["image_generation"]["failed"] == 1


async def test_roles_are_locked_once_chosen(client, user, auth_headers, make_case):
    case = await make_case(user, user_role=Roles.PLAINTIFF)

    response = await client.put(
        f"/cases/{case.cnr}/roles",
        headers=auth_headers,
        json={"user_role": "defendant"},
    )

    assert response.status_code == 400


@pytest.mark.parametrize(
    "body, detail_start",
    [
        ({}, "No roles provided"),
        ({"user_role": "judge"}, "Invalid user_role"),
        ({"ai_role": "judge"}, "Invalid ai_role"),
    ],
)
async def test_roles_validation(
    client, user, auth_headers, make_case, body, detail_start
):
    case = await make_case(user)

    response = await client.put(
        f"/cases/{case.cnr}/roles", headers=auth_headers, json=body
    )

    assert response.status_code == 400 and response.json()["detail"].startswith(
        detail_start
    )


async def test_roles_survive_image_generation_crash(
    client, user, auth_headers, make_case, monkeypatch
):
    monkeypatch.setattr(cases_routes, "generate_missing_evidence_images_for_case", boom)
    case = await make_case(user)

    response = await client.put(
        f"/cases/{case.cnr}/roles", headers=auth_headers, json={"ai_role": "defendant"}
    )

    assert response.status_code == 200 and response.json()["image_generation"] is None


async def test_roles_save_failure(client, user, auth_headers, make_case, monkeypatch):
    case = await make_case(user)

    monkeypatch.setattr(Case, "save", boom)

    response = await client.put(
        f"/cases/{case.cnr}/roles",
        headers=auth_headers,
        json={"user_role": "plaintiff"},
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# plaintiff opening
# ---------------------------------------------------------------------------


async def test_generate_plaintiff_opening(
    client, user, auth_headers, make_case, fake_llm
):
    fake_llm.responses.append("My Lord, the plaintiff was wronged.")
    case = await make_case(user, user_role=Roles.DEFENDANT)

    response = await client.post(
        f"/cases/{case.cnr}/generate-plaintiff-opening", headers=auth_headers
    )

    assert response.json() == {
        "ai_opening_statement": "My Lord, the plaintiff was wronged.",
        "ai_opening_role": "plaintiff",
    }
    saved = await reload(case)
    assert saved.plaintiff_arguments[0].type == "opening"
    assert saved.courtroom_proceedings[0].type == EventType.OPENING_STATEMENT
    assert saved.status == CaseStatus.NOT_STARTED


async def test_generate_plaintiff_opening_returns_existing(
    client, user, auth_headers, make_case, fake_llm
):
    case = await make_case(
        user, plaintiff_arguments=[ArgumentItem(type="opening", content="Existing")]
    )

    response = await client.post(
        f"/cases/{case.cnr}/generate-plaintiff-opening", headers=auth_headers
    )

    assert response.json()["ai_opening_statement"] == "Existing"
    assert fake_llm.calls == []


async def test_generate_plaintiff_opening_refuses_when_other_arguments_exist(
    client, user, auth_headers, make_case
):
    case = await make_case(
        user, defendant_arguments=[ArgumentItem(type="user", content="x")]
    )

    response = await client.post(
        f"/cases/{case.cnr}/generate-plaintiff-opening", headers=auth_headers
    )

    assert response.status_code == 400


@pytest.mark.parametrize("target", ["opening_statement", "upsert_memory_item"])
async def test_generate_plaintiff_opening_failures(
    client, user, auth_headers, make_case, monkeypatch, target
):
    if target == "opening_statement":
        import app.services.llm.lawyer as lawyer_module

        monkeypatch.setattr(lawyer_module, "opening_statement", boom)
    else:
        monkeypatch.setattr(cases_routes, "upsert_memory_item", boom)
    case = await make_case(user)

    response = await client.post(
        f"/cases/{case.cnr}/generate-plaintiff-opening", headers=auth_headers
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# recycle bin
# ---------------------------------------------------------------------------


async def test_delete_restore_and_permanent_delete(
    client, user, auth_headers, make_case
):
    from app.services.rag import index_case_memory

    case = await make_case(user)
    await index_case_memory(case)

    assert (
        await client.delete(f"/cases/{case.cnr}", headers=auth_headers)
    ).status_code == 200
    assert await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).count() == 0
    deleted = (await client.get("/cases/deleted/list", headers=auth_headers)).json()
    assert [c["cnr"] for c in deleted] == [case.cnr] and deleted[0]["deleted_at"]

    assert (
        await client.post(f"/cases/{case.cnr}/restore", headers=auth_headers)
    ).status_code == 200
    restored = await reload(case)
    assert restored.is_deleted is False and restored.deleted_at is None
    assert await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).count() > 0

    await client.delete(f"/cases/{case.cnr}", headers=auth_headers)
    assert (
        await client.delete(f"/cases/{case.cnr}/permanent", headers=auth_headers)
    ).status_code == 200
    assert await Case.get(case.id) is None


async def test_hidden_ai_conferences_survive_case_saves_and_stay_private(
    client, user, auth_headers, make_case
):
    case = await make_case(user)
    await Case.append_ai_party_chat(
        case.id, "p", [{"id": "1", "sender": "counsel", "content": "Secret question?"}]
    )

    case.title = "Renamed"
    await case.save()  # a normal save must not wipe the hidden field
    shown = await client.get(f"/cases/{case.cnr}", headers=auth_headers)

    assert (await Case.load_ai_party_chats(case.id))["p"][0]["id"] == "1"
    assert "Secret question?" not in shown.text


async def test_choosing_sides_starts_ai_counsel_conferences_for_case_prep(
    client, user, auth_headers, make_case, fake_llm
):
    from app.models.party import PartyInvolved, PartyRole

    def responder(prompt):
        if "short, specific questions" in prompt:
            return "Where were you?"
        return "At home."

    fake_llm.responder = responder
    case = await make_case(
        user,
        parties_involved=[
            PartyInvolved(id="c", name="Asha Rao", role=PartyRole.NON_APPLICANT)
        ],
    )

    await client.put(
        f"/cases/{case.cnr}/roles",
        headers=auth_headers,
        json={"user_role": "plaintiff", "ai_role": "defendant"},
    )

    assert len((await Case.load_ai_party_chats(case.id))["c"]) == 2


async def test_adjourning_starts_hidden_ai_counsel_conferences(
    client, user, auth_headers, make_case, fake_llm
):
    from app.models.party import PartyInvolved, PartyRole

    def responder(prompt):
        if "short, specific questions" in prompt:
            return "Where were you?\nWho else saw it?"
        return "At home with my brother, who saw everything."

    fake_llm.responder = responder
    case = await make_case(
        user,
        user_role=Roles.PLAINTIFF,
        ai_role=Roles.DEFENDANT,
        status=CaseStatus.ACTIVE,
        parties_involved=[
            PartyInvolved(id="c", name="Asha Rao", role=PartyRole.NON_APPLICANT)
        ],
    )

    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "adjourned"}
    )
    shown = await client.get(f"/cases/{case.cnr}", headers=auth_headers)

    chats = await Case.load_ai_party_chats(case.id)
    assert len(chats["c"]) == 4
    assert "Where were you?" not in shown.text  # never sent to the user


async def test_restore_needs_an_archived_case_and_both_need_ownership(
    client, user, auth_headers, make_case, make_user
):
    live = await make_case(user)
    foreign_deleted = await make_case(await make_user(), is_deleted=True)

    assert (
        await client.post(f"/cases/{live.cnr}/restore", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.post(f"/cases/{foreign_deleted.cnr}/restore", headers=auth_headers)
    ).status_code == 403
    assert (
        await client.delete(
            f"/cases/{foreign_deleted.cnr}/permanent", headers=auth_headers
        )
    ).status_code == 403


@pytest.mark.parametrize(
    "method, path_suffix, deleted, patch_target",
    [
        ("DELETE", "", False, "delete_case_memory"),
        ("POST", "/restore", True, "index_case_memory"),
        ("DELETE", "/permanent", True, "delete_case_memory"),
    ],
)
async def test_recycle_bin_failures(
    client,
    user,
    auth_headers,
    make_case,
    monkeypatch,
    method,
    path_suffix,
    deleted,
    patch_target,
):
    monkeypatch.setattr(cases_routes, patch_target, boom)
    case = await make_case(user, is_deleted=deleted)

    response = await client.request(
        method, f"/cases/{case.cnr}{path_suffix}", headers=auth_headers
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# case generation
# ---------------------------------------------------------------------------

CASE_TEXT = (
    "**IN THE Bombay High Court**\n**IN THE MATTER OF:**\n**Ravi Kumar vs. Asha Rao**\n"
    "**EVIDENCE:**\nCCTV footage of the flat."
)


def generation_responder(prompt: str) -> str:
    if "realistic Indian full names" in prompt:
        return "Ravi Kumar\nAsha Rao"
    if "company or organization names" in prompt:
        return "Tata Motors Ltd"
    if "names of Indian cities" in prompt:
        return "Pune\nNagpur\nSurat\nIndore\nBhopal"
    if "Draft a hypothetical case file" in prompt:
        return CASE_TEXT
    if "Extract all people and organizations" in prompt:
        return "Ravi Kumar"
    if "Extract all evidence items" in prompt:
        return '[{"title": "CCTV footage", "evidence_type": "Digital Evidence", "description": "Shows entry"}]'
    return "## Role\n**APPLICANT**"


@pytest.mark.parametrize(
    "preference, profile, expected_court",
    [
        (
            "user_location",
            {"state_iso2": "KA", "country_iso2": "IN", "city": "Mysuru"},
            INDIAN_HIGH_COURTS["KA"],
        ),
        ("specific_state", {"preferred_case_state": "TN"}, INDIAN_HIGH_COURTS["TN"]),
        ("random", {}, None),
    ],
)
async def test_generate_case_uses_location_preference(
    client, make_user, make_auth_headers, fake_llm, preference, profile, expected_court
):
    fake_llm.responder = generation_responder
    user = await make_user(case_location_preference=preference, **profile)

    response = await client.post(
        "/cases/generate",
        headers=make_auth_headers(user),
        json={"sections_involved": 1, "section_numbers": [303]},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Ravi Kumar vs. Asha Rao"
    assert body["user_id"] == str(user.id)
    assert [e["title"] for e in body["evidence"]] == ["CCTV footage"]
    saved = await Case.find_one(Case.cnr == body["cnr"])
    assert saved is not None
    assert [p.name for p in saved.parties_involved] == ["Ravi Kumar"]
    case_prompt = next(
        p for p in fake_llm.prompts if "Draft a hypothetical case file" in p
    )
    if expected_court:
        assert f"IN THE {expected_court}" in case_prompt
    if preference == "user_location":
        assert "Use this city: Mysuru" in case_prompt
    assert (
        await RateLimitEntry.find(RateLimitEntry.user_id == str(user.id)).count() == 1
    )


async def test_generate_case_shell_failure_returns_500(client, auth_headers, fake_llm):
    fake_llm.error = RuntimeError("provider down")

    response = await client.post(
        "/cases/generate",
        headers=auth_headers,
        json={"sections_involved": 1, "section_numbers": [1]},
    )

    assert response.status_code == 500


async def test_generate_case_survives_indexing_and_extraction_errors(
    client, auth_headers, fake_llm, monkeypatch
):
    fake_llm.responder = generation_responder

    monkeypatch.setattr(cases_routes, "index_case_memory", boom)
    monkeypatch.setattr(cases_routes, "retrieve_case_context", boom)

    response = await client.post(
        "/cases/generate",
        headers=auth_headers,
        json={"sections_involved": 1, "section_numbers": [1]},
    )

    assert response.status_code == 201
    assert response.json()["evidence"] == []


async def test_case_generation_limit_is_enforced_by_server(
    client, user, auth_headers, fake_llm
):
    from app.utils.rate_limiter import case_generation_rate_limiter

    fake_llm.responder = generation_responder
    for _ in range(case_generation_rate_limiter.requests):
        await case_generation_rate_limiter.register_usage(str(user.id))

    response = await client.post(
        "/cases/generate",
        headers=auth_headers,
        json={"sections_involved": 1, "section_numbers": [1]},
    )

    assert response.status_code == 429


async def test_permanent_delete_works_on_live_cases_too(
    client, user, auth_headers, make_case
):
    live = await make_case(user)
    response = await client.delete(f"/cases/{live.cnr}/permanent", headers=auth_headers)
    assert response.status_code == 200
    assert await Case.find_one(Case.cnr == live.cnr) is None


async def test_lists_include_the_users_side_and_outcome(
    client, user, auth_headers, make_case
):
    await make_case(user, user_role=Roles.PLAINTIFF)
    await make_case(user, user_role=Roles.DEFENDANT, is_deleted=True, outcome="won")

    live = (await client.get("/cases", headers=auth_headers)).json()
    archived = (await client.get("/cases/deleted/list", headers=auth_headers)).json()
    assert live[0]["user_role"] == "plaintiff"
    assert archived[0]["user_role"] == "defendant"
    assert archived[0]["outcome"] == "won"


async def test_empty_archive_deletes_only_this_users_archived_cases(
    client, user, auth_headers, make_case, make_user
):
    kept = await make_case(user)
    await make_case(user, is_deleted=True)
    await make_case(user, is_deleted=True)
    other = await make_case(await make_user(), is_deleted=True)

    response = await client.delete("/cases/deleted/all", headers=auth_headers)

    assert response.json() == {"deleted": 2}
    assert await Case.find_one(Case.cnr == kept.cnr) is not None
    assert await Case.find_one(Case.cnr == other.cnr) is not None
    assert await Case.find(Case.user_id == user.id).count() == 1
