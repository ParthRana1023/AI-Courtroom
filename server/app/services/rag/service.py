import hashlib
from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np

from app.config import settings
from app.logging_config import get_logger
from app.models.case import (
    ArgumentItem,
    Case,
    CourtroomProceedingsEvent,
    ExaminationItem,
)
from app.models.case_memory import CaseMemoryChunk, CaseMemorySourceType
from app.models.user import User
from app.services.rag.chunking import MemoryChunk, chunk_text
from app.services.rag.embedding import embed_query, embed_texts
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)


@dataclass(frozen=True)
class RagStatus:
    enabled: bool
    reason: str


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _coerce_source_type(
    source_type: str | CaseMemorySourceType,
) -> CaseMemorySourceType:
    return (
        source_type
        if isinstance(source_type, CaseMemorySourceType)
        else CaseMemorySourceType(source_type)
    )


def _event_content(event: CourtroomProceedingsEvent) -> str:
    if event.question or event.answer:
        return "\n".join(part for part in [event.question, event.answer] if part)
    return event.content or ""


def _argument_content(arg: ArgumentItem) -> str:
    return arg.content or ""


def _case_fallback_context(case: Case, status: RagStatus) -> str:
    details = (getattr(case, "details", None) or "").strip()
    if not details:
        return ""

    if status.enabled:
        note = (
            "RAG is enabled for this case, but no retrievable memory chunks are "
            "available yet. Use the current case details below as the source of truth."
        )
    else:
        note = (
            "RAG is disabled for this case. Use the current case details below as "
            "the source of truth instead of retrieved memory."
        )
    return f"{note}\n\nCurrent case details:\n{details[:6000]}"


async def _get_rag_status_for_case(case: Case) -> RagStatus:
    if not settings.rag_enabled:
        return RagStatus(False, "global_disabled")
    if not getattr(case, "id", None):
        return RagStatus(False, "case_not_persisted")

    try:
        user = await User.get(case.user_id)
        if user is None:
            return RagStatus(True, "user_not_found_default_enabled")
        if not bool(getattr(user, "rag_enabled", True)):
            return RagStatus(False, "user_disabled")
        return RagStatus(True, "enabled")
    except Exception as exc:
        logger.warning(
            "Failed to read user RAG preference; using global RAG setting",
            extra={"case_cnr": getattr(case, "cnr", None), "error": str(exc)},
        )
        return RagStatus(True, "user_preference_read_failed_default_enabled")


async def _is_rag_enabled_for_case(case: Case) -> bool:
    return (await _get_rag_status_for_case(case)).enabled


async def _replace_source_chunks(
    case: Case,
    source_type: CaseMemorySourceType,
    source_id: str,
    chunks: list[MemoryChunk],
) -> int:
    if not chunks:
        return 0

    await CaseMemoryChunk.find(
        CaseMemoryChunk.case_id == case.id,
        CaseMemoryChunk.source_type == source_type,
        CaseMemoryChunk.source_id == source_id,
    ).delete()

    texts = [chunk.content for chunk in chunks]
    rag_enabled = await _is_rag_enabled_for_case(case)
    embeddings = await embed_texts(texts) if rag_enabled else [[] for _ in texts]
    now = get_current_datetime()
    docs = [
        CaseMemoryChunk(
            case_id=case.id,
            cnr=case.cnr,
            user_id=case.user_id,
            source_type=source_type,
            source_id=source_id,
            chunk_index=index,
            content=chunk.content,
            content_hash=_hash_content(chunk.content),
            embedding=embeddings[index],
            metadata=chunk.metadata,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        for index, chunk in enumerate(chunks)
    ]

    if docs:
        await CaseMemoryChunk.insert_many(docs)
    return len(docs)


async def upsert_memory_item(
    case: Case,
    source_type: str | CaseMemorySourceType,
    source_id: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> int:
    if not content:
        return 0

    try:
        coerced_type = _coerce_source_type(source_type)
        chunks = chunk_text(content, metadata or {})
        return await _replace_source_chunks(case, coerced_type, source_id, chunks)
    except Exception as exc:
        logger.warning(
            "RAG memory upsert failed",
            extra={
                "case_cnr": getattr(case, "cnr", None),
                "source_type": str(source_type),
                "source_id": source_id,
                "error": str(exc),
            },
        )
        return 0


async def index_case_memory(case: Case) -> int:
    status = await _get_rag_status_for_case(case)
    logger.debug(
        f"RAG indexing status for case {getattr(case, 'cnr', None)}: "
        f"enabled={status.enabled}, reason={status.reason}"
    )

    try:
        await delete_case_memory(case)
        total = 0
        total += await upsert_memory_item(
            case,
            CaseMemorySourceType.CASE_DETAILS,
            "case_details",
            case.details,
            {"title": case.title, "cnr": case.cnr},
        )

        for evidence in case.evidence:
            total += await upsert_memory_item(
                case,
                CaseMemorySourceType.EVIDENCE,
                evidence.id,
                "\n".join(
                    part
                    for part in [
                        evidence.exhibit_ref,
                        evidence.title,
                        evidence.description,
                        evidence.relevance,
                        evidence.source,
                    ]
                    if part
                ),
                {
                    "exhibit_ref": evidence.exhibit_ref,
                    "evidence_type": evidence.evidence_type,
                    "supports_side": evidence.supports_side.value,
                },
            )

        for party in case.parties_involved:
            if party.bio:
                total += await upsert_memory_item(
                    case,
                    CaseMemorySourceType.PARTY_BIO,
                    party.id,
                    f"{party.name}\n{party.bio}",
                    {
                        "party_id": party.id,
                        "party_name": party.name,
                        "role": party.role.value,
                    },
                )

        for side, args in (
            ("plaintiff", case.plaintiff_arguments),
            ("defendant", case.defendant_arguments),
        ):
            for arg in args:
                total += await upsert_memory_item(
                    case,
                    CaseMemorySourceType.ARGUMENT,
                    f"{side}:{arg.id if hasattr(arg, 'id') else _hash_content(arg.content)}",
                    _argument_content(arg),
                    {"side": side, "argument_type": arg.type, "role": arg.role.value},
                )

        for event in case.courtroom_proceedings:
            total += await upsert_memory_item(
                case,
                CaseMemorySourceType.PROCEEDING,
                event.id,
                _event_content(event),
                {
                    "event_type": event.type.value,
                    "speaker_role": event.speaker_role,
                    "speaker_name": event.speaker_name,
                    "witness_id": event.witness_id,
                },
            )

        for testimony in case.witness_testimonies:
            for exam in testimony.examination:
                total += await upsert_memory_item(
                    case,
                    CaseMemorySourceType.WITNESS_TESTIMONY,
                    exam.id,
                    f"Q: {exam.question}\nA: {exam.answer}",
                    {
                        "witness_id": testimony.witness_id,
                        "witness_name": testimony.witness_name,
                        "examiner": exam.examiner,
                    },
                )

        if case.verdict:
            total += await upsert_memory_item(
                case,
                CaseMemorySourceType.VERDICT,
                "verdict",
                case.verdict,
                {"title": case.title},
            )
        if case.analysis:
            total += await upsert_memory_item(
                case,
                CaseMemorySourceType.ANALYSIS,
                "analysis",
                case.analysis,
                {"title": case.title},
            )

        for party_id, messages in case.party_chats.items():
            for message in messages:
                total += await upsert_memory_item(
                    case,
                    CaseMemorySourceType.PARTY_CHAT,
                    message.get("id", _hash_content(message.get("content", ""))),
                    message.get("content", ""),
                    {"party_id": party_id, "sender": message.get("sender")},
                )

        logger.info(f"Indexed {total} RAG chunks for case {case.cnr}")
        return total
    except Exception as exc:
        logger.warning(
            "RAG case indexing failed",
            extra={"case_cnr": getattr(case, "cnr", None), "error": str(exc)},
        )
        return 0


async def retrieve_case_context(
    case: Case,
    query: str,
    source_types: Iterable[str | CaseMemorySourceType] | None = None,
    top_k: int | None = None,
) -> str:
    status = await _get_rag_status_for_case(case)
    logger.debug(
        f"RAG retrieval status for case {getattr(case, 'cnr', None)}: "
        f"enabled={status.enabled}, reason={status.reason}"
    )
    if not query:
        return ""
    if not status.enabled:
        return _case_fallback_context(case, status)

    try:
        filters = [
            CaseMemoryChunk.case_id == case.id,
            CaseMemoryChunk.is_active == True,  # noqa: E712
        ]
        if source_types:
            filters.append(
                {
                    "source_type": {
                        "$in": [
                            str(_coerce_source_type(item).value)
                            for item in source_types
                        ]
                    }
                }
            )

        chunks = await CaseMemoryChunk.find(*filters).to_list()
        if not chunks:
            indexed_source_types = [
                str(_coerce_source_type(item).value) for item in source_types or []
            ]
            logger.debug(
                f"No RAG chunks found for case {getattr(case, 'cnr', None)}; "
                f"indexing available case details (source_types={indexed_source_types})"
            )
            await index_case_memory(case)
            chunks = await CaseMemoryChunk.find(*filters).to_list()
            if not chunks:
                return _case_fallback_context(case, status)

        query_vector = np.array(await embed_query(query), dtype=np.float32)
        if query_vector.size == 0:
            return _case_fallback_context(case, status)

        scored: list[tuple[float, CaseMemoryChunk]] = []
        for chunk in chunks:
            if not chunk.embedding:
                continue
            vector = np.array(chunk.embedding, dtype=np.float32)
            if vector.size != query_vector.size:
                continue
            score = float(np.dot(query_vector, vector))
            if score >= settings.rag_min_score:
                scored.append((score, chunk))

        limit = top_k or settings.rag_top_k
        scored.sort(key=lambda item: item[0], reverse=True)
        selected = scored[:limit]
        if not selected:
            return _case_fallback_context(case, status)

        context_blocks = []
        for index, (score, chunk) in enumerate(selected, start=1):
            label = chunk.metadata.get("section_title") or chunk.source_type.value
            context_blocks.append(
                f"[{index}] {chunk.source_type.value} | {label} | score={score:.3f}\n{chunk.content}"
            )
        return "\n\n".join(context_blocks)
    except Exception as exc:
        logger.warning(
            "RAG retrieval failed",
            extra={"case_cnr": getattr(case, "cnr", None), "error": str(exc)},
        )
        return _case_fallback_context(case, status)


async def delete_case_memory(case: Case) -> int:
    if not case.id:
        return 0
    try:
        result = await CaseMemoryChunk.find(CaseMemoryChunk.case_id == case.id).delete()
        return getattr(result, "deleted_count", 0) or 0
    except Exception as exc:
        logger.warning(
            "RAG memory delete failed",
            extra={"case_cnr": getattr(case, "cnr", None), "error": str(exc)},
        )
        return 0
