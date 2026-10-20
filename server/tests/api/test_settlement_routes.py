"""Tests for settlement talks held out of court."""

import json

import pytest

from app.models.case import (
    ArgumentItem,
    CaseOutcome,
    CaseStatus,
    Roles,
    Settlement,
    SettlementOffer,
    SettlementStatus,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.models.case_outcome import CaseOutcomeRecord
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

ORDER = "**ORDER**\n1. The FIR and all proceedings arising from it are quashed."
RECORDED = (
    '<ruling>{"accepted": true, "mode": "quashing", '
    '"ruling": "The dispute is private and settled; the FIR is quashed."}</ruling>\n'
    f"<order>\n{ORDER}\n</order>"
)
REFUSED = (
    '<ruling>{"accepted": false, "mode": null, "ruling": "An attempt to murder '
    'cannot be compromised; the petition will be heard on merits."}</ruling>\n'
    "<order>\n**ORDER**\n1. The compromise is not accepted.\n</order>"
)


def agreed_attempt(terms=TERMS):
    return Settlement(
        status=SettlementStatus.AGREED,
        offers=[
            SettlementOffer(side=Roles.PLAINTIFF, terms=terms, response="accepted")
        ],
    )


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
# before the court
# ---------------------------------------------------------------------------


async def test_court_records_the_compromise_and_the_case_ends(
    client, auth_headers, adjourned, fake_llm, indexed, user
):
    fake_llm.responses.append(RECORDED)
    case = await adjourned(settlements=[agreed_attempt()])

    response = await post(client, auth_headers, case, "present")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "recorded" and body["mode"] == "quashing"
    assert body["court_order"] == ORDER
    saved = await reload(case)
    assert saved.status == CaseStatus.RESOLVED
    assert saved.verdict == ORDER
    assert saved.outcome == CaseOutcome.SETTLED
    placed, ruling, disposed = saved.courtroom_proceedings[-3:]
    assert placed.content == "Compromise placed before the court"
    assert ruling.type == EventType.SETTLEMENT and ruling.speaker_role == "judge"
    assert ruling.content.startswith("The dispute is private")
    assert disposed.content == "Case disposed of on compromise"
    record = await CaseOutcomeRecord.find_one(CaseOutcomeRecord.case_id == case.id)
    assert record and record.outcome == CaseOutcome.SETTLED
    assert record.role == Roles.PLAINTIFF
    assert [item[0] for item in indexed] == ["settlement", "verdict"]

    prompt = fake_llm.prompts[0]
    assert prompt.startswith("COMPROMISE BEFORE THE COURT")
    assert TERMS in prompt

    stats = await client.get("/auth/profile/stats", headers=auth_headers)
    assert stats.status_code == 200


async def test_court_refuses_the_compromise_and_the_case_goes_on(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(REFUSED)
    case = await adjourned(settlements=[agreed_attempt()])

    body = (await post(client, auth_headers, case, "present")).json()

    assert body["status"] == "refused" and body["mode"] is None
    saved = await reload(case)
    assert saved.status == CaseStatus.ADJOURNED
    assert saved.verdict is None and saved.outcome is None
    assert saved.courtroom_proceedings[-1].type == EventType.SETTLEMENT
    assert (
        await CaseOutcomeRecord.find_one(CaseOutcomeRecord.case_id == case.id) is None
    )
    # No further attempts once the court has refused.
    again = await offer(client, auth_headers, case)
    assert again.status_code == 409
    assert "refused" in again.json()["detail"]


async def test_only_agreed_terms_go_before_the_court(
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned()
    assert (await post(client, auth_headers, case, "present")).status_code == 409

    fake_llm.responses.append(COUNTER)
    await offer(client, auth_headers, case)
    response = await post(client, auth_headers, case, "present")

    assert response.status_code == 409
    assert "agree" in response.json()["detail"]
    assert len(fake_llm.calls) == 1


async def test_compromise_can_be_presented_in_session(
    client, auth_headers, courtroom_case, fake_llm
):
    fake_llm.responses.append(RECORDED)
    case = await courtroom_case(settlements=[agreed_attempt()])

    response = await post(client, auth_headers, case, "present")

    assert response.status_code == 200
    saved = await reload(case)
    assert saved.status == CaseStatus.RESOLVED
    assert saved.active_session_id is None


async def test_not_while_a_witness_is_on_the_stand(
    client, auth_headers, courtroom_case, fake_llm
):
    case = await courtroom_case(
        settlements=[agreed_attempt()], current_witness_id="someone"
    )

    response = await post(client, auth_headers, case, "present")

    assert response.status_code == 409
    assert fake_llm.calls == []


@pytest.mark.parametrize(
    "bad",
    [
        "The compromise is accepted.",  # no tags
        (  # accepted without a mode
            '<ruling>{"accepted": true, "mode": null, "ruling": "Quashed."}</ruling>'
            "<order>Order.</order>"
        ),
    ],
)
async def test_failed_review_leaves_the_terms_agreed(
    client, auth_headers, adjourned, fake_llm, bad
):
    fake_llm.responses.append(bad)
    case = await adjourned(settlements=[agreed_attempt()])

    response = await post(client, auth_headers, case, "present")

    assert response.status_code == 500
    saved = await reload(case)
    assert saved.settlements[0].status == SettlementStatus.AGREED
    assert saved.status == CaseStatus.ADJOURNED


async def test_refused_talks_never_reach_the_verdict(
    client, auth_headers, adjourned, fake_llm, user
):
    """Without prejudice: after a refused compromise the judge decides the merits
    without ever seeing the terms that were offered."""
    secret = "The applicant pays Rs. 7,77,777 as SECRET-TERMS-XYZ to the complainant."
    fake_llm.responses.extend([ACCEPT, REFUSED])
    case = await adjourned(
        plaintiff_arguments=[
            ArgumentItem(
                type="opening",
                content="user opening",
                user_id=user.id,
                role=Roles.PLAINTIFF,
            )
        ],
        defendant_arguments=[
            ArgumentItem(type="opening", content="ai opening", role=Roles.DEFENDANT)
        ],
    )
    await offer(client, auth_headers, case, terms=secret)
    await post(client, auth_headers, case, "present")
    await client.put(
        f"/cases/{case.cnr}/status", headers=auth_headers, json={"status": "active"}
    )

    def respond(prompt):
        if "impartial Indian Court judge" in prompt:
            return "The petition is dismissed on merits after full consideration."
        return "My Lord, the prosecution has failed to prove its case on the record."

    fake_llm.responder = respond
    response = await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "I rest my case, My Lord."},
    )

    assert response.status_code == 200
    verdict_prompts = [
        p for p in fake_llm.prompts if "impartial Indian Court judge" in p
    ]
    assert verdict_prompts
    assert all("SECRET-TERMS-XYZ" not in p for p in verdict_prompts)
    assert all("7,77,777" not in p for p in fake_llm.prompts[2:])


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
