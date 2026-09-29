import hashlib
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import numpy as np
from beanie.operators import In
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.config import settings
from app.logging_config import get_logger
from app.models.case import (
    ArgumentItem,
    Case,
    CourtroomProceedingsEvent,
)
from app.models.case_memory import CaseMemoryChunk, CaseMemorySourceType
from app.models.user import User
from app.services.rag.chunking import MemoryChunk, chunk_text
from app.services.rag.embedding import embed_query, embed_texts
from app.utils.datetime import get_current_datetime
from app.utils.llm import UNTRUSTED_TEXT_RULE, get_llm, strip_thinking, tagged

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


# Chat memory that belongs to one party; party_id filters it (see retrieval).
PRIVATE_CHAT_SOURCES = {
    CaseMemorySourceType.PARTY_CHAT,
    CaseMemorySourceType.AI_PARTY_CHAT,
}

# RAG-off input: case details are always sent whole. Past
# settings.full_text_proceedings_limit the newest proceedings stay word for word
# and older ones are folded into a short summary, updated only every
# settings.proceedings_summary_batch lines to keep the cost low.

SUMMARY_PROMPT = """You are a court clerk keeping the record for counsel who will
continue this hearing. Update the summary of the earlier proceedings.

Keep every factual claim, admission, exhibit reference, witness statement and
ruling, and say which side made each point. Leave out courtesies and repetition.
Plain prose, at most 250 words.

{untrusted_text_rule}

Summary so far:
{previous}

Proceedings to add:
{lines}
"""


def _transcript_lines(case: Case) -> list[str]:
    return [
        f"{event.speaker_name or (event.speaker_role or 'Court').capitalize()}: "
        f"{_event_content(event)}"
        for event in getattr(case, "courtroom_proceedings", None) or []
        if _event_content(event)
    ]


async def _summarize_proceedings(previous: str | None, lines: list[str]) -> str:
    prompt = ChatPromptTemplate.from_messages([("human", SUMMARY_PROMPT)])
    chain = prompt | get_llm("analyzer") | StrOutputParser()
    text = await chain.ainvoke(
        {
            "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
            "previous": previous or "(none yet)",
            "lines": tagged("\n".join(lines), "history"),
        }
    )
    return strip_thinking(text)


async def _proceedings_text(case: Case) -> str:
    """The courtroom record, with the oldest part summarised if it is too long."""
    lines = _transcript_lines(case)
    limit = settings.full_text_proceedings_limit
    if sum(len(line) + 1 for line in lines) <= limit:
        return "\n".join(lines)

    # Newest lines that fit, leaving room for the summary of everything older.
    start, used = len(lines), 0
    while (
        start
        and used + len(lines[start - 1]) + 1
        <= limit - settings.proceedings_summary_reserve
    ):
        start -= 1
        used += len(lines[start]) + 1

    summary = getattr(case, "proceedings_summary", None)
    covered = getattr(case, "proceedings_summary_covers", 0) if summary else 0
    if covered > start:  # record shrank or summary is stale: rebuild
        summary, covered = None, 0

    if not summary or start - covered >= settings.proceedings_summary_batch:
        try:
            summary = await _summarize_proceedings(summary, lines[covered:start])
        except Exception:
            logger.warning(
                "Proceedings summary failed; sending only the newest proceedings",
                extra={"case_cnr": getattr(case, "cnr", None)},
                exc_info=True,
            )
            return "\n".join(lines[start:])
        covered = start
        case.proceedings_summary = summary
        case.proceedings_summary_covers = covered
        if getattr(case, "id", None):
            await Case.find_one(Case.id == case.id).update_one(
                {
                    "$set": {
                        "proceedings_summary": summary,
                        "proceedings_summary_covers": covered,
                    }
                }
            )

    # Lines after the summary; at most one batch more than the budget.
    recent = "\n".join(lines[covered:])
    return (
        f"Summary of earlier proceedings:\n{summary}\n\nRecent proceedings:\n{recent}"
    )


async def _counsel_conference_text(case: Case, party_id: str | None) -> str:
    """The AI lawyer's private conferences (optionally one party's), newest kept."""
    if not getattr(case, "id", None):
        return ""
    names = {p.id: p.name for p in getattr(case, "parties_involved", None) or []}
    lines: list[str] = []
    ai_chats = await Case.load_ai_party_chats(case.id, party_id)
    for conference_party_id, messages in ai_chats.items():
        name = names.get(conference_party_id, "Party")
        lines.append(f"-- Conference with {name} --")
        lines += [
            f"{'Counsel' if m.get('sender') == 'counsel' else name}: {m.get('content', '')}"
            for m in messages
        ]
    text = "\n".join(lines)
    return text[-settings.counsel_conference_text_limit :]


async def _full_case_text(
    case: Case, include_conferences: bool = False, party_id: str | None = None
) -> str:
    """Case details (always whole) followed by the courtroom record."""
    details = (getattr(case, "details", None) or "").strip()
    proceedings = await _proceedings_text(case)
    parts = [f"Case details:\n{details}"] if details else []
    if proceedings:
        parts.append(f"Courtroom proceedings so far:\n{proceedings}")
    if include_conferences:
        conferences = await _counsel_conference_text(case, party_id)
        if conferences:
            parts.append(
                f"Private conferences (not known to the court):\n{conferences}"
            )
    return "\n\n".join(parts)


async def _case_fallback_context(
    case: Case,
    status: RagStatus,
    include_conferences: bool = False,
    party_id: str | None = None,
) -> str:
    text = await _full_case_text(case, include_conferences, party_id)
    if not text or not status.enabled:
        return text
    note = (
        "No retrieved memory matched this request; the full case record follows "
        "as the source of truth."
    )
    return f"{note}\n\n{text}"


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
            exc_info=True,
        )
        return RagStatus(True, "user_preference_read_failed_default_enabled")


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
    # Every case keeps a searchable vector store, whatever the user's setting:
    # case analysis always retrieves, and the user may turn RAG on later.
    embeddings = (
        await embed_texts(texts) if settings.rag_enabled else [[] for _ in texts]
    )
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
            exc_info=True,
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
                        evidence.source,
                    ]
                    if part
                ),
                {
                    "exhibit_ref": evidence.exhibit_ref,
                    "evidence_type": evidence.evidence_type,
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
                    f"{side}:{_hash_content(arg.content)}",
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

        ai_chats = await Case.load_ai_party_chats(case.id)
        for conference_party_id, messages in ai_chats.items():
            for message in messages:
                total += await upsert_memory_item(
                    case,
                    CaseMemorySourceType.AI_PARTY_CHAT,
                    message.get("id", _hash_content(message.get("content", ""))),
                    message.get("content", ""),
                    {"party_id": conference_party_id, "sender": message.get("sender")},
                )

        logger.info(f"Indexed {total} RAG chunks for case {case.cnr}")
        return total
    except Exception as exc:
        logger.warning(
            "RAG case indexing failed",
            extra={"case_cnr": getattr(case, "cnr", None), "error": str(exc)},
            exc_info=True,
        )
        return 0


async def retrieve_case_context(
    case: Case,
    query: str,
    source_types: Iterable[str | CaseMemorySourceType] | None = None,
    top_k: int | None = None,
    always_rag: bool = False,
    party_id: str | None = None,
) -> str:
    """Context for a prompt: retrieved chunks when RAG is on for this user,
    otherwise the full case details and courtroom record.

    ``always_rag`` retrieves regardless of the user's setting (case analysis).
    ``party_id`` limits party-chat memory to that party's own conversations.
    """
    include_conferences = CaseMemorySourceType.AI_PARTY_CHAT in {
        _coerce_source_type(item) for item in source_types or []
    }
    if always_rag and settings.rag_enabled and getattr(case, "id", None):
        status = RagStatus(True, "always_rag")
    else:
        status = await _get_rag_status_for_case(case)
    logger.debug(
        f"RAG retrieval status for case {getattr(case, 'cnr', None)}: "
        f"enabled={status.enabled}, reason={status.reason}"
    )
    if not query:
        return ""
    if not status.enabled:
        return await _case_fallback_context(case, status, include_conferences, party_id)

    try:
        filters: list[Any] = [
            CaseMemoryChunk.case_id == case.id,
            CaseMemoryChunk.is_active == True,
        ]
        if source_types:
            filters.append(
                In(
                    CaseMemoryChunk.source_type,
                    [_coerce_source_type(item) for item in source_types],
                )
            )

        def own_chats_only(found: list[CaseMemoryChunk]) -> list[CaseMemoryChunk]:
            if party_id is None:
                return found
            return [
                chunk
                for chunk in found
                if chunk.source_type not in PRIVATE_CHAT_SOURCES
                or chunk.metadata.get("party_id") == party_id
            ]

        chunks = own_chats_only(await CaseMemoryChunk.find(*filters).to_list())
        if not chunks or any(not chunk.embedding for chunk in chunks):
            indexed_source_types = [
                _coerce_source_type(item).value for item in source_types or []
            ]
            logger.debug(
                f"RAG chunks missing or unembedded for case "
                f"{getattr(case, 'cnr', None)}; re-indexing "
                f"(source_types={indexed_source_types})"
            )
            await index_case_memory(case)
            chunks = own_chats_only(await CaseMemoryChunk.find(*filters).to_list())
            if not chunks:
                return await _case_fallback_context(
                    case, status, include_conferences, party_id
                )

        query_vector = np.array(await embed_query(query), dtype=np.float32)
        if query_vector.size == 0:
            return await _case_fallback_context(
                case, status, include_conferences, party_id
            )

        scored: list[tuple[float, CaseMemoryChunk]] = []
        for chunk in chunks:
            vector = np.array(chunk.embedding, dtype=np.float32)
            if vector.size != query_vector.size:  # also skips empty vectors
                continue
            score = float(np.dot(query_vector, vector))
            if score >= settings.rag_min_score:
                scored.append((score, chunk))

        limit = top_k or settings.rag_top_k
        scored.sort(key=lambda item: item[0], reverse=True)
        selected = scored[:limit]
        if not selected:
            return await _case_fallback_context(
                case, status, include_conferences, party_id
            )

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
            exc_info=True,
        )
        return await _case_fallback_context(case, status, include_conferences, party_id)


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
            exc_info=True,
        )
        return 0
