import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MemoryChunk:
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


_HEADER_RE = re.compile(
    r"^\s*(?:#{1,6}\s+|\*\*[^*\n]{3,120}:\*\*|[A-Z][A-Z\s/&().-]{4,}:)\s*$"
)


def _section_title(line: str) -> str:
    title = line.strip().strip("#").strip()
    title = title.strip("*").rstrip(":").strip()
    return title or "Untitled Section"


def _split_markdown_sections(text: str) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []
    current_title = "Case Document"
    current_lines: list[str] = []

    for line in text.splitlines():
        if _HEADER_RE.match(line):
            if current_lines:
                sections.append((current_title, "\n".join(current_lines).strip()))
            current_title = _section_title(line)
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_title, "\n".join(current_lines).strip()))

    return [(title, body) for title, body in sections if body]


def _fallback_split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            boundary = max(text.rfind("\n", start, end), text.rfind(". ", start, end))
            if boundary > start + chunk_size // 2:
                end = boundary + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - chunk_overlap, start + 1)
    return [chunk for chunk in chunks if chunk]


def _split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len,
        )
        return splitter.split_text(text)
    except Exception:
        return _fallback_split_text(text, chunk_size, chunk_overlap)


def chunk_text(
    text: str,
    base_metadata: dict[str, Any] | None = None,
    chunk_size: int = 900,
    chunk_overlap: int = 120,
) -> list[MemoryChunk]:
    clean_text = (text or "").strip()
    if not clean_text:
        return []

    metadata = base_metadata or {}
    chunks: list[MemoryChunk] = []
    for section_title, section_text in _split_markdown_sections(clean_text):
        for part in _split_text(section_text, chunk_size, chunk_overlap):
            part = part.strip()
            if part:
                chunks.append(
                    MemoryChunk(
                        content=part,
                        metadata={**metadata, "section_title": section_title},
                    )
                )

    return chunks
