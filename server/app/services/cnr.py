"""CNR (Case Number Record) numbers in the eCourts format.

16 characters: state code (2 letters) + district / court-complex code (2) +
establishment code (2 digits) + filing sequence number (6 digits, restarts
every 1 January) + filing year (4 digits). Example: MHPU01 000042 2026.
"""

import random

from pymongo import ReturnDocument

from app.models.case import Case
from app.models.cnr_counter import CnrCounter
from app.utils.datetime import get_current_datetime

# eCourts codes that differ from the ISO 3166-2 codes used elsewhere in the app.
ECOURTS_STATE_CODES = {"CT": "CG", "OR": "OD", "TG": "TS"}


def district_code(city: str | None) -> str:
    """Two letters from the city name (e.g. Pune -> PU), as eCourts codes read."""
    letters = "".join(c for c in (city or "") if c.isalpha()).upper()
    if len(letters) >= 2:
        return letters[:2]
    return (letters + "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=2)))[:2]


async def next_filing_number(prefix: str, year: int) -> int:
    """Next sequence number for this establishment and year, issued atomically."""
    counter = await CnrCounter.get_pymongo_collection().find_one_and_update(
        {"key": f"{prefix}-{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    assert counter is not None  # upsert + AFTER always returns the document
    return counter["seq"]


async def generate_cnr(state_iso2: str, city: str | None) -> str:
    state = ECOURTS_STATE_CODES.get(state_iso2, state_iso2)
    establishment = f"{random.randint(1, 20):02d}"
    prefix = f"{state}{district_code(city)}{establishment}"
    year = get_current_datetime().year
    while True:
        cnr = f"{prefix}{await next_filing_number(prefix, year):06d}{year}"
        # Cases made before sequential numbering used random numbers; skip any taken.
        if not await Case.find_one(Case.cnr == cnr):
            return cnr
