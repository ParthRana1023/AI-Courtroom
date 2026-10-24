"""Security sweep: every case route refuses a signed-in user who doesn't own the
case (OWASP API1:2023, broken object-level authorization), and changes nothing.

Each route is called by a second account with a body that passes validation,
so a refusal comes from the ownership check and not from a 422.
"""

import pytest

from app.main import app
from app.models.case import Case
from tests.helpers import reload

BODY = {
    "argument": "My Lord, the deposit was paid.",
    "statement": "My Lord, I close.",
    "message": "Did you pay?",
    "status": "adjourned",
    "user_role": "plaintiff",
    "ai_role": "defendant",
    "question": "Where were you?",
    "witness_id": "w1",
    "party_id": "p1",
    "message_id": "m1",
    "role": "plaintiff",
    "target_id": "t1",
    "on": True,
    "submission": "My Lord, the accused has paid in full.",
    "entry_id": "verdict",
    "reason": "law",
    "details": "",
    "kind": "argument",
    "grounds": "Irrelevant",
    "accept": True,
    "terms": {"amount": 1000, "instalments": 1, "months": 3, "interest": 0},
    "action": "pay",
    "side": "plaintiff",
}


def case_routes():
    """(method, path) of every route under /cases/{cnr}, from the app itself, so
    a route added later is swept too."""
    found = []

    def walk(routes, prefix=""):
        for route in routes:
            if hasattr(route, "original_router"):
                context = route.include_context
                extra = (
                    context.get("prefix", "")
                    if isinstance(context, dict)
                    else getattr(context, "prefix", "")
                )
                walk(route.original_router.routes, prefix + (extra or ""))
            elif hasattr(route, "methods") and route.path:
                path = prefix + route.path
                if path.startswith("/cases/{") and "/deleted/" not in path:
                    found.extend((m, path) for m in route.methods if m != "HEAD")

    walk(app.routes)
    return sorted(found)


ROUTES = case_routes()


def fill(path: str, cnr: str) -> str:
    for name in ("{cnr}", "{case_cnr}", "{caseId}", "{case_identifier}"):
        path = path.replace(name, cnr)
    return (
        path.replace("{party_id}", "p1")
        .replace("{evidence_id}", "e1")
        .replace("{index}", "0")
    )


def test_the_sweep_finds_the_case_routes():
    assert len(ROUTES) > 40


@pytest.mark.parametrize("method, path", ROUTES)
async def test_another_user_cant_touch_the_case(
    client, user, make_user, make_case, make_auth_headers, fake_llm, method, path
):
    fake_llm.responses.extend(["x"] * 5)
    case = await make_case(user, user_role="plaintiff", ai_role="defendant")
    before = (await reload(case)).model_dump(exclude={"revision_id"})
    intruder = make_auth_headers(await make_user())

    response = await client.request(
        method,
        fill(path, case.cnr),
        headers=intruder,
        json=None if method in ("GET", "DELETE") else BODY,
    )

    assert response.status_code in (403, 404), response.text
    after = await Case.find_one(Case.cnr == case.cnr)
    assert after is not None and after.model_dump(exclude={"revision_id"}) == before


# ---------------------------------------------------------------------------
# API4:2023 unrestricted resource consumption: codes sent by email
# ---------------------------------------------------------------------------


def registration(email: str) -> dict:
    return {
        "first_name": "Asha",
        "last_name": "Verma",
        "email": email,
        "password": "Password123!",
        "confirm_adult": True,
    }


async def test_one_client_cant_send_codes_to_any_number_of_addresses(client, outbox):
    codes = [
        (
            await client.post(
                "/auth/register/initiate", json=registration(f"victim{i}@example.com")
            )
        ).status_code
        for i in range(25)
    ]

    assert 429 in codes, "every address was sent a code"
    assert len(outbox) < 25


# ---------------------------------------------------------------------------
# A07:2025 authentication failures: session ends on sign-out
# ---------------------------------------------------------------------------


async def test_a_signed_out_token_no_longer_works(client, user):
    from app.services.auth import issue_token

    headers = {"Authorization": f"Bearer {await issue_token(user, remember_me=True)}"}
    assert (await client.get("/auth/profile", headers=headers)).status_code == 200

    assert (await client.post("/auth/logout", headers=headers)).status_code == 200

    assert (await client.get("/auth/profile", headers=headers)).status_code == 401


# ---------------------------------------------------------------------------
# API4:2023: an upload is never read whole into memory
# ---------------------------------------------------------------------------


async def test_an_oversized_photo_is_refused_without_reading_it_all(
    client, auth_headers, monkeypatch
):
    from starlette.datastructures import UploadFile

    read = []
    real_read = UploadFile.read

    async def counting_read(self, size=-1):
        data = await real_read(self, size)
        read.append(len(data))
        return data

    monkeypatch.setattr(UploadFile, "read", counting_read)
    huge = b"\x89PNG" + b"0" * (12 * 1024 * 1024)

    response = await client.post(
        "/auth/profile/photo",
        headers=auth_headers,
        files={"file": ("a.png", huge, "image/png")},
    )

    assert response.status_code == 400
    assert sum(read) <= 5 * 1024 * 1024 + 1  # not the 12 MB sent


# ---------------------------------------------------------------------------
# API3:2023 excessive data exposure: what the simulation draws by stays hidden
# ---------------------------------------------------------------------------


def hidden_keys(value, found=None):
    """Every key in a response that should never reach a user."""
    found = set() if found is None else found
    if isinstance(value, dict):
        for key, inner in value.items():
            if key in ("plan", "defaults_on") or (
                key == "reliability" and inner is not None
            ):
                found.add(key)
            hidden_keys(inner, found)
    elif isinstance(value, list):
        for inner in value:
            hidden_keys(inner, found)
    return found


@pytest.mark.parametrize(
    "path",
    [
        "/cases",
        "/cases/{cnr}",
        "/cases/{cnr}/history",
        "/cases/{cnr}/parties",
        "/cases/{cnr}/parties/p1",
        "/cases/{cnr}/parties/p1/chat-history",
        "/cases/{cnr}/settlement",
        "/cases/{cnr}/witness/current",
        "/cases/{cnr}/evidence",
    ],
)
async def test_reads_never_show_reliability_or_the_draws(
    client, user, auth_headers, make_case, path
):
    from app.models.case import PaymentPlan, Settlement
    from app.models.party import PartyInvolved, PartyRole
    from tests.api.test_settlement_routes import PROFILE

    case = await make_case(
        user,
        user_role="plaintiff",
        ai_role="defendant",
        settlement_profile=PROFILE,
        parties_involved=[
            PartyInvolved(
                id="p1", name="Ravi", role=PartyRole.APPLICANT, reliability=0.137
            )
        ],
        settlements=[
            Settlement(
                defaults_on=None,
                plan=PaymentPlan(reliability=0.137, draws=[], complies=True),
            )
        ],
    )

    response = await client.get(path.replace("{cnr}", case.cnr), headers=auth_headers)

    assert response.status_code < 500, response.text
    if response.status_code == 200:
        assert not hidden_keys(response.json()), path
        assert "0.137" not in response.text, path


# ---------------------------------------------------------------------------
# API6:2023 sensitive business flows: a daily AI limit holds under parallel use
# ---------------------------------------------------------------------------


async def test_parallel_arguments_cant_pass_the_daily_limit(
    client, auth_headers, courtroom_case, fake_llm, monkeypatch
):
    import asyncio

    from app.utils.rate_limiter import argument_rate_limiter

    monkeypatch.setattr(argument_rate_limiter, "requests", 2)
    fake_llm.responses.extend(["My Lord, the AI side says so."] * 30)
    cases = [await courtroom_case("defendant", status="not started") for _ in range(6)]

    responses = await asyncio.gather(
        *(
            client.post(
                f"/cases/{case.cnr}/arguments",
                headers=auth_headers,
                json={"role": "defendant", "argument": "We deny it"},
            )
            for case in cases
        )
    )

    codes = [r.status_code for r in responses]
    assert codes.count(200) == 2 and codes.count(429) == 4, codes


async def test_parallel_party_chats_cant_pass_the_limit(
    client, auth_headers, courtroom_case, witness_party, fake_llm, monkeypatch
):
    import asyncio

    from app.utils.rate_limiter import party_chat_rate_limiter

    monkeypatch.setattr(party_chat_rate_limiter, "requests", 2)
    fake_llm.responses.extend(["I paid on the first of every month."] * 30)
    cases = [await courtroom_case(status="not started") for _ in range(5)]

    responses = await asyncio.gather(
        *(
            client.post(
                f"/cases/{case.cnr}/parties/{witness_party.id}/chat",
                headers=auth_headers,
                json={"message": "When did you pay?"},
            )
            for case in cases
        )
    )

    codes = [r.status_code for r in responses]
    assert codes.count(200) == 2 and codes.count(429) == 3, codes
