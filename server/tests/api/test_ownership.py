"""Every case-scoped route answers 404 for an unknown case and 403 for someone else's."""

import pytest

CASE_ROUTES = [
    # cases
    ("GET", "/cases/{cnr}", None),
    ("PUT", "/cases/{cnr}/status", {"status": "active"}),
    ("PUT", "/cases/{cnr}/roles", {"user_role": "plaintiff"}),
    ("POST", "/cases/{cnr}/generate-plaintiff-opening", None),
    ("DELETE", "/cases/{cnr}", None),
    ("POST", "/cases/{cnr}/analyze-case", None),
    # arguments
    ("POST", "/cases/{cnr}/arguments", {"role": "plaintiff", "argument": "x"}),
    ("POST", "/cases/{cnr}/closing-statement", {"role": "plaintiff", "statement": "x"}),
    # parties
    ("GET", "/cases/{cnr}/parties", None),
    ("GET", "/cases/{cnr}/parties/p1", None),
    ("GET", "/cases/{cnr}/parties/p1/chat-history", None),
    ("POST", "/cases/{cnr}/parties/p1/chat", {"message": "hi"}),
    # evidence
    ("GET", "/cases/{cnr}/evidence", None),
    ("POST", "/cases/{cnr}/evidence/extract", {"event_id": "x"}),
    ("POST", "/cases/{cnr}/evidence/images/generate-missing", None),
    ("POST", "/cases/{cnr}/evidence/e1/image/regenerate", None),
    # witness
    ("GET", "/cases/{cnr}/witness/available", None),
    ("POST", "/cases/{cnr}/witness/call", {"witness_id": "x"}),
    ("POST", "/cases/{cnr}/witness/examine", {"question": "Q?"}),
    ("POST", "/cases/{cnr}/witness/ai-cross-examine", None),
    ("POST", "/cases/{cnr}/witness/conclude", None),
    ("POST", "/cases/{cnr}/witness/dismiss", None),
    ("GET", "/cases/{cnr}/witness/current", None),
    ("GET", "/cases/{cnr}/witness/testimonies", None),
    ("POST", "/cases/{cnr}/witness/ai-call", None),
]


@pytest.mark.parametrize(
    "method, path, body", CASE_ROUTES, ids=[f"{m} {p}" for m, p, _ in CASE_ROUTES]
)
async def test_case_routes_check_existence_and_ownership(
    client, auth_headers, make_user, make_case, method, path, body
):
    foreign = await make_case(await make_user())
    kwargs = {"headers": auth_headers, **({"json": body} if body else {})}

    missing = await client.request(
        method, path.format(cnr="NOPE000000000000"), **kwargs
    )
    forbidden = await client.request(method, path.format(cnr=foreign.cnr), **kwargs)

    assert (missing.status_code, forbidden.status_code) == (404, 403)
