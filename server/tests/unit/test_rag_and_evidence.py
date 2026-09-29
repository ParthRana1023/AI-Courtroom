"""Tests for RAG memory (chunking, embedding, indexing, retrieval) and evidence services."""

from types import SimpleNamespace

import pytest
from beanie import PydanticObjectId

from app.config import settings
from app.models.case import (
    ArgumentItem,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    EvidenceItem,
    EvidenceMediaStatus,
    ExaminationItem,
    Roles,
    WitnessTestimony,
)
from app.models.case_memory import CaseMemoryChunk, CaseMemorySourceType
from app.models.party import PartyInvolved, PartyRole
from app.services import evidence_service as es
from app.services import rag as rag_package
from app.services.image_generation import ImageGenerationError
from app.services.llm.evidence import generate_evidence_prompt
from app.services.rag import chunking, embedding
from app.services.rag import service as rag
from tests.helpers import boom, reload

# ---------------------------------------------------------------------------
# chunking
# ---------------------------------------------------------------------------


def test_chunk_text_splits_on_label_headers():
    text = "Intro line\n**Evidence Summary:**\nCCTV exists.\nPRAYER:\nGrant relief."

    chunks = chunking.chunk_text(text, {"cnr": "X"})

    titles = [c.metadata["section_title"] for c in chunks]
    assert titles == ["Case Document", "Evidence Summary", "PRAYER"]
    assert all(c.metadata["cnr"] == "X" for c in chunks)


def test_chunk_text_splits_on_markdown_headings():
    chunks = chunking.chunk_text("Intro\n## FACTS\nThe car was red.")

    assert [c.metadata["section_title"] for c in chunks] == ["Case Document", "FACTS"]


def test_chunk_text_splits_long_sections_and_keeps_metadata():
    text = (
        "**FACTS:**\nThe applicant alleges that the respondent entered the warehouse at night.\n"
        "The CCTV footage and inventory register are material.\n\n"
        "**EVIDENCE:**\nExhibit P1 is CCTV footage from the loading bay.\nExhibit P2 is the inventory register."
    )

    chunks = chunking.chunk_text(
        text, {"source": "case_details"}, chunk_size=140, chunk_overlap=20
    )

    assert {c.metadata["section_title"] for c in chunks} == {"FACTS", "EVIDENCE"}
    assert all(
        c.metadata["source"] == "case_details" and c.content.strip() for c in chunks
    )
    assert all(len(c.content) <= 140 for c in chunks)


def test_chunk_text_empty_input():
    assert chunking.chunk_text("   ") == []
    # None on purpose
    # pyrefly: ignore[bad-argument-type]
    assert chunking.chunk_text(None) == []


def test_section_title_defaults_when_blank():
    assert chunking._section_title("## ") == "Untitled Section"


def test_fallback_splitter_respects_size_and_overlap():
    text = ". ".join(f"Sentence number {i}" for i in range(40))

    chunks = chunking._fallback_split_text(text, chunk_size=120, chunk_overlap=20)

    assert len(chunks) > 1
    assert all(len(c) <= 120 for c in chunks)
    assert chunks[-1].endswith("39")


def test_split_text_uses_fallback_when_splitter_unavailable(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "langchain_text_splitters":
            raise ImportError("not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    assert chunking._split_text("a" * 50, chunk_size=20, chunk_overlap=5)[0] == "a" * 20


# ---------------------------------------------------------------------------
# embedding (the sentence-transformers model is replaced by a fake)
# ---------------------------------------------------------------------------


class FakeSentenceModel:
    def encode(self, texts, normalize_embeddings, show_progress_bar):
        assert normalize_embeddings is True
        return [[float(len(t)), 0.0] for t in texts]


async def test_embed_texts_and_query_use_loaded_model(monkeypatch):
    monkeypatch.setattr(embedding, "_load_model", lambda: FakeSentenceModel())

    assert embedding.embed_texts_sync([]) == []
    assert await embedding.embed_texts(["ab", "abcd"]) == [[2.0, 0.0], [4.0, 0.0]]
    assert await embedding.embed_query("xyz") == [3.0, 0.0]


async def test_embed_query_empty_result(monkeypatch):
    async def no_embeddings(texts):
        return []

    monkeypatch.setattr(embedding, "embed_texts", no_embeddings)

    assert await embedding.embed_query("x") == []


def test_load_model_builds_sentence_transformer_once(monkeypatch):
    created = []

    class FakeST:
        def __init__(self, name):
            created.append(name)

    monkeypatch.setattr(
        embedding,
        "import_module",
        lambda name: SimpleNamespace(SentenceTransformer=FakeST),
    )
    embedding._load_model.cache_clear()
    try:
        embedding._load_model()
        embedding._load_model()
    finally:
        embedding._load_model.cache_clear()

    assert created == [settings.embedding_model_name]


# ---------------------------------------------------------------------------
# RAG service against the in-memory database
# ---------------------------------------------------------------------------


@pytest.fixture
def rich_case(user, make_case):
    async def _make(**overrides):
        return await make_case(
            user,
            details="## FACTS\nThe landlord kept the security deposit after the tenant left.",
            evidence=[
                EvidenceItem(
                    exhibit_ref="EX-01",
                    title="Rent agreement",
                    evidence_type="Document",
                    description="Signed lease showing deposit amount",
                    source="Tenant",
                )
            ],
            parties_involved=[
                PartyInvolved(
                    name="Ravi",
                    role=PartyRole.APPLICANT,
                    bio="Tenant who paid the deposit",
                ),
                PartyInvolved(name="Silent", role=PartyRole.NON_APPLICANT),
            ],
            plaintiff_arguments=[
                ArgumentItem(
                    type="opening",
                    content="Deposit must be refunded",
                    role=Roles.PLAINTIFF,
                )
            ],
            defendant_arguments=[
                ArgumentItem(
                    type="opening",
                    content="Damage justified deduction",
                    role=Roles.DEFENDANT,
                )
            ],
            courtroom_proceedings=[
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
                    question="Was there damage?",
                ),
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
                    content="Court in session",
                ),
            ],
            witness_testimonies=[
                WitnessTestimony(
                    witness_id="w1",
                    witness_name="Ravi",
                    called_by="plaintiff",
                    examination=[
                        ExaminationItem(
                            examiner="plaintiff", question="Paid?", answer="Yes"
                        )
                    ],
                )
            ],
            **overrides,
        )

    return _make


async def test_index_case_memory_covers_every_source(rich_case):
    case = await rich_case()

    total = await rag.index_case_memory(case)

    chunks = await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).to_list()
    assert total == len(chunks)
    sources = {c.source_type for c in chunks}
    assert sources == {
        CaseMemorySourceType.CASE_DETAILS,
        CaseMemorySourceType.EVIDENCE,
        CaseMemorySourceType.PARTY_BIO,
        CaseMemorySourceType.ARGUMENT,
        CaseMemorySourceType.PROCEEDING,
        CaseMemorySourceType.WITNESS_TESTIMONY,
    }
    assert all(c.embedding for c in chunks)
    assert not any("Silent" in c.content for c in chunks)  # party without bio skipped


async def test_reindex_replaces_previous_chunks(rich_case):
    case = await rich_case()
    first = await rag.index_case_memory(case)

    second = await rag.index_case_memory(case)

    assert first == second
    assert (
        await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).count() == second
    )


async def test_upsert_memory_item_replaces_same_source(rich_case):
    case = await rich_case()

    await rag.upsert_memory_item(case, "argument", "arg-1", "first version")
    await rag.upsert_memory_item(
        case, CaseMemorySourceType.ARGUMENT, "arg-1", "second version"
    )

    chunks = await CaseMemoryChunk.find(CaseMemoryChunk.source_id == "arg-1").to_list()
    assert [c.content for c in chunks] == ["second version"]
    assert await rag.upsert_memory_item(case, "argument", "arg-2", "") == 0


async def test_upsert_memory_item_survives_errors(rich_case):
    case = await rich_case()

    assert await rag.upsert_memory_item(case, "not-a-source-type", "x", "content") == 0


async def test_rag_off_user_gets_full_case_text_but_case_is_still_indexed(
    rich_case, user
):
    user.rag_enabled = False
    await user.save()
    case = await rich_case()

    await rag.upsert_memory_item(case, "argument", "a", "some argument")
    context = await rag.retrieve_case_context(case, "deposit")

    chunk = await CaseMemoryChunk.find_one(CaseMemoryChunk.source_id == "a")
    assert chunk is not None and chunk.embedding  # vector store kept regardless
    assert context.startswith("Case details:\n## FACTS")
    assert "Courtroom proceedings so far:" in context
    assert "Was there damage?" in context
    assert "[1]" not in context  # no retrieved chunks


async def test_case_analysis_retrieval_ignores_the_rag_off_setting(
    rich_case, user, monkeypatch
):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    user.rag_enabled = False
    await user.save()
    case = await rich_case()

    context = await rag.retrieve_case_context(case, "deposit", always_rag=True)

    assert context.startswith("[1] ")


async def test_chunks_saved_without_embeddings_are_reindexed(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    case = await rich_case()
    await CaseMemoryChunk(
        case_id=case.id,
        cnr=case.cnr,
        user_id=case.user_id,
        source_type=CaseMemorySourceType.CASE_DETAILS,
        source_id="case_details",
        content="stale unembedded chunk",
        content_hash="h",
        embedding=[],
    ).insert()

    context = await rag.retrieve_case_context(case, "deposit")

    assert context.startswith("[1] ")
    chunks = await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).to_list()
    assert chunks and all(chunk.embedding for chunk in chunks)


def points(count, start=0):
    return [
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.ARGUMENT,
            content=f"point {i:02d}",
            speaker_role="plaintiff",
        )
        for i in range(start, start + count)
    ]


@pytest.fixture
def small_budget(monkeypatch):
    # Each line is "Plaintiff: point NN" (19 chars + newline).
    monkeypatch.setattr(settings, "full_text_proceedings_limit", 100)
    monkeypatch.setattr(settings, "proceedings_summary_reserve", 40)
    monkeypatch.setattr(settings, "proceedings_summary_batch", 3)


async def test_short_record_is_sent_whole_without_summarising(
    user, make_case, fake_llm, small_budget
):
    case = await make_case(user, details="Facts.", courtroom_proceedings=points(4))

    text = await rag._full_case_text(case)

    assert text.startswith("Case details:\nFacts.")
    assert "Plaintiff: point 00" in text and "Plaintiff: point 03" in text
    assert fake_llm.calls == []


async def test_long_record_keeps_details_and_newest_lines_and_summarises_the_rest(
    user, make_case, fake_llm, small_budget
):
    fake_llm.responses.append("Plaintiff argued points 0 to 7.")
    case = await make_case(
        user, details="Full facts " * 50, courtroom_proceedings=points(11)
    )

    text = await rag._full_case_text(case)

    assert ("Full facts " * 50).strip() in text  # details never cut
    assert "Summary of earlier proceedings:\nPlaintiff argued points 0 to 7." in text
    assert "Plaintiff: point 10" in text and "Plaintiff: point 00" not in text
    assert "<history>" in fake_llm.prompts[0]
    saved = await reload(case)
    assert saved.proceedings_summary == "Plaintiff argued points 0 to 7."
    assert saved.proceedings_summary_covers == 8


async def test_summary_is_reused_until_a_full_batch_scrolls_out(
    user, make_case, fake_llm, small_budget
):
    fake_llm.responses.extend(["First summary.", "Second summary."])
    case = await make_case(user, courtroom_proceedings=points(11))
    await rag._full_case_text(case)

    case.courtroom_proceedings += points(2, start=11)  # fewer than a batch
    reused = await rag._full_case_text(case)

    assert "First summary." in reused and len(fake_llm.calls) == 1

    case.courtroom_proceedings += points(2, start=13)  # now a batch has passed
    updated = await rag._full_case_text(case)

    assert "Second summary." in updated and len(fake_llm.calls) == 2
    assert "First summary." in fake_llm.prompts[1]  # folded, not redone


async def test_summary_failure_falls_back_to_newest_lines(
    user, make_case, fake_llm, small_budget
):
    fake_llm.error = RuntimeError("provider down")
    case = await make_case(user, courtroom_proceedings=points(11))

    text = await rag._full_case_text(case)

    assert "Summary" not in text and "Plaintiff: point 10" in text
    assert "Plaintiff: point 00" not in text


async def test_stale_summary_is_rebuilt(user, make_case, fake_llm, small_budget):
    fake_llm.responses.append("Fresh summary.")
    case = await make_case(
        user,
        courtroom_proceedings=points(11),
        proceedings_summary="Old summary.",
        proceedings_summary_covers=50,  # more lines than exist
    )

    text = await rag._full_case_text(case)

    assert "Fresh summary." in text and "Old summary." not in fake_llm.prompts[0]


async def test_party_chats_are_limited_to_the_given_party(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    case = await rich_case()
    await rag.index_case_memory(case)
    for party_id, text in (
        ("ravi", "Ravi said the deposit was paid"),
        ("other", "Other said the deposit was kept"),
    ):
        await rag.upsert_memory_item(
            case, "party_chat", f"chat-{party_id}", text, {"party_id": party_id}
        )

    own = await rag.retrieve_case_context(
        case, "deposit", source_types=["party_chat"], party_id="ravi"
    )
    everyone = await rag.retrieve_case_context(
        case, "deposit", source_types=["party_chat"]
    )

    assert "Ravi said" in own and "Other said" not in own
    assert "Ravi said" in everyone and "Other said" in everyone


async def test_retrieve_ranks_relevant_chunks(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.1)
    case = await rich_case()
    await rag.index_case_memory(case)

    context = await rag.retrieve_case_context(
        case, "security deposit landlord tenant", top_k=2
    )

    blocks = context.split("\n\n[")
    assert len(blocks) == 2
    assert "deposit" in blocks[0].lower()
    assert context.startswith("[1] ")


async def test_retrieve_filters_by_source_type(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    case = await rich_case()
    await rag.index_case_memory(case)

    context = await rag.retrieve_case_context(
        case, "deposit", source_types=["evidence"]
    )

    assert context.count("evidence |") >= 1
    assert "argument |" not in context


async def test_retrieve_indexes_on_first_use(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    case = await rich_case()

    context = await rag.retrieve_case_context(case, "deposit")

    assert context.startswith("[1]")
    assert await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).count() > 0


async def test_retrieve_fallbacks(rich_case, monkeypatch):
    case = await rich_case()
    assert await rag.retrieve_case_context(case, "") == ""

    monkeypatch.setattr(settings, "rag_min_score", 2.0)  # nothing can score this high
    assert "No retrieved memory matched" in await rag.retrieve_case_context(
        case, "deposit"
    )


async def test_retrieve_skips_unembedded_or_mismatched_chunks(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    case = await rich_case()
    for embedding_value in ([1.0, 0.0],):  # wrong dimension for the model
        await CaseMemoryChunk(
            case_id=case.id,
            cnr=case.cnr,
            user_id=case.user_id,
            source_type=CaseMemorySourceType.ARGUMENT,
            source_id=f"s{len(embedding_value)}",
            content="odd chunk",
            content_hash="h",
            embedding=embedding_value,
        ).insert()

    context = await rag.retrieve_case_context(case, "deposit")

    assert "odd chunk" not in context


async def test_retrieve_with_empty_query_vector(rich_case, monkeypatch):
    case = await rich_case()
    await rag.index_case_memory(case)

    async def empty(text):
        return []

    monkeypatch.setattr(rag, "embed_query", empty)

    assert "No retrieved memory matched" in await rag.retrieve_case_context(
        case, "deposit"
    )


async def test_rag_status_reasons(rich_case, monkeypatch, user):
    case = await rich_case()

    assert (await rag._get_rag_status_for_case(case)).reason == "enabled"
    assert (
        await rag._get_rag_status_for_case(SimpleNamespace(id=None))
    ).reason == "case_not_persisted"
    orphan = SimpleNamespace(id="x", user_id=PydanticObjectId(), cnr="c")
    assert (
        await rag._get_rag_status_for_case(orphan)
    ).reason == "user_not_found_default_enabled"

    monkeypatch.setattr(settings, "rag_enabled", False)
    assert (await rag._get_rag_status_for_case(case)).reason == "global_disabled"


async def test_global_rag_switch_off_falls_back_to_case_details(monkeypatch):
    monkeypatch.setattr(settings, "rag_enabled", False)

    with_details = SimpleNamespace(
        id="x", cnr="c", details="The current case details are still available."
    )
    without_details = SimpleNamespace(id="x", cnr="c")

    context = await rag.retrieve_case_context(with_details, "anything")
    assert context.startswith("Case details:")
    assert "The current case details are still available." in context
    assert await rag.retrieve_case_context(without_details, "anything") == ""


async def test_fallback_context_empty_details():
    status = rag.RagStatus(True, "enabled")

    assert await rag._case_fallback_context(SimpleNamespace(details="  "), status) == ""


def test_event_content_prefers_question_and_answer():
    event = CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
        question="Q?",
        answer="A.",
        content="ignored",
    )

    assert rag._event_content(event) == "Q?\nA."
    assert (
        rag._event_content(
            CourtroomProceedingsEvent(type=CourtroomProceedingsEventType.SYSTEM_MESSAGE)
        )
        == ""
    )


async def test_delete_case_memory(rich_case):
    case = await rich_case()
    await rag.index_case_memory(case)

    assert await rag.delete_case_memory(case) > 0
    assert await rag.delete_case_memory(SimpleNamespace(id=None)) == 0


async def test_delete_and_index_survive_database_errors(rich_case, monkeypatch):
    case = await rich_case()

    def broken(*args, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(CaseMemoryChunk, "find", broken)

    assert await rag.delete_case_memory(case) == 0
    assert await rag.index_case_memory(case) == 0
    assert "No retrieved memory matched" in await rag.retrieve_case_context(
        case, "deposit"
    )


async def test_package_level_wrappers_delegate(rich_case, monkeypatch):
    monkeypatch.setattr(settings, "rag_min_score", 0.0)
    case = await rich_case()

    assert await rag_package.index_case_memory(case) > 0
    assert (
        await rag_package.upsert_memory_item(case, "verdict", "v", "Suit decreed") == 1
    )
    assert "Suit decreed" in await rag_package.retrieve_case_context(
        case, "Suit decreed", source_types=["verdict"]
    )
    assert await rag_package.delete_case_memory(case) > 0


# ---------------------------------------------------------------------------
# Evidence LLM prompt generation
# ---------------------------------------------------------------------------


async def test_generate_evidence_prompt_skips_non_visual_evidence(fake_llm):
    assert (
        await generate_evidence_prompt("Oral promise", "He said he would pay") is None
    )
    assert fake_llm.calls == []


async def test_generate_evidence_prompt_strips_thinking(fake_llm):
    fake_llm.responses.append("<think>plan</think> A grainy CCTV still with timestamp")

    prompt = await generate_evidence_prompt("CCTV clip", "x" * 800, "Digital Evidence")

    assert prompt == "A grainy CCTV still with timestamp"
    assert "x" * 501 not in fake_llm.prompts[0]


async def test_generate_evidence_prompt_returns_none_on_llm_error(fake_llm):
    fake_llm.error = RuntimeError("down")

    assert await generate_evidence_prompt("Medical report", "injury noted") is None


# ---------------------------------------------------------------------------
# evidence_service
# ---------------------------------------------------------------------------


async def test_extract_evidence_items_parses_fenced_json(fake_llm):
    fake_llm.responses.append(
        '<think>hmm</think>```json\n[{"title": "CCTV Footage", "evidence_type": "Digital Evidence", '
        '"description": "Video shows entry", "source": "Police"}, {}]\n```'
    )

    items = await es.extract_evidence_items("case text")

    assert [i.exhibit_ref for i in items] == ["EX-01", "EX-02"]
    assert str(items[0].image_prompt).startswith("Create a neutral")
    assert (items[1].title, items[1].evidence_type, items[1].image_prompt) == (
        "Evidence 2",
        "Document",
        None,
    )


async def test_extract_evidence_items_edge_cases(fake_llm):
    assert await es.extract_evidence_items(None) == []

    fake_llm.responses.append("not json")
    assert await es.extract_evidence_items("text", rag_context="ctx") == []
    assert "ctx" in fake_llm.prompts[0]


async def test_extract_evidence_from_text(fake_llm):
    fake_llm.responses.append(
        '{"title": "Bank receipt", "evidence_type": "Document", "description": "Paid 5000", "image_prompt": "A receipt"}'
    )

    item = await es.extract_evidence_from_text(
        "I paid 5000", source="Ravi", exhibit_ref="EX-07"
    )

    assert (item.exhibit_ref, item.title, item.source, item.image_prompt) == (
        "EX-07",
        "Bank receipt",
        "Ravi",
        "A receipt",
    )


async def test_extract_evidence_from_text_falls_back_on_bad_json(fake_llm):
    fake_llm.responses.append("sorry, cannot")

    item = await es.extract_evidence_from_text("  He saw a weapon  ", source="Witness")

    assert (item.exhibit_ref, item.title, item.evidence_type) == (
        "EX-01",
        "Extracted Evidence",
        "Witness Testimony",
    )
    assert item.description == "He saw a weapon"
    assert str(item.image_prompt).startswith("Create a neutral")


def test_next_exhibit_ref_and_format_context():
    case = SimpleNamespace(
        evidence=[
            EvidenceItem(
                exhibit_ref="EX-03",
                title="A",
                evidence_type="Document",
                description="d",
                source="S",
            ),
            EvidenceItem(
                exhibit_ref="Annexure",
                title="B",
                evidence_type="Other",
                description="e",
            ),
        ]
    )

    assert es.next_exhibit_ref(case) == "EX-04"
    assert es.next_exhibit_ref(SimpleNamespace(evidence=[])) == "EX-01"
    assert (
        es.format_evidence_context([]) == "No structured evidence has been submitted."
    )
    assert es.format_evidence_context(case.evidence) == (
        "EX-03: A | Type: Document | Description: d | Source: S\nAnnexure: B | Type: Other | Description: e"
    )


async def test_index_evidence_item(user, make_case):
    case = await make_case(user)
    item = EvidenceItem(
        exhibit_ref="EX-01",
        title="Photo",
        evidence_type="Digital",
        description="Scene photo",
    )

    await es.index_evidence_item(case, item)

    chunk = await CaseMemoryChunk.find_one(CaseMemoryChunk.source_id == item.id)
    assert chunk is not None
    assert "Scene photo" in chunk.content


def evidence(title="CCTV clip", **overrides):
    data = {
        "exhibit_ref": "EX-01",
        "title": title,
        "evidence_type": "Digital Evidence",
        "description": "Video of the scene",
        "image_prompt": "grainy still",
    }
    data.update(overrides)
    return EvidenceItem(**data)


async def test_generate_missing_images_respects_limit(
    user, make_case, image_pipeline, fake_llm, monkeypatch
):
    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 2)
    fake_llm.responses.append("generated prompt")
    case = await make_case(
        user,
        evidence=[
            evidence(
                "Already", image_url="u", media_status=EvidenceMediaStatus.GENERATED
            ),
            evidence("Pending", media_status=EvidenceMediaStatus.PENDING),
            evidence(
                "Needs prompt", image_prompt=None, description="CCTV of the scene"
            ),
            evidence("Not visual", image_prompt=None, description="An oral promise"),
            evidence("Over limit"),
        ],
    )

    summary = await es.generate_missing_evidence_images_for_case(case)

    assert (summary.generated, summary.attempted, summary.already_generated) == (
        1,
        1,
        2,
    )
    assert case.evidence[2].image_prompt == "generated prompt"
    assert case.evidence[2].media_status == EvidenceMediaStatus.GENERATED
    assert case.evidence[4].media_status == EvidenceMediaStatus.NOT_REQUESTED
    assert "0 of 2 successful image slot(s) remain" in summary.message


async def test_generate_missing_images_disabled_or_full(user, make_case, monkeypatch):
    case = await make_case(
        user,
        evidence=[evidence(image_url="u", media_status=EvidenceMediaStatus.GENERATED)],
    )

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 1)
    assert (
        await es.generate_missing_evidence_images_for_case(case)
    ).message == "Evidence image generation limit already reached."

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 0)
    assert (
        await es.generate_missing_evidence_images_for_case(case)
    ).message == "Evidence image generation is disabled."


@pytest.mark.parametrize(
    "error, expected_message",
    [
        (
            ImageGenerationError(
                "x", user_message="Provider busy", model="m", status_code=503
            ),
            "Provider busy",
        ),
        (RuntimeError("boom"), "Image generation failed unexpectedly"),
    ],
)
async def test_generation_failures_mark_item_failed(
    user, make_case, image_pipeline, monkeypatch, error, expected_message
):
    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 2)
    image_pipeline["fail"] = error
    case = await make_case(user, evidence=[evidence()])

    summary = await es.generate_missing_evidence_images_for_case(case)

    assert summary.failed == 1
    assert case.evidence[0].media_status == EvidenceMediaStatus.FAILED
    assert expected_message in summary.message
    assert "Failed attempts do not count" in summary.message


async def test_empty_prompt_is_reported_as_failure(
    user, make_case, image_pipeline, monkeypatch
):
    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 1)
    case = await make_case(user, evidence=[evidence()])
    item = case.evidence[0]
    item.image_prompt = ""
    summary = es.EvidenceGenerationSummary(limit=1, already_generated=0)

    await es._attempt_evidence_image_generation(case, 0, item, summary)

    assert summary.failed == 1 and "Image prompt is empty" in summary.message


async def test_regenerate_single_item(
    user, make_case, image_pipeline, fake_llm, monkeypatch
):
    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 2)
    fake_llm.responses.append("fresh prompt")
    case = await make_case(
        user,
        evidence=[evidence(image_prompt=None, media_status=EvidenceMediaStatus.FAILED)],
    )

    summary = await es.regenerate_evidence_image_for_case_item(
        case, case.evidence[0].id
    )

    assert summary.generated == 1
    assert image_pipeline["uploads"] == [case.evidence[0].id]


async def test_regenerate_guard_rails(user, make_case, fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 1)
    done = evidence("Done", image_url="u", media_status=EvidenceMediaStatus.GENERATED)
    silent = evidence("Oral", image_prompt=None, description="He promised verbally")
    case = await make_case(user, evidence=[done, silent])

    assert (
        await es.regenerate_evidence_image_for_case_item(case, "missing")
    ).message == "Evidence not found."
    assert (
        await es.regenerate_evidence_image_for_case_item(case, done.id)
    ).message == "Evidence image has already been generated."
    assert (
        await es.regenerate_evidence_image_for_case_item(case, silent.id)
    ).message == "Evidence image generation limit already reached."

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 3)
    assert (
        await es.regenerate_evidence_image_for_case_item(case, silent.id)
    ).message == "No image prompt is available for this evidence."

    monkeypatch.setattr(settings, "evidence_image_generation_limit_per_case", 0)
    assert (
        await es.regenerate_evidence_image_for_case_item(case, silent.id)
    ).message == "Evidence image generation is disabled."


async def test_index_includes_verdict_analysis_and_party_chats(rich_case):
    case = await rich_case(
        verdict="Suit decreed",
        analysis="You argued well",
        party_chats={
            "p1": [
                {"id": "m1", "sender": "user", "content": "Hello"},
                {"sender": "party", "content": "Namaste"},
            ]
        },
    )

    await rag.index_case_memory(case)

    sources = {
        c.source_type
        for c in await CaseMemoryChunk.find(
            CaseMemoryChunk.case_id == case.id
        ).to_list()
    }
    assert {
        CaseMemorySourceType.VERDICT,
        CaseMemorySourceType.ANALYSIS,
        CaseMemorySourceType.PARTY_CHAT,
    } <= sources


async def test_upsert_whitespace_only_content_stores_nothing(rich_case):
    case = await rich_case()

    assert await rag.upsert_memory_item(case, "argument", "blank", "   \n  ") == 0


async def test_index_case_memory_reports_zero_on_unexpected_error(
    rich_case, monkeypatch
):
    case = await rich_case()

    monkeypatch.setattr(rag, "upsert_memory_item", boom)

    assert await rag.index_case_memory(case) == 0


async def test_rag_status_defaults_to_enabled_when_user_lookup_fails():
    unreadable = SimpleNamespace(id="x", cnr="c")  # no user_id attribute

    assert (
        await rag._get_rag_status_for_case(unreadable)
    ).reason == "user_preference_read_failed_default_enabled"


async def test_retrieve_falls_back_when_indexing_produces_nothing(
    rich_case, monkeypatch
):
    case = await rich_case()

    async def index_nothing(case_arg):
        return 0

    monkeypatch.setattr(rag, "index_case_memory", index_nothing)

    context = await rag.retrieve_case_context(case, "deposit")

    assert context.startswith("No retrieved memory matched")
