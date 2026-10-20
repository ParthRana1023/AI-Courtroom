"""Tests for settlement talks held out of court."""

import json

import pytest

from app.models.case import CaseStatus, Roles, SettlementStatus
from app.routes import settlement
from tests.helpers import reload

TERMS = "The applicant pays the complainant compensation and apologises in writing."


def reply(decision, message="My client has considered your offer.", **extra):
    return json.dumps({"decision": decision, "message": message, **extra})


COUNTER = reply(
    "counter",
    "My client needs more than that.",
    terms="Rs. 2 lakh within 30 days and a written apology.",
    compensation=200000,
)
ACCEPT = reply("accept", "My client accepts these terms.")
REJECT = reply("reject", "My client will not settle on these terms.")


@pytest.fixture
def adjourned(courtroom_case):
    async def _make(**overrides):
        overrides.setdefault("status", CaseStatus.ADJOURNED)
        return await courtroom_case(**overrides)

    return _make


@pytest.fixture
def indexed(monkeypatch):
    """What the routes index into case memory."""
    items = []

    async def upsert(case, source_type, source_id, content, metadata=None):
        items.append((source_type, source_id, content, metadata))
        return 1

    monkeypatch.setattr(settlement, "upsert_memory_item", upsert)
    return items


async def offer(client, headers, case, terms=TERMS, compensation=100000):
    return await client.post(
        f"/cases/{case.cnr}/settlement/offers",
        headers=headers,
        json={"terms": terms, "compensation": compensation},
    )


async def post(client, headers, case, action):
    return await client.post(f"/cases/{case.cnr}/settlement/{action}", headers=headers)


# ---------------------------------------------------------------------------
# offers
# ---------------------------------------------------------------------------


async def test_counter_offer_keeps_talks_going(
    client, auth_headers, adjourned, fake_llm, indexed
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()

    response = await offer(client, auth_headers, case)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "negotiating"
    mine, theirs = body["offers"]
    assert mine["side"] == "plaintiff" and mine["compensation"] == 100000
    assert mine["response"] == "countered"
    assert mine["reply"] == "My client needs more than that."
    assert theirs["side"] == "defendant" and theirs["compensation"] == 200000
    assert theirs["response"] is None
    saved = await reload(case)
    assert saved.settlements[0].status == SettlementStatus.NEGOTIATING

    prompt = fake_llm.prompts[0]
    assert prompt.startswith("SETTLEMENT OFFER")
    assert TERMS in prompt and "Rs. 100,000" in prompt
    assert "Asha Rao" in prompt  # AI counsel's client
    assert "Ravi Kumar" not in prompt.split("YOUR CLIENT(S)")[1].split("THE CASE")[0]


async def test_accepted_offer_agrees_terms(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.append(ACCEPT)
    case = await adjourned()

    body = (await offer(client, auth_headers, case)).json()

    assert body["status"] == "agreed"
    assert body["offers"][0]["response"] == "accepted"


async def test_rejected_offer_ends_the_attempt(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(REJECT)
    case = await adjourned()

    body = (await offer(client, auth_headers, case)).json()

    assert body["status"] == "rejected" and body["ended_at"]
    assert body["offers"][0]["response"] == "rejected"


async def test_new_offer_answers_the_last_counter(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.extend([COUNTER, ACCEPT])
    case = await adjourned()

    await offer(client, auth_headers, case)
    body = (await offer(client, auth_headers, case, compensation=150000)).json()

    assert [o["response"] for o in body["offers"]] == [
        "countered",
        "countered",
        "accepted",
    ]
    assert body["status"] == "agreed"
    # AI counsel saw the talks so far, its own counter labelled as its own.
    assert "You offered: Rs. 2 lakh" in fake_llm.prompts[1]


async def test_user_offers_are_capped_per_attempt(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.extend([COUNTER] * settlement.MAX_OFFERS)
    case = await adjourned()
    for _ in range(settlement.MAX_OFFERS):
        assert (await offer(client, auth_headers, case)).status_code == 200

    response = await offer(client, auth_headers, case)

    assert response.status_code == 409
    assert "last offer" in response.json()["detail"]


async def test_attempts_are_capped_per_case(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.extend([REJECT] * settlement.MAX_ATTEMPTS)
    case = await adjourned()
    for _ in range(settlement.MAX_ATTEMPTS):
        await offer(client, auth_headers, case)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 409
    assert len((await reload(case)).settlements) == settlement.MAX_ATTEMPTS


async def test_no_new_offer_once_terms_are_agreed(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(ACCEPT)
    case = await adjourned()
    await offer(client, auth_headers, case)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 409
    assert "already agreed" in response.json()["detail"]


async def test_no_talks_while_the_court_is_sitting(
    client, auth_headers, courtroom_case, fake_llm
):
    case = await courtroom_case()  # ACTIVE

    response = await offer(client, auth_headers, case)

    assert response.status_code == 409
    assert "adjournment" in response.json()["detail"]
    assert fake_llm.calls == []


async def test_talks_need_a_side(client, auth_headers, adjourned):
    case = await adjourned(user_role=Roles.NOT_STARTED, status=CaseStatus.NOT_STARTED)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 400


async def test_closed_case_cannot_be_settled(client, auth_headers, adjourned):
    case = await adjourned(status=CaseStatus.RESOLVED)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 409


async def test_talks_before_the_first_hearing(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned(status=CaseStatus.NOT_STARTED)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 200
    assert "The hearing has not begun." in fake_llm.prompts[0]


@pytest.mark.parametrize("terms", ["too short", "x" * 2001])
async def test_terms_must_be_a_sensible_length(client, auth_headers, adjourned, terms):
    case = await adjourned()

    response = await offer(client, auth_headers, case, terms=terms)

    assert response.status_code == 422


async def test_negative_compensation_is_refused(client, auth_headers, adjourned):
    case = await adjourned()

    response = await offer(client, auth_headers, case, compensation=-5)

    assert response.status_code == 422


@pytest.mark.parametrize("failure", ["error", "garbage", "counter_without_terms"])
async def test_failed_reply_leaves_the_case_unchanged(
    client, auth_headers, adjourned, fake_llm, failure
):
    if failure == "error":
        fake_llm.error = RuntimeError("model down")
    elif failure == "garbage":
        fake_llm.responses.append("I need to think about it.")
    else:
        fake_llm.responses.append(reply("counter"))
    case = await adjourned()

    response = await offer(client, auth_headers, case)

    assert response.status_code == 500
    assert "try again" in response.json()["detail"]
    assert (await reload(case)).settlements == []


# ---------------------------------------------------------------------------
# accept and withdraw
# ---------------------------------------------------------------------------


async def test_accepting_the_counter_agrees_terms(
    client, auth_headers, adjourned, fake_llm, indexed
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    body = (await post(client, auth_headers, case, "accept")).json()

    assert body["status"] == "agreed"
    assert body["offers"][-1]["response"] == "accepted"
    assert "Answer: accepted." in indexed[-1][2]


async def test_nothing_to_accept_without_a_counter(
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned()
    assert (await post(client, auth_headers, case, "accept")).status_code == 409

    fake_llm.responses.append(ACCEPT)
    await offer(client, auth_headers, case)
    assert (await post(client, auth_headers, case, "accept")).status_code == 409


async def test_withdrawing_ends_the_attempt(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    body = (await post(client, auth_headers, case, "withdraw")).json()

    assert body["status"] == "withdrawn" and body["ended_at"]
    assert body["offers"][-1]["response"] == "withdrawn"
    assert (await post(client, auth_headers, case, "withdraw")).status_code == 409


# ---------------------------------------------------------------------------
# case memory and case detail
# ---------------------------------------------------------------------------


async def test_offers_are_indexed_as_settlement_memory(
    client, auth_headers, adjourned, fake_llm, indexed
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()

    await offer(client, auth_headers, case)

    assert [item[0] for item in indexed] == ["settlement", "settlement"]
    mine, theirs = indexed
    assert "Plaintiff's counsel (the user) offered" in mine[2]
    assert "Rs. 100,000" in mine[2] and "Answer: countered." in mine[2]
    assert mine[3]["attempt"] == 1 and mine[3]["round"] == 1
    assert "Defendant's counsel (AI counsel) offered: Rs. 2 lakh" in theirs[2]


async def test_case_detail_includes_settlements(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    detail = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()

    assert detail["settlements"][0]["status"] == "negotiating"


async def test_adjourning_to_explore_settlement_is_noted(
    client, auth_headers, courtroom_case
):
    case = await courtroom_case()

    await client.put(
        f"/cases/{case.cnr}/status",
        headers=auth_headers,
        json={"status": "adjourned", "reason": "settlement"},
    )

    saved = await reload(case)
    assert saved.status == CaseStatus.ADJOURNED
    assert saved.courtroom_proceedings[-1].content == (
        "Hearing adjourned at the request of counsel to explore an amicable settlement"
    )
