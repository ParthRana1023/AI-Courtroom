# app/utils/llm.py
"""
LLM factory for the AI Courtroom.

Each courtroom task is served by a dedicated model.
The factory returns a LangChain ChatModel wrapper so that the rest of the
codebase can keep using ``chain.invoke()`` / ``chain.ainvoke()`` unchanged.
"""

import re
from functools import cache
from importlib import import_module

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_groq import ChatGroq

from app.config import settings
from app.logging_config import get_logger

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)


def strip_thinking(text: str) -> str:
    """Drop reasoning models' <think>...</think> blocks and surrounding whitespace."""
    return _THINK_BLOCK.sub("", text).strip()


def pick_case_context(rag_context: str | None, case_details: str | None) -> str:
    """Retrieved RAG context if any, else the start of the case document."""
    return rag_context or (
        case_details[:6000] if case_details else "No case details provided"
    )


logger = get_logger(__name__)

# A reply shorter than this is treated as cut off or empty.
MIN_RESPONSE_CHARS = 20
MAX_SHORT_RESPONSE_RETRIES = 2


async def invoke_complete(chain: Runnable, inputs: dict, label: str, clean=None) -> str:
    """Invoke ``chain``; if the cleaned reply is suspiciously short, try again.

    Retries at most ``MAX_SHORT_RESPONSE_RETRIES`` times, then keeps the last
    reply. ``clean`` post-processes the raw text (default: strip_thinking).
    """
    clean = clean or strip_thinking
    for attempt in range(MAX_SHORT_RESPONSE_RETRIES + 1):
        response = clean(await chain.ainvoke(inputs))
        if len(response.strip()) >= MIN_RESPONSE_CHARS:
            return response
        logger.warning(
            f"Short {label} ({len(response.strip())} chars) on attempt {attempt + 1}"
        )
    return response


class LLMGenerationError(RuntimeError):
    """The model (primary and fallback) failed to produce a response."""


# ---------------------------------------------------------------------------
# Task → config attribute mapping
# ---------------------------------------------------------------------------
_TASK_MODEL_MAP: dict[str, tuple[str, str, str, str]] = {
    "drafter": (
        "drafter_model",
        "drafter_provider",
        "drafter_fallback_model",
        "drafter_fallback_provider",
    ),
    "lawyer": (
        "lawyer_model",
        "lawyer_provider",
        "lawyer_fallback_model",
        "lawyer_fallback_provider",
    ),
    "judge": (
        "judge_model",
        "judge_provider",
        "judge_fallback_model",
        "judge_fallback_provider",
    ),
    "analyzer": (
        "analyzer_model",
        "analyzer_provider",
        "analyzer_fallback_model",
        "analyzer_fallback_provider",
    ),
    "party": (
        "party_model",
        "party_provider",
        "party_fallback_model",
        "party_fallback_provider",
    ),
    "witness": (
        "witness_model",
        "witness_provider",
        "witness_fallback_model",
        "witness_fallback_provider",
    ),
}


def _create_llm_instance(provider: str, model_id: str) -> BaseChatModel:
    if provider == "groq":
        return ChatGroq(
            model=model_id,
            api_key=settings.groq_api_key or "not_set",
            temperature=0.7,
        )
    elif provider == "openrouter":
        ChatOpenAI = import_module("langchain_openai").ChatOpenAI
        return ChatOpenAI(
            model=model_id,
            api_key=settings.openrouter_api_key or "not_set",
            base_url="https://openrouter.ai/api/v1",
            temperature=0.7,
            extra_body={"reasoning": {"enabled": True}},
        )
    else:
        raise ValueError(f"Unknown LLM provider '{provider}'.")


@cache
def get_llm(task: str) -> Runnable:
    config_attrs = _TASK_MODEL_MAP.get(task)
    if config_attrs is None:
        raise ValueError(
            f"Unknown LLM task '{task}'. "
            f"Valid tasks: {', '.join(sorted(_TASK_MODEL_MAP))}"
        )

    model_attr, provider_attr, fallback_model_attr, fallback_provider_attr = (
        config_attrs
    )

    primary_model_id: str = getattr(settings, model_attr)
    primary_provider: str = getattr(settings, provider_attr)
    fallback_model_id: str = getattr(settings, fallback_model_attr)
    fallback_provider: str = getattr(settings, fallback_provider_attr)

    primary_llm = _create_llm_instance(primary_provider, primary_model_id)
    fallback_llm = _create_llm_instance(fallback_provider, fallback_model_id)

    return primary_llm.with_fallbacks([fallback_llm])
