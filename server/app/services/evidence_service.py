import re
from typing import List

from app.models.case import EvidenceItem, EvidenceSide


SECTION_END_RE = re.compile(
    r"\n\s*(?:---|\*\*(?:PRAYER|VERIFICATION|GROUNDS|BACKGROUND)[^*]*:\*\*)",
    re.IGNORECASE,
)


def extract_evidence_items(case_text: str | None) -> List[EvidenceItem]:
    """Extract structured evidence cards from the generated petition markdown."""
    if not case_text:
        return []

    evidence_text = _extract_evidence_section(case_text)
    if not evidence_text:
        return []

    items: List[EvidenceItem] = []
    exhibit_number = 1
    current_category = "Evidence"

    lines = [line.rstrip() for line in evidence_text.splitlines()]
    index = 0
    while index < len(lines):
        raw_line = lines[index].strip()
        line = _strip_list_marker(raw_line)

        if not line:
            index += 1
            continue

        category = _extract_bold_text(line)
        if category and not _looks_like_evidence_line(line):
            current_category = category.replace(":", "").strip()
            index += 1
            continue

        parsed = _parse_evidence_line(line)
        if parsed:
            title, description = parsed
            consumed, testimony = _collect_testimony(lines, index + 1)
            if testimony:
                description = f"{description}\n\nTestimony: {testimony}".strip()
                if current_category.lower().startswith("eyewitness"):
                    title = title or "Witness Testimony"

            items.append(
                EvidenceItem(
                    exhibit_ref=f"EX-{exhibit_number:02d}",
                    title=_clean_text(title) or f"Evidence {exhibit_number}",
                    evidence_type=_infer_evidence_type(current_category, title),
                    description=_clean_text(description),
                    source=_infer_source(title, current_category),
                    relevance=_infer_relevance(description),
                    supports_side=_infer_supported_side(description),
                    bns_sections=_extract_bns_sections(description),
                    image_prompt=_build_image_prompt(title, description),
                )
            )
            exhibit_number += 1
            index += max(consumed, 1)
            continue

        index += 1

    return items


def _extract_evidence_section(case_text: str) -> str:
    match = re.search(r"\*\*EVIDENCE:\*\*(.*)", case_text, re.IGNORECASE | re.DOTALL)
    if not match:
        return ""

    evidence_text = match.group(1).strip()
    end_match = SECTION_END_RE.search(evidence_text)
    if end_match:
        evidence_text = evidence_text[: end_match.start()].strip()
    return evidence_text


def _strip_list_marker(line: str) -> str:
    return re.sub(r"^[-*]\s*", "", line).strip()


def _extract_bold_text(line: str) -> str:
    match = re.match(r"^\*\*(.+?)\*\*:?\s*$", line)
    return match.group(1).strip() if match else ""


def _looks_like_evidence_line(line: str) -> bool:
    return bool(re.match(r"^\*\*(.+?)\*\*:\s*(.+)", line))


def _parse_evidence_line(line: str) -> tuple[str, str] | None:
    match = re.match(r"^\*\*(.+?)\*\*:\s*(.+)", line)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    if len(line) > 40 and ":" in line:
        title, description = line.split(":", 1)
        return title.strip(), description.strip()

    return None


def _collect_testimony(lines: list[str], start_index: int) -> tuple[int, str]:
    consumed = 1
    testimony_parts: list[str] = []

    for index in range(start_index, len(lines)):
        line = _strip_list_marker(lines[index].strip())
        if not line:
            consumed += 1
            continue
        if _parse_evidence_line(line) or _extract_bold_text(line):
            break

        testimony_match = re.match(r"^\*\*Testimony:\*\*\s*(.+)", line, re.IGNORECASE)
        if testimony_match:
            testimony_parts.append(testimony_match.group(1).strip())
            consumed += 1
            continue

        if testimony_parts:
            testimony_parts.append(line)
            consumed += 1
            continue

        break

    return consumed, " ".join(testimony_parts)


def _infer_evidence_type(category: str, title: str) -> str:
    text = f"{category} {title}".lower()
    if "witness" in text or "testimony" in text:
        return "Witness Testimony"
    if "medical" in text or "injury" in text:
        return "Medical Record"
    if "digital" in text or "cctv" in text or "phone" in text or "video" in text:
        return "Digital Evidence"
    if "physical" in text:
        return "Physical Evidence"
    if "report" in text or "document" in text or "fir" in text:
        return "Document"
    return category.replace(":", "").strip() or "Evidence"


def _infer_source(title: str, category: str) -> str | None:
    if category.lower().startswith("eyewitness"):
        return title
    return None


def _infer_relevance(description: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", description.strip())
    return sentences[0][:260] if sentences and sentences[0] else description[:260]


def _infer_supported_side(description: str) -> EvidenceSide:
    text = description.lower()
    plaintiff_terms = ("applicant", "petitioner", "complainant", "victim")
    defendant_terms = ("non-applicant", "respondent", "accused", "defendant")

    plaintiff_hits = sum(term in text for term in plaintiff_terms)
    defendant_hits = sum(term in text for term in defendant_terms)

    if plaintiff_hits and defendant_hits:
        return EvidenceSide.BOTH
    if plaintiff_hits:
        return EvidenceSide.PLAINTIFF
    if defendant_hits:
        return EvidenceSide.DEFENDANT
    return EvidenceSide.UNKNOWN


def _extract_bns_sections(description: str) -> list[str]:
    sections = re.findall(
        r"(?:BNS\s*)?Section\s+(\d+[A-Z]?)", description, re.IGNORECASE
    )
    return sorted({f"Section {section.upper()}" for section in sections})


def _build_image_prompt(title: str, description: str) -> str | None:
    text = f"{title} {description}".lower()
    visual_terms = (
        "photograph",
        "cctv",
        "video",
        "scene",
        "weapon",
        "injury",
        "document",
    )
    if not any(term in text for term in visual_terms):
        return None

    return (
        "Create a neutral, non-graphic legal exhibit illustration for "
        f"{title}: {_clean_text(description)[:240]}"
    )


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("**", "")).strip()
