# app/services/health.py
"""Recent successes and failures per status-page component, read by GET /status."""

import time
from collections import deque

WINDOW_SECONDS = 15 * 60

# ponytail: kept in this process's memory, so it resets on restart and only sees this
# instance's calls. Fine on one Render instance; move it to Mongo if the API scales out.
_events: dict[str, deque[tuple[float, bool]]] = {}


def record(component: str, ok: bool) -> None:
    _events.setdefault(component, deque(maxlen=50)).append((time.monotonic(), ok))


def state(component: str) -> str:
    """Outage when the last three calls in the window all failed, degraded after two
    failures in the window, else ok."""
    now = time.monotonic()
    recent = [ok for at, ok in _events.get(component, ()) if now - at < WINDOW_SECONDS]
    if len(recent) >= 3 and not any(recent[-3:]):
        return "outage"
    if recent.count(False) >= 2:
        return "degraded"
    return "ok"


def reset() -> None:
    _events.clear()
