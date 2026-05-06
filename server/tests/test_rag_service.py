from types import SimpleNamespace

import pytest

from app.models.case_memory import CaseMemorySourceType
from app.services.rag import service as rag_service


class FakeFindResult:
    def __init__(self, chunks):
        self._chunks = chunks

    async def to_list(self):
        return self._chunks


@pytest.mark.asyncio
async def test_retrieve_case_context_ranks_relevant_chunks(monkeypatch):
    case = SimpleNamespace(id="case-id", cnr="CNR0000000000001")
    chunks = [
        SimpleNamespace(
            embedding=[1.0, 0.0],
            content="CCTV footage shows the respondent entering the warehouse.",
            metadata={"section_title": "EVIDENCE"},
            source_type=CaseMemorySourceType.EVIDENCE,
        ),
        SimpleNamespace(
            embedding=[0.0, 1.0],
            content="The court address is listed in Mumbai.",
            metadata={"section_title": "COURT DETAILS"},
            source_type=CaseMemorySourceType.CASE_DETAILS,
        ),
    ]

    monkeypatch.setattr(rag_service.CaseMemoryChunk, "find", lambda *args: FakeFindResult(chunks))
    monkeypatch.setattr(rag_service, "embed_query", lambda query: _async_value([1.0, 0.0]))
    monkeypatch.setattr(rag_service.settings, "rag_enabled", True)
    monkeypatch.setattr(rag_service.settings, "rag_min_score", 0.0)

    context = await rag_service.retrieve_case_context(case, "warehouse CCTV", top_k=1)

    assert "CCTV footage" in context
    assert "court address" not in context


@pytest.mark.asyncio
async def test_retrieve_case_context_returns_empty_when_disabled(monkeypatch):
    case = SimpleNamespace(id="case-id", cnr="CNR0000000000001")
    monkeypatch.setattr(rag_service.settings, "rag_enabled", False)

    assert await rag_service.retrieve_case_context(case, "anything") == ""


@pytest.mark.asyncio
async def test_retrieve_case_context_explains_disabled_rag_with_case_details(monkeypatch):
    case = SimpleNamespace(
        id="case-id",
        cnr="CNR0000000000001",
        details="The current case details are still available.",
    )
    monkeypatch.setattr(rag_service.settings, "rag_enabled", False)

    context = await rag_service.retrieve_case_context(case, "anything")

    assert "RAG is disabled for this case" in context
    assert "The current case details are still available." in context


@pytest.mark.asyncio
async def test_retrieve_case_context_indexes_empty_memory_then_falls_back(monkeypatch):
    case = SimpleNamespace(
        id="case-id",
        cnr="CNR0000000000001",
        details="Fresh case details to seed when memory chunks are missing.",
    )
    indexed = {"called": False}

    async def fake_index_case_memory(_case):
        indexed["called"] = True
        return 0

    monkeypatch.setattr(
        rag_service.CaseMemoryChunk, "find", lambda *args: FakeFindResult([])
    )
    monkeypatch.setattr(rag_service, "index_case_memory", fake_index_case_memory)
    monkeypatch.setattr(rag_service.settings, "rag_enabled", True)

    context = await rag_service.retrieve_case_context(case, "seed memory")

    assert indexed["called"] is True
    assert "RAG is enabled for this case" in context
    assert "Fresh case details" in context


async def _async_value(value):
    return value
