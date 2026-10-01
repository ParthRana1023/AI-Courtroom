"""Developer mode: responses tell allowlisted users which LLM answered."""

import json

import pytest

from app.config import settings
from app.models.case import ArgumentItem, Roles
from app.utils.llm_trace import LLM_TRACE_HEADER


@pytest.fixture
def developer(monkeypatch, user):
    monkeypatch.setattr(settings, "dev_mode_emails", f" {user.email.upper()} ,x@y.z")
    return user


async def analysable_case(user, make_case):
    return await make_case(
        user,
        user_role=Roles.PLAINTIFF,
        plaintiff_arguments=[
            ArgumentItem(
                type="user", content="My point", role=Roles.PLAINTIFF, user_id=user.id
            )
        ],
    )


async def test_developer_sees_which_model_answered(
    client, auth_headers, developer, make_case
):
    case = await analysable_case(developer, make_case)

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    calls = json.loads(response.headers[LLM_TRACE_HEADER])
    assert calls == [
        {
            "task": "analyzer",
            "provider": settings.analyzer_provider,
            "model": settings.analyzer_model,
            "attempt": 0,
            "ms": calls[0]["ms"],
        }
    ]


async def test_fallback_attempt_is_reported(
    client, auth_headers, developer, make_case, fake_llm
):
    attempts = []

    def flaky(prompt):
        attempts.append(prompt)
        if len(attempts) == 1:
            raise RuntimeError("primary down")
        return "### Outcome\nAnalysis from the fallback."

    fake_llm.responder = flaky
    case = await analysable_case(developer, make_case)

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    (call,) = json.loads(response.headers[LLM_TRACE_HEADER])
    assert (call["attempt"], call["model"]) == (1, settings.analyzer_fallback_model)


async def test_other_users_do_not_get_the_header(client, auth_headers, make_case, user):
    case = await analysable_case(user, make_case)

    response = await client.post(
        f"/cases/{case.cnr}/analyze-case", headers=auth_headers
    )

    assert response.status_code == 200
    assert LLM_TRACE_HEADER not in response.headers


async def test_no_header_when_no_model_ran(client, auth_headers, developer):
    response = await client.get("/auth/profile", headers=auth_headers)

    assert LLM_TRACE_HEADER not in response.headers


async def test_profile_says_whether_user_is_developer(
    client, auth_headers, make_user, make_auth_headers, developer
):
    other = await make_user()

    me = (await client.get("/auth/profile", headers=auth_headers)).json()
    them = (await client.get("/auth/profile", headers=make_auth_headers(other))).json()

    assert (me["is_developer"], them["is_developer"]) == (True, False)
