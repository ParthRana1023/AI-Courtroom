# app/services/llm/evidence.py
"""
LLM-powered evidence image prompt generation service.

Uses the drafter model to generate detailed, high-quality image prompts
from evidence metadata.  Actual image generation (e.g. via FLUX.1-dev)
is *not* performed here — this module only enriches the text prompt so
it can later be fed to a text-to-image pipeline when that integration
is built out.
"""

import time

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.logging_config import get_logger
from app.utils.llm import get_llm, strip_thinking

logger = get_logger(__name__)

# Evidence mentioning none of these is treated as non-visual (no image).
VISUAL_TERMS = (
    "photograph",
    "cctv",
    "video",
    "scene",
    "weapon",
    "injury",
    "document",
    "report",
    "medical",
    "physical",
    "digital",
    "location",
    "map",
    "diagram",
)


# Evidence types that are always worth an exhibit image, whatever their text says
VISUAL_EVIDENCE_TYPES = ("digital", "physical", "medical", "document")


def looks_visual(
    title: str, description: str, evidence_type: str | None = None
) -> bool:
    kind = (evidence_type or "").lower()
    if "witness" in kind or "testimony" in kind:
        return False
    if any(term in kind for term in VISUAL_EVIDENCE_TYPES):
        return True
    text = f"{title} {description}".lower()
    return any(term in text for term in VISUAL_TERMS)


async def generate_evidence_prompt(
    title: str,
    description: str,
    evidence_type: str | None = None,
) -> str | None:
    """Generate a detailed, photorealistic image-generation prompt for a
    piece of legal evidence.

    The output is a self-contained text prompt suitable for a
    text-to-image model such as FLUX.1-dev or Stable Diffusion.

    Parameters
    ----------
    title : str
        Short title of the evidence item (e.g. "CCTV Footage").
    description : str
        Longer narrative description extracted from the case petition.
    evidence_type : str | None
        Optional category hint (e.g. "Medical Record", "Physical Evidence").

    Returns
    -------
    str | None
        A refined image prompt, or ``None`` if the evidence does not lend
        itself to visual representation.
    """
    # Quick pre-filter: skip evidence that is inherently non-visual.
    if not looks_visual(title, description, evidence_type):
        logger.debug(f"Skipping non-visual evidence: {title}")
        return None

    template = """You are a forensic evidence visualisation expert.  Given the
metadata of a legal evidence item, produce a single, detailed image prompt
that a text-to-image AI model can use to generate a realistic, NEUTRAL,
NON-GRAPHIC legal exhibit illustration.

EVIDENCE METADATA:
- Title: {title}
- Type: {evidence_type}
- Description: {description}

RULES:
1. The prompt must describe a photorealistic, courtroom-appropriate image.
2. Do NOT include any graphic violence, gore, or disturbing imagery.
3. If the evidence is a document (e.g. medical report, FIR), describe the
   document layout with realistic headers, stamps, and text placeholders.
4. If the evidence is CCTV footage, describe a grainy security-camera still
   with a timestamp overlay.
5. If the evidence is a physical object (e.g. weapon, clothing), describe
   it placed on a neutral evidence table with an exhibit tag.
6. Keep the prompt under 200 words.
7. Return ONLY the image prompt text — no preamble, no explanation.
"""

    prompt = ChatPromptTemplate.from_messages([("human", template)])
    chain = prompt | get_llm("drafter") | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke(
            {
                "title": title,
                "evidence_type": evidence_type or "Evidence",
                "description": description[:500],
            }
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Strip thinking tags if present
        response = strip_thinking(response)

        logger.info(
            f"Evidence prompt generated for '{title}' in {duration_ms:.2f}ms, "
            f"prompt length: {len(response)} chars"
        )
        return response

    except Exception:
        logger.exception(f"Error generating evidence prompt for '{title}'")
        return None
