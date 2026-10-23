"""Tests for settlement talks held out of court."""

import json
from datetime import date, timedelta

import pytest

from app import messages
from app.models.case import (
    ArgumentItem,
    CaseOutcome,
    CaseStatus,
    Payment,
    Roles,
    RouteItem,
    Settlement,
    SettlementCondition,
    SettlementEntry,
    SettlementProfile,
    SettlementStatus,
    SettlementTerms,
)
from app.models.case import (
    CourtroomProceedingsEventType as EventType,
)
from app.models.case_outcome import CaseOutcomeRecord
from app.routes import cases as cases_routes
from app.routes import settlement
from app.utils.datetime import get_current_datetime
from tests.helpers import reload

CONDITIONS = [
    SettlementCondition(
        key="apology",
        label="Written apology to the complainant",
        short="Written apology",
        clause="The accused shall apologise in writing.",
        favours="complainants",
    ),
    SettlementCondition(
        key="deposit",
        label="First instalment deposited in court",
        short="Deposit in court",
        clause="The first instalment shall be deposited in court.",
        favours="complainants",
    ),
]
# The user (plaintiff side) acts for the accused unless a test says otherwise.
PROFILE = SettlementProfile(
    route="quash",
    title="Quashing on compromise",
    court="§ 528 BNSS · High Court of Delhi",
    offences=[RouteItem(section="§ 318(4)", title="Cheating", note="Private.")],
    must="The complainant must sign.",
    must_detail="The court won't quash on a part-settlement.",
    footnote="Compounding needs a trial.",
    conditions=CONDITIONS,
    accused="Ravi Kumar",
    accused_side="plaintiff",
    complainants=["Asha Rao"],
    claim=200000,
)
CLOSED = SettlementProfile(
    route="none",
    closed=[RouteItem(section="§ 528", title="Quashing", note="Attempt to murder.")],
)

TERMS = {
    "amount": 100000,
    "instalments": 2,
    "months": 6,
    "interest": 0,
    "conditions": ["apology"],
}
THEIR_TERMS = {
    "amount": 200000,
    "instalments": 1,
    "months": 3,
    "interest": 9,
    "conditions": ["apology", "deposit"],
}


def reply(decision, message="My client has considered your offer.", terms=None):
    return json.dumps({"decision": decision, "terms": terms, "message": message})


COUNTER = reply("counter", "My client needs more than that.", THEIR_TERMS)
ACCEPT = reply("accept", "My client accepts these terms.")
REJECT = reply("reject", "My client will not settle on these terms.")

SUBMISSION = "My Lord, the parties have settled and ask the court to quash the FIR."
RULING = {
    "granted": "The dispute is private and settled; the FIR is quashed.",
    "refused": "An attempt to murder cannot be compromised; the petition goes on.",
    "adjourned": "One complainant is unsure; the matter is adjourned.",
}


def hearing(outcome="granted", **over):
    return json.dumps(
        {
            "judge": "R. K. Mehta",
            "lines": [
                {
                    "kind": "speech",
                    "role": "state",
                    "who": "APP for the State",
                    "tag": "No objection",
                    "text": "The State has no objection.",
                },
                {
                    "kind": "question",
                    "role": "court",
                    "who": "The Court to Asha Rao",
                    "text": "Did you sign freely?",
                },
                {
                    "kind": "answer",
                    "role": "complainant",
                    "who": "Asha Rao",
                    "unsure": outcome == "adjourned",
                    "text": "Yes, My Lord.",
                },
            ],
            "checks": [
                {
                    "label": "Every complainant agreed freely",
                    "state": "ok",
                    "text": "Asha Rao confirmed in court.",
                }
            ],
            "outcome": outcome,
            "ruling": RULING[outcome],
            "order": ["The FIR and all proceedings arising from it are quashed."],
            "next_date": None if outcome == "granted" else "2026-12-02",
        }
        | over
    )


def analysis(**over):
    scores = {
        "factors": {
            "terms": {"value": 80, "text": "Close to the best deal."},
            "closed": {"value": 100, "text": "The court quashed the FIR."},
            "offers": {"value": 60, "text": "Two moves where one would do."},
            "conditions": {"value": 40, "text": "The deposit went in."},
        },
        "best": {
            "amount": 92000,
            "instalments": 3,
            "months": 9,
            "interest": 0,
            "conditions": ["apology", "nonsense"],
        },
        "best_text": "Their client wanted the case gone.",
        "call": "right",
        "call_text": "The evidence of cheating was strong.",
        "worked": "You held firm on interest.",
        "improve": "Ask for a deposit sooner.",
    } | over
    return (
        f"<scores>{json.dumps(scores)}</scores>\n"
        "<review>### How you negotiated\nYou opened well.</review>"
    )


def agreed_attempt(**terms):
    agreed = SettlementTerms.model_validate(TERMS | terms)
    return Settlement(
        status=SettlementStatus.AGREED,
        entries=[
            SettlementEntry(by="user", kind="offer", terms=agreed),
            SettlementEntry(by="ai", kind="accept"),
        ],
        agreed=agreed,
    )


@pytest.fixture
def adjourned(courtroom_case):
    async def _make(**overrides):
        overrides.setdefault("status", CaseStatus.ADJOURNED)
        overrides.setdefault("settlement_profile", PROFILE)
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


async def offer(client, headers, case, note="", **terms):
    return await client.post(
        f"/cases/{case.cnr}/settlement/offers",
        headers=headers,
        json={"terms": TERMS | terms, "note": note},
    )


async def post(client, headers, case, action):
    return await client.post(f"/cases/{case.cnr}/settlement/{action}", headers=headers)


async def court_sits(case):
    """The court sits again after talks closed."""
    saved = await reload(case)
    saved.log("Court is in session")
    saved.log("Court adjourned")
    await saved.save()


# ---------------------------------------------------------------------------
# the route
# ---------------------------------------------------------------------------


async def test_first_visit_works_out_the_route_once(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(PROFILE.model_dump_json())
    case = await adjourned(settlement_profile=None)

    first = await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    again = await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)

    assert first.status_code == again.status_code == 200
    body = again.json()
    assert body["profile"]["route"] == "quash"
    assert [c["key"] for c in body["profile"]["conditions"]] == ["apology", "deposit"]
    assert body["attempt"] is None and body["can_start"] is True
    assert body["closed"] is None and body["max_offers"] == 3
    assert len(fake_llm.calls) == 1
    assert fake_llm.prompts[0].startswith("SETTLEMENT ROUTE")
    assert (await reload(case)).settlement_profile == PROFILE


async def test_a_failed_route_is_not_saved(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.append("I can't tell.")
    case = await adjourned(settlement_profile=None)

    response = await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)

    assert response.status_code == 500
    assert (await reload(case)).settlement_profile is None


async def test_no_route_means_no_talks(client, auth_headers, adjourned, fake_llm):
    case = await adjourned(settlement_profile=CLOSED)

    body = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()
    response = await offer(client, auth_headers, case)

    assert body["can_start"] is False
    assert body["start_blocked"] == body["closed"] == messages.SETTLEMENT_NO_ROUTE
    assert response.status_code == 409
    assert fake_llm.calls == []


# ---------------------------------------------------------------------------
# opening talks
# ---------------------------------------------------------------------------


async def test_counsel_for_the_accused_opens_talks_with_their_own_offer(
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned()

    body = (await post(client, auth_headers, case, "start")).json()

    assert body["attempt"]["status"] == "negotiating"
    assert body["attempt"]["entries"] == []
    assert fake_llm.calls == []


async def test_counsel_for_the_complainants_hears_the_opening_offer_first(
    client, auth_headers, adjourned, fake_llm, indexed
):
    fake_llm.responses.append(
        reply("counter", "My client accepts the money is owed.", TERMS | {"months": 7})
    )
    case = await adjourned(
        settlement_profile=PROFILE.model_copy(update={"accused_side": "defendant"})
    )

    body = (await post(client, auth_headers, case, "start")).json()
    again = (await post(client, auth_headers, case, "start")).json()

    (opening,) = body["attempt"]["entries"]
    assert opening["by"] == "ai" and opening["kind"] == "offer"
    assert opening["terms"]["months"] == 6  # snapped to the desk's choices
    assert opening["note"] == "My client accepts the money is owed."
    assert again["attempts"] == 1  # already open: nothing new
    prompt = fake_llm.prompts[0]
    assert prompt.startswith("SETTLEMENT OFFER")
    assert "advocate for the accused" in prompt
    assert "There is no offer yet" in prompt
    assert len(fake_llm.calls) == 1
    assert [item[0] for item in indexed] == ["settlement"]


# ---------------------------------------------------------------------------
# offers
# ---------------------------------------------------------------------------


async def test_counter_offer_keeps_talks_going(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()

    response = await offer(client, auth_headers, case, note="We need time.")

    assert response.status_code == 200
    attempt = response.json()["attempt"]
    assert attempt["status"] == "negotiating"
    mine, theirs = attempt["entries"]
    assert mine["by"] == "user" and mine["kind"] == "offer"
    assert mine["terms"]["amount"] == 100000 and mine["note"] == "We need time."
    assert theirs["by"] == "ai" and theirs["kind"] == "counter"
    assert theirs["terms"] == THEIR_TERMS
    assert theirs["note"] == "My client needs more than that."

    prompt = fake_llm.prompts[0]
    assert "advocate for the complainants" in prompt
    assert "Rs. 1,00,000 in 2 instalments within 6 months" in prompt
    assert "Written apology to the complainant" in prompt
    assert "We need time." in prompt
    assert "Asha Rao" in prompt  # AI counsel's client
    assert "Ravi Kumar" not in prompt.split("YOUR CLIENT(S)")[1].split("THE CASE")[0]


async def test_accepted_offer_agrees_terms(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.append(ACCEPT)
    case = await adjourned()

    attempt = (await offer(client, auth_headers, case)).json()["attempt"]

    assert attempt["status"] == "agreed"
    assert attempt["agreed"] == TERMS
    assert [e["kind"] for e in attempt["entries"]] == ["offer", "accept"]


async def test_refused_offer_ends_the_attempt(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(REJECT)
    case = await adjourned()

    body = (await offer(client, auth_headers, case)).json()

    assert body["attempt"]["status"] == "rejected" and body["attempt"]["ended_at"]
    assert body["attempt"]["entries"][-1]["kind"] == "refuse"
    assert body["can_start"] is False
    assert body["start_blocked"] == messages.SETTLEMENT_AFTER_HEARING


async def test_sending_their_terms_back_accepts_them(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    reordered = THEIR_TERMS | {"conditions": ["deposit", "apology"]}
    attempt = (await offer(client, auth_headers, case, **reordered)).json()["attempt"]

    assert attempt["status"] == "agreed" and attempt["agreed"] == THEIR_TERMS
    assert attempt["entries"][-1] == attempt["entries"][-1] | {
        "by": "user",
        "kind": "accept",
    }
    assert len(fake_llm.calls) == 1


async def test_a_new_offer_shows_ai_counsel_the_talks_so_far(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.extend([COUNTER, ACCEPT])
    case = await adjourned()

    await offer(client, auth_headers, case)
    attempt = (await offer(client, auth_headers, case, amount=150000)).json()["attempt"]

    assert [e["kind"] for e in attempt["entries"]] == [
        "offer",
        "counter",
        "counter",
        "accept",
    ]
    assert "You countered: Rs. 2,00,000 in one payment" in fake_llm.prompts[1]


async def test_three_offers_then_accept_or_end(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.extend([COUNTER] * settlement.MAX_OFFERS)
    case = await adjourned()
    for _ in range(settlement.MAX_OFFERS):
        assert (await offer(client, auth_headers, case)).status_code == 200

    response = await offer(client, auth_headers, case)
    accepted = await post(client, auth_headers, case, "accept")

    assert response.status_code == 409
    assert response.json()["detail"] == messages.SETTLEMENT_OFFERS_USED
    assert accepted.json()["attempt"]["status"] == "agreed"


async def test_talks_reopen_only_after_the_court_sits_again(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.extend([REJECT, COUNTER])
    case = await adjourned()
    await offer(client, auth_headers, case)

    too_soon = await offer(client, auth_headers, case)
    await court_sits(case)
    later = await offer(client, auth_headers, case)

    assert too_soon.status_code == 409
    assert too_soon.json()["detail"] == messages.SETTLEMENT_AFTER_HEARING
    assert later.status_code == 200 and later.json()["attempts"] == 2


async def test_attempts_are_capped_per_case(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.extend([REJECT] * settlement.MAX_ATTEMPTS)
    case = await adjourned()
    for _ in range(settlement.MAX_ATTEMPTS):
        await offer(client, auth_headers, case)
        await court_sits(case)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 409
    assert response.json()["detail"] == messages.SETTLEMENT_ATTEMPTS_USED
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
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned(status=CaseStatus.ACTIVE)

    response = await offer(client, auth_headers, case)
    started = await post(client, auth_headers, case, "start")

    assert response.status_code == started.status_code == 409
    assert "adjournment" in response.json()["detail"]
    assert fake_llm.calls == []


async def test_talks_need_a_side(client, auth_headers, adjourned):
    case = await adjourned(user_role=Roles.NOT_STARTED, status=CaseStatus.NOT_STARTED)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 400


async def test_closed_case_cannot_be_settled(client, auth_headers, adjourned):
    case = await adjourned(status=CaseStatus.RESOLVED)

    response = await offer(client, auth_headers, case)
    body = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()

    assert response.status_code == 409
    assert body["closed"] == messages.SETTLEMENT_CASE_CLOSED


async def test_talks_before_the_first_hearing(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned(status=CaseStatus.NOT_STARTED)

    response = await offer(client, auth_headers, case)

    assert response.status_code == 200
    assert "The hearing has not begun." in fake_llm.prompts[0]


@pytest.mark.parametrize(
    "bad",
    [
        {"instalments": 5},
        {"months": 7},
        {"interest": 20},
        {"amount": -1},
        {"conditions": ["hostile-witness"]},
    ],
)
async def test_terms_must_be_on_the_desk(client, auth_headers, adjourned, bad):
    case = await adjourned()

    response = await offer(client, auth_headers, case, **bad)

    assert response.status_code == 422


async def test_note_has_a_limit(client, auth_headers, adjourned):
    case = await adjourned()

    response = await offer(client, auth_headers, case, note="x" * 1001)

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
# accept and end
# ---------------------------------------------------------------------------


async def test_accepting_their_terms_agrees_them(
    client, auth_headers, adjourned, fake_llm, indexed
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    attempt = (await post(client, auth_headers, case, "accept")).json()["attempt"]

    assert attempt["status"] == "agreed" and attempt["agreed"] == THEIR_TERMS
    assert attempt["entries"][-1]["kind"] == "accept"
    assert "The user accepted the last terms" in indexed[-1][2]


async def test_nothing_to_accept_without_their_terms(
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned()
    assert (await post(client, auth_headers, case, "accept")).status_code == 409

    fake_llm.responses.append(ACCEPT)
    await offer(client, auth_headers, case)
    assert (await post(client, auth_headers, case, "accept")).status_code == 409


async def test_ending_talks_ends_the_attempt(client, auth_headers, adjourned, fake_llm):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    attempt = (await post(client, auth_headers, case, "end")).json()["attempt"]

    assert attempt["status"] == "withdrawn" and attempt["ended_at"]
    assert attempt["entries"][-1]["kind"] == "ended"
    assert (await post(client, auth_headers, case, "end")).status_code == 409


# ---------------------------------------------------------------------------
# the deed: drafted, signed, filed
# ---------------------------------------------------------------------------


async def test_agreed_terms_are_drawn_up_as_a_deed(client, auth_headers, adjourned):
    case = await adjourned(settlements=[agreed_attempt(conditions=["deposit"])])

    deed = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()["deed"]

    assert deed["title"] == "Compromise Deed"
    assert deed["header"][0] == "In the High Court of Delhi"
    assert deed["parties"] == (
        "Made between Ravi Kumar (the accused) and Asha Rao (the complainant)."
    )
    money, deposit, quash = deed["clauses"]
    assert money == (
        "The accused shall pay the complainant ₹1,00,000 in 2 equal instalments "
        "within 6 months of signing, without interest."
    )
    assert deposit == "The first instalment shall be deposited in court."
    assert "section 528 BNSS" in quash
    assert deed["signatories"] == [
        {"name": "Ravi Kumar", "role": "Accused", "side": "user"},
        {"name": "Asha Rao", "role": "Complainant", "side": "other"},
    ]
    assert deed["file_label"] == "File joint application · § 528"


async def test_no_deed_until_terms_are_agreed(client, auth_headers, adjourned):
    case = await adjourned()

    body = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()

    assert body["deed"] is None


async def test_a_plea_bargain_is_a_report_signed_by_four(
    client, auth_headers, adjourned
):
    plea = PROFILE.model_copy(
        update={
            "route": "plea",
            "court": "§ 289 BNSS · Court of the CJM, Patiala House Courts",
            "accused_side": "defendant",  # the user acts for the complainant
            "prosecutor": "Neha Bhalla",
            "officer": "Sunil Rathore",
        }
    )
    case = await adjourned(settlement_profile=plea, settlements=[agreed_attempt()])

    deed = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()["deed"]

    assert deed["title"] == "Report of Mutually Satisfactory Disposition"
    assert (
        deed["clauses"][0]
        == "The accused pleads guilty to the offences under § 318(4)."
    )
    assert "as compensation" in deed["clauses"][1]
    assert [(s["name"], s["side"]) for s in deed["signatories"]] == [
        ("Ravi Kumar", "other"),
        ("Asha Rao", "user"),
        ("Neha Bhalla", "other"),
        ("Sunil Rathore", "other"),
    ]
    assert deed["file_label"] == "Submit the report · § 292"


async def test_sign_then_file(client, auth_headers, adjourned):
    case = await adjourned(settlements=[agreed_attempt()])

    signed = (await post(client, auth_headers, case, "sign")).json()["attempt"]
    filed = (await post(client, auth_headers, case, "file")).json()["attempt"]

    assert signed["status"] == "signed"
    assert set(signed["signatures"]) == {"Ravi Kumar", "Asha Rao"}
    assert filed["status"] == "filed" and filed["filed_at"]
    assert filed["hearing_date"]
    saved = (await reload(case)).settlements[0]
    assert saved.hearing_date and saved.hearing_date.weekday() < 5
    assert saved.status == SettlementStatus.FILED


async def test_the_deed_is_signed_only_once_agreed(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    response = await post(client, auth_headers, case, "sign")

    assert response.status_code == 409
    assert response.json()["detail"] == messages.SETTLEMENT_CANT_SIGN


async def test_the_deed_is_filed_only_once_signed(client, auth_headers, adjourned):
    case = await adjourned(settlements=[agreed_attempt()])

    response = await post(client, auth_headers, case, "file")

    assert response.status_code == 409
    assert response.json()["detail"] == messages.SETTLEMENT_NOT_SIGNED


async def test_a_signed_deed_takes_no_offers_and_a_filed_one_stays(
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned(settlements=[agreed_attempt()])
    await post(client, auth_headers, case, "sign")

    again = await offer(client, auth_headers, case)
    await post(client, auth_headers, case, "file")
    ended = await post(client, auth_headers, case, "end")

    assert again.status_code == 409
    assert ended.status_code == 409
    assert ended.json()["detail"] == messages.SETTLEMENT_FILED
    assert fake_llm.calls == []


async def test_no_signing_while_the_court_sits(client, auth_headers, adjourned):
    case = await adjourned(status=CaseStatus.ACTIVE, settlements=[agreed_attempt()])

    response = await post(client, auth_headers, case, "sign")

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# the hearing
# ---------------------------------------------------------------------------


def filed_attempt(**terms):
    attempt = agreed_attempt(**terms)
    attempt.status = SettlementStatus.FILED
    attempt.signatures = {
        "Ravi Kumar": attempt.started_at,
        "Asha Rao": attempt.started_at,
    }
    attempt.filed_at = attempt.started_at
    attempt.hearing_date = date(2026, 11, 4)
    return attempt


async def hear(client, headers, case, submission=SUBMISSION):
    return await client.post(
        f"/cases/{case.cnr}/settlement/hearing",
        headers=headers,
        json={"submission": submission},
    )


async def test_the_court_grants_the_compromise_and_the_case_ends(
    client, auth_headers, adjourned, fake_llm, indexed, user
):
    fake_llm.responses.append(hearing())
    case = await adjourned(settlements=[filed_attempt()])

    response = await hear(client, auth_headers, case)

    assert response.status_code == 200
    attempt = response.json()["attempt"]
    assert attempt["status"] == "recorded"
    assert attempt["hearing"]["outcome"] == "granted"
    assert attempt["hearing"]["submission"] == SUBMISSION
    assert attempt["hearing"]["lines"][0]["tag"] == "No objection"
    assert "defaults_on" not in attempt
    assert attempt["user_pays"] is True
    assert [p["amount"] for p in attempt["payments"]] == [50000, 50000]
    assert [p["status"] for p in attempt["payments"]] == ["upcoming", "upcoming"]

    saved = await reload(case)
    assert saved.status == CaseStatus.RESOLVED
    assert saved.outcome == CaseOutcome.SETTLED
    assert saved.settlement_result == "quashed"
    assert "**ORDER**" in saved.verdict and "R. K. Mehta, J." in saved.verdict
    placed, ruling, disposed = saved.courtroom_proceedings[-3:]
    assert placed.content == "Compromise placed before the court"
    assert ruling.type == EventType.SETTLEMENT and ruling.speaker_role == "judge"
    assert disposed.content == "Case disposed of on compromise"
    record = await CaseOutcomeRecord.find_one(CaseOutcomeRecord.case_id == case.id)
    assert record and record.outcome == CaseOutcome.SETTLED
    assert [item[0] for item in indexed] == ["settlement", "verdict"]

    prompt = fake_llm.prompts[0]
    assert prompt.startswith("SETTLEMENT HEARING")
    assert SUBMISSION in prompt
    assert "Every complainant agreed freely" in prompt
    assert "₹1,00,000 in 2 equal instalments" in prompt
    assert len(fake_llm.calls) == 1  # the negotiation is analysed later, on request


async def test_the_court_refuses_and_the_case_goes_on(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(hearing("refused"))
    case = await adjourned(settlements=[filed_attempt()])

    attempt = (await hear(client, auth_headers, case)).json()["attempt"]

    assert attempt["status"] == "refused" and attempt["ended_at"]
    assert attempt["hearing"]["next_date"] == "2026-12-02"
    assert attempt["payments"] == []
    saved = await reload(case)
    assert saved.status == CaseStatus.ADJOURNED
    assert saved.verdict is None and saved.outcome is None
    again = await offer(client, auth_headers, case)
    assert again.status_code == 409
    assert "refused" in again.json()["detail"]


async def test_an_adjourned_hearing_is_listed_again(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.extend([hearing("adjourned"), hearing()])
    case = await adjourned(settlements=[filed_attempt()])

    first = (await hear(client, auth_headers, case)).json()["attempt"]
    second = (await hear(client, auth_headers, case)).json()["attempt"]

    assert first["status"] == "adjourned"
    assert first["hearing_date"] == "2026-12-02"
    assert first["hearing"]["lines"][2]["unsure"] is True
    assert second["status"] == "recorded"


async def test_only_a_filed_deed_is_heard(client, auth_headers, adjourned, fake_llm):
    case = await adjourned(settlements=[agreed_attempt()])

    response = await hear(client, auth_headers, case)

    assert response.status_code == 409
    assert response.json()["detail"] == messages.SETTLEMENT_NOT_FILED
    assert fake_llm.calls == []


async def test_not_while_the_court_sits_on_the_merits(
    client, auth_headers, adjourned, fake_llm
):
    case = await adjourned(status=CaseStatus.ACTIVE, settlements=[filed_attempt()])

    response = await hear(client, auth_headers, case)

    assert response.status_code == 409
    assert fake_llm.calls == []


@pytest.mark.parametrize(
    "bad", ["The compromise is accepted.", hearing("adjourned", next_date=None)]
)
async def test_a_failed_hearing_leaves_the_deed_filed(
    client, auth_headers, adjourned, fake_llm, bad
):
    fake_llm.responses.append(bad)
    case = await adjourned(settlements=[filed_attempt()])

    response = await hear(client, auth_headers, case)

    assert response.status_code == 500
    saved = await reload(case)
    assert saved.settlements[0].status == SettlementStatus.FILED
    assert saved.status == CaseStatus.ADJOURNED


async def test_a_short_submission_is_refused(client, auth_headers, adjourned):
    case = await adjourned(settlements=[filed_attempt()])

    assert (await hear(client, auth_headers, case, "Yes")).status_code == 422


# ---------------------------------------------------------------------------
# payments
# ---------------------------------------------------------------------------


def recorded_attempt(due, defaults_on=None):
    attempt = filed_attempt()
    attempt.status = SettlementStatus.RECORDED
    attempt.payments = [Payment(amount=50000, due=due), Payment(amount=50000, due=due)]
    attempt.defaults_on = defaults_on
    return attempt


async def pay(client, headers, case, index, action):
    return await client.post(
        f"/cases/{case.cnr}/settlement/payments/{index}",
        headers=headers,
        json={"action": action},
    )


async def test_counsel_for_the_accused_pays_each_instalment(
    client, auth_headers, adjourned
):
    case = await adjourned(
        status=CaseStatus.RESOLVED, settlements=[recorded_attempt(date(2099, 1, 1))]
    )

    paid = await pay(client, auth_headers, case, 0, "pay")
    again = await pay(client, auth_headers, case, 0, "pay")
    remedy = await pay(client, auth_headers, case, 1, "recall")

    assert paid.status_code == 200
    assert [p["status"] for p in paid.json()["attempt"]["payments"]] == [
        "paid",
        "upcoming",
    ]
    assert again.status_code == remedy.status_code == 409


async def test_a_missed_payment_late_is_marked_late(client, auth_headers, adjourned):
    case = await adjourned(
        status=CaseStatus.RESOLVED, settlements=[recorded_attempt(date(2020, 1, 1))]
    )

    before = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()["attempt"]["payments"]
    after = (await pay(client, auth_headers, case, 1, "pay")).json()["attempt"]

    assert [p["status"] for p in before] == ["missed", "missed"]
    assert after["payments"][1]["status"] == "late"


async def test_counsel_for_the_complainants_answers_a_default(
    client, auth_headers, adjourned
):
    case = await adjourned(
        status=CaseStatus.RESOLVED,
        settlement_profile=PROFILE.model_copy(update={"accused_side": "defendant"}),
        settlements=[recorded_attempt(date(2020, 1, 1), defaults_on=1)],
    )

    statuses = (
        await client.get(f"/cases/{case.cnr}/settlement", headers=auth_headers)
    ).json()["attempt"]["payments"]
    wrong = await pay(client, auth_headers, case, 1, "notice")
    on_time = await pay(client, auth_headers, case, 0, "recall")
    recalled = await pay(client, auth_headers, case, 1, "recall")
    twice = await pay(client, auth_headers, case, 1, "recall")

    assert [p["status"] for p in statuses] == ["paid", "missed"]
    assert wrong.status_code == on_time.status_code == twice.status_code == 409
    assert recalled.json()["attempt"]["payments"][1]["remedy"] == "recall"


async def test_refused_talks_never_reach_the_verdict(
    client, auth_headers, adjourned, fake_llm, user
):
    """Without prejudice: after a refused compromise the judge decides the merits
    without ever seeing the terms that were offered."""
    fake_llm.responses.extend([ACCEPT, hearing("refused")])
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
    await offer(client, auth_headers, case, note="SECRET-TERMS-XYZ", amount=777777)
    await post(client, auth_headers, case, "sign")
    await post(client, auth_headers, case, "file")
    await hear(client, auth_headers, case)
    assert (await reload(case)).settlements[0].status == SettlementStatus.REFUSED
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
    assert all("7,77,777" not in p for p in fake_llm.prompts[3:])


# ---------------------------------------------------------------------------
# case memory and case detail
# ---------------------------------------------------------------------------


async def test_moves_are_indexed_as_settlement_memory(
    client, auth_headers, adjourned, fake_llm, indexed
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()

    await offer(client, auth_headers, case)

    assert [item[0] for item in indexed] == ["settlement", "settlement"]
    mine, theirs = indexed
    assert mine[2].startswith("Settlement attempt 1. The user offered: Rs. 1,00,000")
    assert mine[3] == {
        "by": "user",
        "kind": "offer",
        "attempt": 1,
        "round": 1,
        "amount": 100000,
    }
    assert theirs[2].startswith("Settlement attempt 1. AI counsel countered:")
    assert theirs[3]["round"] == 2


async def test_case_detail_includes_settlements(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(COUNTER)
    case = await adjourned()
    await offer(client, auth_headers, case)

    detail = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()

    assert detail["settlements"][0]["status"] == "negotiating"


async def test_free_text_attempts_from_before_are_dropped(adjourned):
    case = await adjourned()
    collection = case.get_pymongo_collection()
    await collection.update_one(
        {"_id": case.id},
        {"$set": {"settlements": [{"status": "negotiating", "offers": []}]}},
    )

    assert (await reload(case)).settlements == []


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


# ---------------------------------------------------------------------------
# asking the court in session for time to settle
# ---------------------------------------------------------------------------


async def ask(client, headers, case):
    return await client.post(f"/cases/{case.cnr}/settlement/adjourn", headers=headers)


async def test_the_court_gives_time_once_to_talk(client, auth_headers, adjourned):
    case = await adjourned(status=CaseStatus.ACTIVE)

    first = await ask(client, auth_headers, case)
    saved = await reload(case)

    assert first.json()["granted"] is True
    assert saved.status == CaseStatus.ADJOURNED
    asked, ruling, adjourned_note = saved.courtroom_proceedings[-3:]
    assert asked.content == (
        "Counsel for the Plaintiff asks for an adjournment to explore a settlement"
    )
    assert ruling.type == EventType.SETTLEMENT and ruling.sustained is True
    assert ruling.content.startswith("Granted. The parties say they are in talks.")
    assert adjourned_note.content.startswith("Hearing adjourned at the request of")
    assert saved.settlement_adjourn_asks == 1

    saved.status = CaseStatus.ACTIVE
    await saved.save()
    second = await ask(client, auth_headers, case)

    assert second.json() == {
        "granted": False,
        "ruling": "Refused. The court has already given the parties time to settle. "
        "Talks can continue alongside the hearing, which proceeds.",
    }
    after = await reload(case)
    assert after.status == CaseStatus.ACTIVE
    assert after.courtroom_proceedings[-1].sustained is False


async def test_a_second_device_takes_over_then_settles(
    client, auth_headers, adjourned, fake_llm, monkeypatch
):
    """Talks happen out of court, so any of the user's devices can hold them; asking
    the sitting court for time is for the device running the hearing."""

    async def no_conferences(cnr):
        return None

    monkeypatch.setattr(cases_routes, "run_counsel_conferences", no_conferences)
    fake_llm.responses.append(COUNTER)
    case = await adjourned(
        status=CaseStatus.ACTIVE,
        active_session_id="laptop-session",
        active_session_expires_at=get_current_datetime() + timedelta(hours=1),
    )

    sitting = await offer(client, auth_headers, case)
    elsewhere = await ask(client, auth_headers, case)
    await client.post(f"/cases/{case.cnr}/take-over", headers=auth_headers)
    granted = await ask(client, auth_headers, case)
    offered = await offer(client, auth_headers, case)

    assert sitting.status_code == 409
    assert sitting.json()["detail"] == messages.SETTLEMENT_COURT_SITTING
    assert elsewhere.status_code == 409
    assert elsewhere.json()["detail"] == messages.HEARING_ON_OTHER_DEVICE
    assert granted.json()["granted"] is True
    assert offered.status_code == 200
    assert offered.json()["attempt"]["entries"][-1]["kind"] == "counter"


async def test_a_signed_deed_always_gets_time(client, auth_headers, adjourned):
    attempt = agreed_attempt()
    attempt.status = SettlementStatus.SIGNED
    case = await adjourned(
        status=CaseStatus.ACTIVE, settlements=[attempt], settlement_adjourn_asks=3
    )

    response = await ask(client, auth_headers, case)

    assert response.json()["granted"] is True
    assert "file the joint application to quash the FIR" in response.json()["ruling"]
    saved = await reload(case)
    assert saved.status == CaseStatus.ADJOURNED
    assert saved.courtroom_proceedings[-3].content.startswith(
        "Counsel for the Plaintiff reports a signed compromise"
    )


async def test_no_time_once_talks_have_failed(client, auth_headers, adjourned):
    refused = filed_attempt()
    refused.status = SettlementStatus.REFUSED
    case = await adjourned(status=CaseStatus.ACTIVE, settlements=[refused])

    response = await ask(client, auth_headers, case)

    assert response.json()["granted"] is False
    assert "already tried to settle" in response.json()["ruling"]


@pytest.mark.parametrize(
    ("status", "profile", "detail"),
    [
        (CaseStatus.ADJOURNED, PROFILE, messages.SETTLEMENT_NOT_SITTING),
        (CaseStatus.ACTIVE, CLOSED, messages.SETTLEMENT_NO_ROUTE),
    ],
)
async def test_time_to_settle_needs_a_sitting_court_and_a_route(
    client, auth_headers, adjourned, status, profile, detail
):
    case = await adjourned(status=status, settlement_profile=profile)

    response = await ask(client, auth_headers, case)

    assert response.status_code == 409
    assert response.json()["detail"] == detail
    assert (await reload(case)).settlement_adjourn_asks == 0


# ---------------------------------------------------------------------------
# the negotiation analysis
# ---------------------------------------------------------------------------


async def analyse(client, headers, case):
    return await client.post(f"/cases/{case.cnr}/analyze-negotiation", headers=headers)


async def test_a_settled_case_gets_its_negotiation_analysed_once(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(analysis())
    attempt = recorded_attempt(date(2099, 1, 1))
    attempt.ruling = "The FIR is quashed."
    case = await adjourned(
        status=CaseStatus.RESOLVED,
        outcome=CaseOutcome.SETTLED,
        settlement_result="quashed",
        settlements=[attempt],
    )

    first = await analyse(client, auth_headers, case)
    second = await analyse(client, auth_headers, case)

    assert first.status_code == 200 and second.json() == first.json()
    result = first.json()["negotiation"]
    assert result["score"] == 40 + 25 + 9 + 4
    assert result["tier"] == "Strong"
    assert [f["label"] for f in result["factors"]] == [
        "Terms won",
        "Deal closed",
        "Offers used",
        "Conditions",
    ]
    assert result["best"]["amount"] == 92000
    assert result["best"]["conditions"] == ["apology"]
    assert result["call"] == "right"
    assert [n["kind"] for n in result["notes"]] == ["worked", "improve"]
    assert result["review"] == "### How you negotiated\nYou opened well."

    assert len(fake_llm.calls) == 1
    prompt = fake_llm.prompts[0]
    assert prompt.startswith("NEGOTIATION ANALYSIS")
    assert "acted for the accused" in prompt
    assert "You offered: Rs. 1,00,000 in 2 instalments" in prompt
    assert "Terms agreed: Rs. 1,00,000" in prompt
    assert (
        "The court gave the compromise effect (quashed): The FIR is quashed." in prompt
    )
    assert (
        "apology: Written apology to the complainant (favours the complainants)"
        in prompt
    )


async def test_failed_talks_are_weighed_against_the_judgment(
    client, auth_headers, adjourned, fake_llm
):
    fake_llm.responses.append(analysis(call="wrong"))
    attempt = agreed_attempt()
    attempt.status = SettlementStatus.WITHDRAWN
    case = await adjourned(
        status=CaseStatus.RESOLVED,
        outcome=CaseOutcome.LOST,
        verdict="The accused is convicted.",
        settlements=[attempt],
    )

    result = (await analyse(client, auth_headers, case)).json()["negotiation"]

    assert result["call"] == "wrong"
    prompt = fake_llm.prompts[0]
    assert "went to judgment on the merits" in prompt
    assert "LOST" in prompt and "The accused is convicted." in prompt


@pytest.mark.parametrize(
    ("status", "settlements"),
    [
        (CaseStatus.ADJOURNED, "agreed"),  # not decided yet
        (CaseStatus.RESOLVED, None),  # never negotiated
    ],
)
async def test_no_negotiation_analysis_until_there_is_one_to_judge(
    client, auth_headers, adjourned, fake_llm, status, settlements
):
    case = await adjourned(
        status=status, settlements=[agreed_attempt()] if settlements else []
    )

    response = await analyse(client, auth_headers, case)

    assert response.status_code == 409
    assert response.json()["detail"] == messages.NEGOTIATION_NOT_READY
    assert fake_llm.calls == []


@pytest.mark.parametrize("bad", ["no tags at all", "<review>Only a review.</review>"])
async def test_a_bad_analysis_is_not_saved(
    client, auth_headers, adjourned, fake_llm, bad
):
    fake_llm.responses.append(bad)
    case = await adjourned(
        status=CaseStatus.RESOLVED,
        outcome=CaseOutcome.SETTLED,
        settlements=[recorded_attempt(date(2099, 1, 1))],
    )

    response = await analyse(client, auth_headers, case)

    assert response.status_code == 500
    assert response.json()["detail"] == messages.NEGOTIATION_FAILED
    assert (await reload(case)).negotiation is None
