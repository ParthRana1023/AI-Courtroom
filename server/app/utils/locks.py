"""Per-case locks, so writes to one case (arguments, witness actions, take-over,
adjournment) happen one at a time instead of overwriting each other."""

import asyncio
from collections import defaultdict

# ponytail: in-process locks; correct with the single uvicorn worker the
# Dockerfile runs. Scaling to several workers needs a database or Redis lock.
_case_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def case_lock(cnr: str) -> asyncio.Lock:
    return _case_locks[cnr]
