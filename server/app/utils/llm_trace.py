"""Per-request record of which LLM answered, for developer mode.

The request middleware starts a trace, get_llm's listeners add each model that
answers, and get_current_user marks the request as a developer's. Developers
get the calls back in the X-LLM-Models response header.
"""

import json
from contextvars import ContextVar
from dataclasses import dataclass, field

from app.config import settings

LLM_TRACE_HEADER = "X-LLM-Models"


@dataclass
class LLMTrace:
    calls: list[dict] = field(default_factory=list)
    developer: bool = False

    def header_value(self) -> str | None:
        """JSON list of calls, or None when this response should not carry it."""
        if not (self.developer and self.calls):
            return None
        return json.dumps(self.calls, separators=(",", ":"))


# Holds a mutable LLMTrace, so writes from the route's (copied) context are
# still visible to the middleware that created it.
_trace: ContextVar[LLMTrace | None] = ContextVar("llm_trace", default=None)


def start_trace() -> LLMTrace:
    trace = LLMTrace()
    _trace.set(trace)
    return trace


def record_llm_call(task: str, provider: str, model: str, attempt: int, ms: int):
    trace = _trace.get()
    if trace is not None:
        trace.calls.append(
            {
                "task": task,
                "provider": provider,
                "model": model,
                "attempt": attempt,  # 0 = primary, 1 = fallback, 2 = fallback2
                "ms": ms,
            }
        )


def is_developer(email: str | None) -> bool:
    """Phone accounts have no email, so they are never developers."""
    return bool(email) and email.lower() in settings.dev_mode_email_set


def mark_developer_request(email: str | None) -> None:
    trace = _trace.get()
    if trace is not None and is_developer(email):
        trace.developer = True
