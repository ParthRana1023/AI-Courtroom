"""Tests for case outcomes (decided once after the verdict) and the profile stats."""

import json
from datetime import timedelta

import pytest
from beanie import PydanticObjectId

from app.models.case import (
    ArgumentItem,
    CaseOutcome,
    CaseStatus,
    ExaminationItem,
    NegotiationAnalysis,
    Roles,
    ScoreFactor,
    Settlement,
    SettlementEntry,
    SettlementStatus,
    SettlementTerms,
    WitnessTestimony,
)
from app.models.case_outcome import CaseOutcomeRecord
from app.services.case_outcomes import ensure_outcome
from app.utils.datetime import get_current_datetime
from tests.helpers import reload


def outcome_reply(outcome="won", party="plaintiff", reason="Petition allowed."):
    return json.dumps({"outcome": outcome, "favoured_party": party, "reason": reason})


@pytest.fixture
def resolved_case(user, make_case):
    async def _make(role="plaintiff", **overrides):
        data = {
            "status": CaseStatus.RESOLVED,
            "user_role": Roles(role),
            "ai_role": Roles("defendant" if role == "plaintiff" else "plaintiff"),
            "verdict": "The petition is allowed.",
            f"{role}_arguments": [
                ArgumentItem(
                    type="user", content="My point", role=Roles(role), user_id=user.id
                )
            ],
        }
        data.update(overrides)
        return await make_case(user, **data)

    return _make


async def add_record(user, outcome, role=Roles.PLAINTIFF, days_ago=0, **extra):
    n = await CaseOutcomeRecord.find_all().count()
    return await CaseOutcomeRecord(
        user_id=user.id,
        case_id=PydanticObjectId(),
        cnr=f"REC{n:013d}",
        title=f"Case {n}",
        role=role,
        outcome=outcome,
        decided_at=get_current_datetime() - timedelta(days=days_ago),
        **extra,
    ).insert()


# ---------------------------------------------------------------------------
# deciding the outcome
# ---------------------------------------------------------------------------


async def test_verdict_decides_outcome_in_background(
    client, auth_headers, courtroom_case, user, fake_llm
):
    fake_llm.responses.extend(
        [
            "AI closing statement for the defence.",
            "The petition is dismissed on merits.",
            outcome_reply("lost", "defendant"),
        ]
    )
    case = await courtroom_case(
        "plaintiff",
        plaintiff_arguments=[
            ArgumentItem(
                type="opening", content="open", role=Roles.PLAINTIFF, user_id=user.id
            )
        ],
        defendant_arguments=[
            ArgumentItem(type="opening", content="ai", role=Roles.DEFENDANT)
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "I rest"},
    )

    assert response.status_code == 200
    saved = await reload(case)
    assert saved.outcome == CaseOutcome.LOST
    assert saved.outcome_reason == "Petition allowed."
    record = await CaseOutcomeRecord.find_one(CaseOutcomeRecord.case_id == case.id)
    assert record is not None
    assert (record.role, record.outcome, record.arguments_count) == (
        Roles.PLAINTIFF,
        CaseOutcome.LOST,
        2,
    )
    assert "USER'S ROLE: PLAINTIFF" in fake_llm.prompts[-1]
    assert "The petition is dismissed on merits." in fake_llm.prompts[-1]


async def test_classifier_failure_keeps_verdict_and_leaves_outcome_empty(
    client, auth_headers, courtroom_case, user, fake_llm
):
    fake_llm.responses.extend(
        [
            "AI closing statement for the defence.",
            "Verdict text long enough to keep.",
            "not json at all",
        ]
    )
    case = await courtroom_case(
        "plaintiff",
        plaintiff_arguments=[
            ArgumentItem(
                type="opening", content="open", role=Roles.PLAINTIFF, user_id=user.id
            )
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/closing-statement",
        headers=auth_headers,
        json={"role": "plaintiff", "statement": "I rest"},
    )

    assert response.json()["verdict"] == "Verdict text long enough to keep."
    assert (await reload(case)).outcome is None
    assert await CaseOutcomeRecord.find_all().count() == 0


async def test_outcome_is_decided_only_once(resolved_case, fake_llm):
    fake_llm.responses.append(outcome_reply())
    case = await resolved_case()

    assert await ensure_outcome(case) == CaseOutcome.WON
    assert await ensure_outcome(case) == CaseOutcome.WON

    assert len(fake_llm.calls) == 1
    assert await CaseOutcomeRecord.find_all().count() == 1


async def test_outcome_restored_from_record_when_case_lost_it(resolved_case, fake_llm):
    fake_llm.responses.append(outcome_reply("partial", "mixed"))
    case = await resolved_case()
    await ensure_outcome(case)
    saved = await reload(case)
    saved.outcome = None
    await saved.save()

    assert await ensure_outcome(saved) == CaseOutcome.PARTIAL
    assert len(fake_llm.calls) == 1
    assert (await reload(case)).outcome == CaseOutcome.PARTIAL


async def test_no_outcome_without_verdict_or_role(resolved_case, fake_llm):
    no_verdict = await resolved_case(verdict=None)
    active = await resolved_case(status=CaseStatus.ACTIVE)
    no_role = await resolved_case(user_role=Roles.NOT_STARTED, plaintiff_arguments=[])

    for case in (no_verdict, active, no_role):
        assert await ensure_outcome(case) is None
    assert fake_llm.calls == []


async def test_activity_snapshot_counts_user_actions(resolved_case, fake_llm):
    fake_llm.responses.append(outcome_reply())
    case = await resolved_case(
        party_chats={"p1": [{"sender": "user", "content": "hi"}], "p2": []},
        witness_testimonies=[
            WitnessTestimony(
                witness_id="w1",
                witness_name="W",
                called_by="plaintiff",
                examination=[
                    ExaminationItem(examiner="plaintiff", question="Q", answer="A")
                ],
            ),
            WitnessTestimony(
                witness_id="w2",
                witness_name="X",
                called_by="defendant",
                examination=[
                    ExaminationItem(examiner="defendant", question="Q", answer="A")
                ],
            ),
        ],
    )

    await ensure_outcome(case)

    record = await CaseOutcomeRecord.find_one(CaseOutcomeRecord.case_id == case.id)
    assert record is not None
    assert (
        record.arguments_count,
        record.witnesses_examined,
        record.conferences_held,
        record.evidence_count,
    ) == (1, 1, 1, 0)


# ---------------------------------------------------------------------------
# analysis uses the outcome and is generated once
# ---------------------------------------------------------------------------


async def test_analysis_decides_missing_outcome_and_is_cached(
    client, auth_headers, resolved_case, fake_llm
):
    fake_llm.responses.extend(
        [outcome_reply("lost", "defendant"), "### Outcome\nLost."]
    )
    case = await resolved_case()

    first = await client.post(f"/cases/{case.cnr}/analyze-case", headers=auth_headers)
    second = await client.post(f"/cases/{case.cnr}/analyze-case", headers=auth_headers)

    assert first.json() == {"analysis": "### Outcome\nLost.", "outcome": "lost"}
    assert second.json() == first.json()
    assert len(fake_llm.calls) == 2  # one outcome call, one analysis call
    assert "OUTCOME FOR THE USER: LOST" in fake_llm.prompts[1]
    assert "IMPORTANT VERDICT ANALYSIS" not in fake_llm.prompts[1]
    # Settlement talks have their own analysis.
    assert "SETTLEMENT TALKS" not in fake_llm.prompts[1]
    assert "### Settlement negotiations" not in fake_llm.prompts[1]
    assert (await reload(case)).analyzed_at is not None


def settlement_attempt(status, ruling=None):
    return Settlement(
        status=status,
        ruling=ruling,
        entries=[
            SettlementEntry(
                by="user",
                kind="offer",
                terms=SettlementTerms(
                    amount=50000, instalments=1, months=3, interest=0
                ),
                note="An apology and payment to the complainant.",
            ),
            SettlementEntry(
                by="ai",
                kind="counter",
                terms=SettlementTerms(
                    amount=100000, instalments=2, months=6, interest=0
                ),
                note="My client wants more.",
            ),
        ],
    )


async def test_courtroom_analysis_of_a_settled_case_leaves_the_talks_out(
    client, auth_headers, resolved_case, fake_llm
):
    fake_llm.responses.append("### Outcome\nSettled.")
    case = await resolved_case(
        outcome=CaseOutcome.SETTLED,
        verdict="**ORDER**\n1. The FIR is quashed on the compromise.",
        settlements=[
            settlement_attempt(
                SettlementStatus.RECORDED, "The FIR is quashed on the compromise."
            )
        ],
    )

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    assert response.json()["outcome"] == "settled"
    assert len(fake_llm.calls) == 1  # no outcome classifier for a settled case
    prompt = fake_llm.prompts[0]
    assert "OUTCOME FOR THE USER: SETTLED" in prompt
    # The talks are reviewed by the negotiation analysis, not here.
    assert "Rs. 50,000" not in prompt and "Settlement negotiations" not in prompt


async def test_case_settled_before_any_argument_has_no_courtroom_analysis(
    client, auth_headers, resolved_case, fake_llm
):
    case = await resolved_case(
        outcome=CaseOutcome.SETTLED,
        plaintiff_arguments=[],
        settlements=[settlement_attempt(SettlementStatus.RECORDED, "Quashed.")],
    )

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    # Nothing was argued in court; the negotiation has its own analysis.
    assert response.json()["analysis"] == "No analysis generated."
    assert fake_llm.calls == []


async def test_analysis_without_outcome_says_not_decided(
    client, auth_headers, resolved_case, fake_llm
):
    fake_llm.responses.extend(["garbage", "### Outcome\nMixed."])
    case = await resolved_case()

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    assert response.json()["outcome"] is None
    assert "OUTCOME FOR THE USER: NOT DECIDED" in fake_llm.prompts[1]


# ---------------------------------------------------------------------------
# stats
# ---------------------------------------------------------------------------


async def get_stats(client, headers):
    response = await client.get("/auth/profile/stats", headers=headers)
    assert response.status_code == 200
    return response.json()


async def test_stats_for_new_user_are_zero(client, auth_headers):
    stats = await get_stats(client, auth_headers)

    assert stats["overall"] == {
        "wins": 0,
        "losses": 0,
        "partials": 0,
        "settled": 0,
        "total": 0,
        "win_rate": 0.0,
    }
    assert (stats["current_streak"], stats["best_streak"]) == (0, 0)
    assert stats["recent_form"] == []
    assert len(stats["monthly"]) == 6
    assert stats["pending_outcomes"] == 0


async def test_stats_counts_roles_streaks_and_form(
    client, auth_headers, user, make_user
):
    won, lost, partial = CaseOutcome.WON, CaseOutcome.LOST, CaseOutcome.PARTIAL
    # oldest first: W W W L P W W  -> best streak 3, current 2
    history = [
        (won, Roles.PLAINTIFF),
        (won, Roles.PLAINTIFF),
        (won, Roles.DEFENDANT),
        (lost, Roles.DEFENDANT),
        (partial, Roles.PLAINTIFF),
        (won, Roles.DEFENDANT),
        (won, Roles.PLAINTIFF),
    ]
    for i, (outcome, role) in enumerate(history):
        await add_record(
            user, outcome, role, days_ago=len(history) - i, arguments_count=2
        )
    await add_record(await make_user(), won)  # someone else's

    stats = await get_stats(client, auth_headers)

    assert stats["overall"] == {
        "wins": 5,
        "losses": 1,
        "partials": 1,
        "settled": 0,
        "total": 7,
        "win_rate": 71.4,
    }
    assert (stats["as_plaintiff"]["wins"], stats["as_plaintiff"]["partials"]) == (3, 1)
    assert (stats["as_defendant"]["wins"], stats["as_defendant"]["losses"]) == (2, 1)
    assert (stats["current_streak"], stats["best_streak"]) == (2, 3)
    assert [r["outcome"] for r in stats["recent_form"]][:3] == ["won", "won", "partial"]
    assert stats["activity"]["arguments"] == 14
    assert stats["activity"]["avg_arguments"] == 2.0
    assert sum(m["wins"] for m in stats["monthly"]) == 5


async def test_settled_cases_stay_out_of_win_rate_and_streaks(
    client, auth_headers, user
):
    won, lost, settled = CaseOutcome.WON, CaseOutcome.LOST, CaseOutcome.SETTLED
    # oldest first: W W S W L S -> the settled cases neither break nor extend runs
    history = [won, won, settled, won, lost, settled]
    for i, outcome in enumerate(history):
        await add_record(user, outcome, days_ago=len(history) - i)

    stats = await get_stats(client, auth_headers)

    assert stats["overall"] == {
        "wins": 3,
        "losses": 1,
        "partials": 0,
        "settled": 2,
        "total": 6,
        "win_rate": 75.0,
    }
    assert (stats["current_streak"], stats["best_streak"]) == (0, 3)
    assert stats["recent_form"][0]["outcome"] == "settled"
    assert sum(m["settled"] for m in stats["monthly"]) == 2


@pytest.mark.parametrize(
    ("scoring", "expected"), [("zero", 50.0), ("half", 62.5), ("exclude", 66.7)]
)
async def test_partial_scoring_preference(
    client, auth_headers, user, scoring, expected
):
    for outcome in ["won", "won", "lost", "partial"]:
        await add_record(user, CaseOutcome(outcome))

    response = await client.put(
        "/auth/profile/stats-preference",
        headers=auth_headers,
        json={"partial_scoring": scoring},
    )

    assert response.json()["partial_scoring"] == scoring
    stats = await get_stats(client, auth_headers)
    assert stats["partial_scoring"] == scoring
    assert stats["overall"]["win_rate"] == expected


@pytest.mark.parametrize(
    ("scoring", "rate", "streaks"),
    [
        ("exclude", 50.0, (1, 1)),  # the settled cases are left out
        ("win", 83.3, (5, 5)),  # each one is a win
        ("score", 60.0, (0, 3)),  # 80 and 90 win, 40 loses, the unscored one waits
    ],
)
async def test_settled_scoring_preference(
    client, auth_headers, user, scoring, rate, streaks
):
    settled = CaseOutcome.SETTLED
    # oldest first: L W S80 S90 S40 S(not scored yet)
    history = [
        (CaseOutcome.LOST, None),
        (CaseOutcome.WON, None),
        (settled, 80),
        (settled, 90),
        (settled, 40),
        (settled, None),
    ]
    for i, (outcome, score) in enumerate(history):
        await add_record(
            user, outcome, days_ago=len(history) - i, negotiation_score=score
        )

    response = await client.put(
        "/auth/profile/stats-preference",
        headers=auth_headers,
        json={"settled_scoring": scoring},
    )

    assert response.json()["settled_scoring"] == scoring
    assert response.json()["partial_scoring"] == "zero"  # left as it was
    stats = await get_stats(client, auth_headers)
    assert stats["settled_scoring"] == scoring
    assert stats["overall"]["win_rate"] == rate
    assert stats["overall"]["settled"] == 4
    assert (stats["current_streak"], stats["best_streak"]) == streaks


async def test_negotiator_rating_averages_the_latest_ten_scores(
    client, auth_headers, user, courtroom_case
):
    # Twelve scored cases, oldest first; the two oldest (scored 0) fall out.
    for i in range(12):
        await add_record(
            user,
            CaseOutcome.SETTLED if i % 2 else CaseOutcome.LOST,
            days_ago=12 - i,
            negotiation_score=0 if i < 2 else 60 + i,
            negotiation_factors={"terms": 0 if i < 2 else 70, "offers": 50},
            offers_to_deal=2 if i % 2 else None,
            days_to_settle=4.0 if i % 2 else None,
        )
    await add_record(user, CaseOutcome.WON)  # no talks
    # A decided case with talks the user took part in, not analysed yet.
    terms = SettlementTerms(
        amount=100000, instalments=1, months=3, interest=0, conditions=[]
    )
    await courtroom_case(
        status=CaseStatus.RESOLVED,
        settlements=[
            Settlement(
                status=SettlementStatus.WITHDRAWN,
                entries=[SettlementEntry(by="user", kind="offer", terms=terms)],
            )
        ],
    )

    negotiator = (await get_stats(client, auth_headers))["negotiator"]

    assert negotiator["score"] == 66  # 62 to 71 average 66.5, rounded to even
    assert negotiator["tier"] == "Capable"
    assert negotiator["scored"] == 12
    assert negotiator["factors"] == {"offers": 50, "terms": 70}
    assert negotiator["deals"] == 6
    assert (negotiator["offers_to_deal"], negotiator["days_to_settle"]) == (2.0, 4.0)
    assert negotiator["pending"] == 1


async def test_a_score_from_before_the_ledger_kept_scores_is_copied_in(
    client, auth_headers, user, courtroom_case
):
    case = await courtroom_case(
        status=CaseStatus.RESOLVED,
        outcome=CaseOutcome.SETTLED,
        negotiation=NegotiationAnalysis(
            score=65,
            tier="Capable",
            factors=[
                ScoreFactor(
                    key="terms", label="Terms won", weight=50, value=70, text="."
                )
            ],
            call="right",
            call_text=".",
            review=".",
        ),
    )
    await CaseOutcomeRecord(
        user_id=user.id,
        case_id=case.id,
        cnr=case.cnr,
        role=Roles.PLAINTIFF,
        outcome=CaseOutcome.SETTLED,
    ).insert()

    negotiator = (await get_stats(client, auth_headers))["negotiator"]

    assert (negotiator["score"], negotiator["scored"]) == (65, 1)
    assert negotiator["factors"] == {"terms": 70}
    record = await CaseOutcomeRecord.find_one(CaseOutcomeRecord.case_id == case.id)
    assert record is not None and record.negotiation_score == 65


async def test_no_negotiator_rating_without_a_scored_case(client, auth_headers, user):
    await add_record(user, CaseOutcome.SETTLED)

    negotiator = (await get_stats(client, auth_headers))["negotiator"]

    assert negotiator["score"] is None and negotiator["scored"] == 0


async def test_stats_preference_rejects_unknown_value(client, auth_headers):
    response = await client.put(
        "/auth/profile/stats-preference",
        headers=auth_headers,
        json={"partial_scoring": "double"},
    )

    assert response.status_code == 422


async def test_deleted_cases_still_count(client, auth_headers, resolved_case, fake_llm):
    fake_llm.responses.extend([outcome_reply(), outcome_reply("lost", "defendant")])
    archived = await resolved_case(is_deleted=True)
    purged = await resolved_case()
    await ensure_outcome(archived)
    await ensure_outcome(purged)
    await purged.delete()

    stats = await get_stats(client, auth_headers)

    assert (stats["overall"]["wins"], stats["overall"]["losses"]) == (1, 1)


async def test_pending_outcomes_counts_resolved_cases_without_outcome(
    client, auth_headers, resolved_case
):
    await resolved_case()
    await resolved_case(is_deleted=True)
    await resolved_case(verdict=None)  # resolved without a verdict: can't decide
    await resolved_case(status=CaseStatus.ACTIVE)

    stats = await get_stats(client, auth_headers)

    assert stats["pending_outcomes"] == 2


async def test_case_list_and_detail_include_outcome(
    client, auth_headers, resolved_case, fake_llm
):
    fake_llm.responses.append(outcome_reply())
    case = await resolved_case()
    await ensure_outcome(case)

    listed = (await client.get("/cases", headers=auth_headers)).json()
    detail = (await client.get(f"/cases/{case.cnr}", headers=auth_headers)).json()

    assert listed[0]["outcome"] == "won"
    assert detail["outcome"] == "won"
