import re
import time
import json
from typing import List

from app.models.case import EvidenceItem
from app.utils.llm import get_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.logging_config import get_logger

logger = get_logger(__name__)


async def extract_evidence_items(
    case_text: str | None,
    rag_context: str | None = None,
) -> List[EvidenceItem]:
    """Extract structured evidence cards from the generated petition markdown using LLM."""
    if not case_text and not rag_context:
        return []

    context = rag_context or case_text
    
    template = """Extract all evidence items mentioned in this legal case.

CASE TEXT:
{context}

RULES:
- Identify every piece of evidence (witness testimony, physical objects, documents, digital evidence, etc.)
- For each item, provide:
    - title: A short descriptive name (e.g., "CCTV Footage", "Witness Statement of Rahul")
    - evidence_type: Choose from (Witness Testimony, Physical Evidence, Digital Evidence, Medical Record, Document, or other)
    - description: A clear summary of what the evidence is and what it shows
    - source: Who provided the evidence (e.g., "Prosecution", "Rahul Sharma", "Police")

Return the data ONLY as a JSON list of objects. No other text.

Example format:
[
  {{
    "title": "...",
    "evidence_type": "...",
    "description": "...",
    "source": "..."
  }}
]
"""

    prompt = ChatPromptTemplate.from_messages([("human", template)])
    chain = prompt | get_llm("drafter") | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({"context": context})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        # Clean up response (remove markdown code blocks if present)
        response = re.sub(r"```(?:json)?\s*(.*?)\s*```", r"\1", response, flags=re.DOTALL).strip()
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        evidence_data = json.loads(response)
        items: List[EvidenceItem] = []
        
        for index, data in enumerate(evidence_data, start=1):
            items.append(
                EvidenceItem(
                    exhibit_ref=f"EX-{index:02d}",
                    title=data.get("title", f"Evidence {index}"),
                    evidence_type=data.get("evidence_type", "Document"),
                    description=data.get("description", ""),
                    source=data.get("source"),
                    image_prompt=_build_image_prompt(data.get("title", ""), data.get("description", ""))
                )
            )
        
        logger.info(f"Extracted {len(items)} evidence items via LLM in {duration_ms:.2f}ms")
        return items

    except Exception as e:
        logger.error(f"Error extracting evidence via LLM: {str(e)}", exc_info=True)
        return []


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

    clean_description = re.sub(r"\s+", " ", description.replace("**", "")).strip()
    return (
        "Create a neutral, non-graphic legal exhibit illustration for "
        f"{title}: {clean_description[:240]}"
    )
