"""Fixtures shared by the API route tests."""

import pytest

from app.models.case import CaseStatus, Roles
from app.models.party import PartyInvolved, PartyRole


@pytest.fixture
def witness_party():
    return PartyInvolved(
        name="Ravi Kumar",
        role=PartyRole.APPLICANT,
        occupation="Tenant",
        bio="Paid the deposit in cash.",
    )


@pytest.fixture
def other_party():
    return PartyInvolved(
        name="Asha Rao", role=PartyRole.NON_APPLICANT, bio="Landlord of the flat."
    )


@pytest.fixture
def courtroom_case(user, make_case, witness_party, other_party):
    """A case ready for the courtroom: roles chosen, parties extracted, session active."""

    async def _make(side: str = "plaintiff", **overrides):
        ai_role = "defendant" if side == "plaintiff" else "plaintiff"
        data = {
            "user_role": Roles(side),
            "ai_role": Roles(ai_role),
            "status": CaseStatus.ACTIVE,
            "parties_involved": [witness_party, other_party],
        }
        data.update(overrides)
        return await make_case(user, **data)

    return _make
