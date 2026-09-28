from typing import Annotated

from beanie import Document, Indexed


class CnrCounter(Document):
    """Last filing sequence number issued per court establishment and year.

    ``key`` is the first six CNR characters plus the year, e.g. "MHPU01-2026".
    """

    key: Annotated[str, Indexed(unique=True)]
    seq: int = 0

    class Settings:
        name = "cnr_counters"
