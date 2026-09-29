"""The AI lawyer's private conferences with the parties on its own side."""

from app.config import settings
from app.models.case import Case, CaseStatus, Roles
from app.models.case_memory import CaseMemoryChunk, CaseMemorySourceType
from app.models.party import PartyInvolved, PartyRole
from app.services import counsel_conferences as cc
from app.services.llm import parties_service as ps
from app.services.rag import service as rag


def responder(prompt: str) -> str:
    if "Ask " in prompt and "short, specific questions" in prompt:
        return "1. Where were you that night?\n2. Do you have the receipt?\nThanks."
    return "I was at home, and yes, I kept the receipt."


def ai_side_case(make_case, user, **overrides):
    data = {
        "user_role": Roles.PLAINTIFF,
        "ai_role": Roles.DEFENDANT,
        "status": CaseStatus.ADJOURNED,
        "parties_involved": [
            PartyInvolved(id="client", name="Asha Rao", role=PartyRole.NON_APPLICANT),
            PartyInvolved(id="theirs", name="Ravi Kumar", role=PartyRole.APPLICANT),
        ],
    }
    return make_case(user, **(data | overrides))


async def test_ai_counsel_confers_only_with_its_own_side(user, make_case, fake_llm):
    fake_llm.responder = responder
    case = await ai_side_case(make_case, user)

    await cc.run_counsel_conferences(case.cnr)

    chats = await Case.load_ai_party_chats(case.id)
    assert list(chats) == ["client"]  # not the user's party
    senders = [m["sender"] for m in chats["client"]]
    assert senders == ["counsel", "party", "counsel", "party"]
    assert chats["client"][0]["content"] == "Where were you that night?"
    chunks = await CaseMemoryChunk.find(
        CaseMemoryChunk.source_type == CaseMemorySourceType.AI_PARTY_CHAT
    ).to_list()
    assert chunks and all(c.metadata["party_id"] == "client" for c in chunks)


async def test_ai_counsel_stops_at_the_per_party_limit(user, make_case, fake_llm):
    fake_llm.responder = responder
    case = await ai_side_case(make_case, user)

    for _ in range(5):
        await cc.run_counsel_conferences(case.cnr)

    chats = await Case.load_ai_party_chats(case.id, "client")
    asked = [m for m in chats["client"] if m["sender"] == "counsel"]
    assert len(asked) == settings.counsel_questions_per_party


async def test_no_conferences_without_an_ai_role_or_case(user, make_case, fake_llm):
    fake_llm.responder = responder
    case = await ai_side_case(make_case, user, ai_role=Roles.NOT_STARTED)

    await cc.run_counsel_conferences(case.cnr)
    await cc.run_counsel_conferences("NOPE000000000000")

    assert await Case.load_ai_party_chats(case.id) == {}


async def test_no_conferences_while_in_session_or_after_a_session_ended(
    user, make_case, fake_llm
):
    fake_llm.responder = responder
    in_session = await ai_side_case(make_case, user, status=CaseStatus.ACTIVE)
    session_ended = await ai_side_case(make_case, user, adjourned_by_session_end=True)

    await cc.run_counsel_conferences(in_session.cnr)
    await cc.run_counsel_conferences(session_ended.cnr)

    assert await Case.load_ai_party_chats(in_session.id) == {}
    assert await Case.load_ai_party_chats(session_ended.id) == {}
    assert fake_llm.calls == []


async def test_ai_counsel_confers_during_case_prep(user, make_case, fake_llm):
    fake_llm.responder = responder
    case = await ai_side_case(make_case, user, status=CaseStatus.NOT_STARTED)

    await cc.run_counsel_conferences(case.cnr)

    assert list(await Case.load_ai_party_chats(case.id)) == ["client"]


async def test_no_conferences_once_the_case_is_resolved(user, make_case, fake_llm):
    fake_llm.responder = responder
    case = await ai_side_case(make_case, user, status=CaseStatus.RESOLVED)

    await cc.run_counsel_conferences(case.cnr)

    assert await Case.load_ai_party_chats(case.id) == {}


async def test_a_failing_conference_does_not_stop_the_others(
    user, make_case, fake_llm, monkeypatch
):
    fake_llm.responder = responder
    case = await ai_side_case(
        make_case,
        user,
        parties_involved=[
            PartyInvolved(id="a", name="Asha Rao", role=PartyRole.NON_APPLICANT),
            PartyInvolved(id="b", name="Bina Das", role=PartyRole.NON_APPLICANT),
        ],
    )
    real_confer = cc._confer

    async def flaky(case_arg, party):
        if party.id == "a":
            raise RuntimeError("provider down")
        await real_confer(case_arg, party)

    monkeypatch.setattr(cc, "_confer", flaky)

    await cc.run_counsel_conferences(case.cnr)

    assert list(await Case.load_ai_party_chats(case.id)) == ["b"]


async def test_ai_lawyer_reads_its_conferences_but_the_judge_does_not(
    user, make_case, fake_llm
):
    fake_llm.responder = responder
    user.rag_enabled = False  # full-text mode
    await user.save()
    case = await ai_side_case(make_case, user, details="Facts.")
    await cc.run_counsel_conferences(case.cnr)

    lawyer_view = await rag.retrieve_case_context(
        case, "counter", source_types=["ai_party_chat", "case_details"]
    )
    judge_view = await rag.retrieve_case_context(case, "verdict", ["case_details"])
    other_party = await rag.retrieve_case_context(
        case, "answer", ["ai_party_chat"], party_id="theirs"
    )

    assert "Private conferences (not known to the court)" in lawyer_view
    assert "Counsel: Where were you that night?" in lawyer_view
    assert "Private conferences" not in judge_view
    assert "Where were you" not in other_party


async def test_rebuilt_memory_keeps_the_conferences(user, make_case, fake_llm):
    fake_llm.responder = responder
    case = await ai_side_case(make_case, user)
    await cc.run_counsel_conferences(case.cnr)

    await rag.index_case_memory(case)  # rebuilds everything from scratch

    assert (
        await CaseMemoryChunk.find(
            CaseMemoryChunk.source_type == CaseMemorySourceType.AI_PARTY_CHAT
        ).count()
        == 4
    )


async def test_counsel_questions_keep_only_real_questions(fake_llm):
    fake_llm.responses.append("Here you go:\n- Who else saw it?\n2) Why?\nDone.")

    questions = await ps.generate_counsel_questions("defendant", "Asha", "ctx", [], 5)

    assert questions == ["Who else saw it?", "Why?"]


def test_lawyer_party_pairing_rule():
    assert ps.can_lawyer_confer_with_party(Roles.DEFENDANT, PartyRole.NON_APPLICANT)
    assert ps.can_lawyer_confer_with_party("plaintiff", PartyRole.APPLICANT)
    assert not ps.can_lawyer_confer_with_party(Roles.PLAINTIFF, PartyRole.NON_APPLICANT)
    assert not ps.can_lawyer_confer_with_party(None, PartyRole.APPLICANT)


async def test_unsaved_case_has_no_conference_notes():
    from types import SimpleNamespace

    assert await rag._counsel_conference_text(SimpleNamespace(id=None), None) == ""
