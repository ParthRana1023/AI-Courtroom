# app/utils/llm.py
"""
LLM factory for the AI Courtroom.

Each courtroom task is served by a dedicated model.
The factory returns a LangChain ChatModel wrapper so that the rest of the 
codebase can keep using ``chain.invoke()`` / ``chain.ainvoke()`` unchanged.
"""

from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from app.config import settings

# ---------------------------------------------------------------------------
# Task → config attribute mapping
# ---------------------------------------------------------------------------
_TASK_MODEL_MAP: dict[str, tuple[str, str, str, str]] = {
    "drafter": ("drafter_model", "drafter_provider", "drafter_fallback_model", "drafter_fallback_provider"),
    "lawyer": ("lawyer_model", "lawyer_provider", "lawyer_fallback_model", "lawyer_fallback_provider"),
    "judge": ("judge_model", "judge_provider", "judge_fallback_model", "judge_fallback_provider"),
    "analyzer": ("analyzer_model", "analyzer_provider", "analyzer_fallback_model", "analyzer_fallback_provider"),
    "party": ("party_model", "party_provider", "party_fallback_model", "party_fallback_provider"),
    "witness": ("witness_model", "witness_provider", "witness_fallback_model", "witness_fallback_provider"),
}

def _create_llm_instance(provider: str, model_id: str) -> BaseChatModel:
    if provider == "groq":
        return ChatGroq(
            model=model_id,
            api_key=settings.groq_api_key or "not_set",
            temperature=0.7,
        )
    elif provider == "openrouter":
        return ChatOpenAI(
            model=model_id,
            api_key=settings.openrouter_api_key or "not_set",
            base_url="https://openrouter.ai/api/v1",
            temperature=0.7,
            extra_body={
                "reasoning": {"enabled": True}
            },
        )
    else:
        raise ValueError(f"Unknown LLM provider '{provider}'.")


@lru_cache(maxsize=None)
def get_llm(task: str) -> Runnable:
    config_attrs = _TASK_MODEL_MAP.get(task)
    if config_attrs is None:
        raise ValueError(
            f"Unknown LLM task '{task}'. "
            f"Valid tasks: {', '.join(sorted(_TASK_MODEL_MAP))}"
        )

    model_attr, provider_attr, fallback_model_attr, fallback_provider_attr = config_attrs
    
    primary_model_id: str = getattr(settings, model_attr)
    primary_provider: str = getattr(settings, provider_attr)
    fallback_model_id: str = getattr(settings, fallback_model_attr)
    fallback_provider: str = getattr(settings, fallback_provider_attr)

    primary_llm = _create_llm_instance(primary_provider, primary_model_id)
    fallback_llm = _create_llm_instance(fallback_provider, fallback_model_id)

    return primary_llm.with_fallbacks([fallback_llm])
