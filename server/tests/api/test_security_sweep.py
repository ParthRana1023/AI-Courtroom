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
