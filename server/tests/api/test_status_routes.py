"""GET /status (service health and incidents) and posting incidents as support."""

from datetime import timedelta

import pytest

from app.config import settings
from app.models.incident import Incident, IncidentUpdate
from app.services import health
from app.utils.datetime import get_current_datetime
from tests.helpers import boom


@pytest.fixture(autouse=True)
def fresh_health():
    health.reset()
    yield
    health.reset()


def states(body: dict) -> dict:
    return {c["id"]: c["status"] for c in body["components"]}


async def test_all_services_operational(client):
    response = await client.get("/status")

    body = response.json()
    assert response.status_code == 200
    assert [c["id"] for c in body["components"]] == [
        "web",
        "auth",
        "gen",
        "court",
        "analysis",
        "db",
    ]
    assert set(states(body).values()) == {"ok"}
    assert body["incidents"] == []


async def test_recent_failures_degrade_then_take_a_service_down(client):
    health.record("gen", ok=False)
    health.record("gen", ok=True)
    health.record("gen", ok=False)
    for _ in range(3):
        health.record("court", ok=False)
    health.record("auth", ok=False)  # one failure is noise

    body = (await client.get("/status")).json()

    assert states(body) == {
        "web": "ok",
        "auth": "ok",
        "gen": "degraded",
        "court": "outage",
        "analysis": "ok",
        "db": "ok",
    }


async def test_failed_case_generation_is_counted(client, fake_llm, auth_headers):
    fake_llm.error = RuntimeError("provider down")
    for _ in range(3):
        await client.post(
            "/cases/generate",
            headers=auth_headers,
            json={"sections_involved": 1, "section_numbers": [303]},
        )

    assert health.state("gen") == "outage"


async def test_a_task_without_any_provider_key_is_down(client, monkeypatch):
    for key in ("groq_api_key", "openrouter_api_key", "cloudflare_api_token"):
        monkeypatch.setattr(settings, key, None)

    body = (await client.get("/status")).json()

    assert {c: s for c, s in states(body).items() if s != "ok"} == {
        "gen": "outage",
        "court": "outage",
        "analysis": "outage",
    }


async def test_an_unreachable_database_takes_everything_down(client, monkeypatch):
    monkeypatch.setattr(Incident, "find_one", boom)

    body = (await client.get("/status")).json()

    assert states(body)["web"] == "degraded"
    assert {s for c, s in states(body).items() if c != "web"} == {"outage"}


async def test_incidents_are_listed_and_open_ones_mark_services(client):
    now = get_current_datetime()
    await Incident(
        title="Courtroom AI is unavailable",
        impact="outage",
        components=["court"],
        updates=[
            IncidentUpdate(
                at=now - timedelta(minutes=30), kind="Investigating", text="A"
            ),
            IncidentUpdate(at=now, kind="Identified", text="B"),
        ],
    ).insert()
    await Incident(
        title="Slow drafting",
        impact="degraded",
        components=["gen"],
        updates=[IncidentUpdate(kind="Resolved", text="Fixed.")],
        created_at=now - timedelta(days=2),
        resolved_at=now - timedelta(days=1),
    ).insert()
    await Incident(
        title="Long ago",
        impact="outage",
        updates=[IncidentUpdate(kind="Resolved", text="Old.")],
        created_at=now - timedelta(days=120),
        resolved_at=now - timedelta(days=119),
    ).insert()

    body = (await client.get("/status")).json()

    assert states(body)["court"] == "outage"
    assert states(body)["gen"] == "ok"  # resolved
    [open_one, resolved] = body["incidents"]
    assert (open_one["title"], open_one["status"], open_one["resolved"]) == (
        "Courtroom AI is unavailable",
        "Identified",
        False,
    )
    assert [u["text"] for u in open_one["updates"]] == ["B", "A"]  # newest first
    assert open_one["updates"][0]["at"].endswith("+00:00")  # never naive
    assert (resolved["title"], resolved["resolved"]) == ("Slow drafting", True)


async def test_support_posts_and_resolves_incidents(
    client, make_user, make_auth_headers, monkeypatch
):
    dev, other = await make_user(), await make_user()
    monkeypatch.setattr(settings, "dev_mode_emails", dev.email)
    headers = make_auth_headers(dev)
    body = {
        "title": "Case generation is slower than usual",
        "impact": "degraded",
        "components": ["gen"],
        "text": "Some new cases take minutes to draft.",
    }

    stranger = await client.post(
        "/admin/incidents", headers=make_auth_headers(other), json=body
    )
    unknown = await client.post(
        "/admin/incidents", headers=headers, json={**body, "components": ["moon"]}
    )
    posted = await client.post("/admin/incidents", headers=headers, json=body)
    incident_id = posted.json()["id"]
    during = states((await client.get("/status")).json())["gen"]
    resolved = await client.post(
        f"/admin/incidents/{incident_id}/updates",
        headers=headers,
        json={"kind": "Resolved", "text": "Drafting is back to normal."},
    )
    missing = await client.post(
        "/admin/incidents/nope/updates", headers=headers, json={"text": "x"}
    )
    after = (await client.get("/status")).json()

    assert stranger.status_code == 404
    assert unknown.status_code == 422
    assert posted.status_code == 201
    assert during == "degraded"
    assert resolved.json() == {"id": incident_id, "resolved": True}
    assert missing.status_code == 404
    assert states(after)["gen"] == "ok"
    assert after["incidents"][0]["status"] == "Resolved"
    assert [u["kind"] for u in after["incidents"][0]["updates"]] == [
        "Resolved",
        "Investigating",
    ]


async def test_restoring_an_account_emails_its_owner(
    client, make_user, make_auth_headers, monkeypatch, outbox
):
    dev = await make_user()
    monkeypatch.setattr(settings, "dev_mode_emails", dev.email)
    gone = await make_user(deleted_at=get_current_datetime() - timedelta(days=3))

    await client.post(
        f"/admin/accounts/{gone.id}/restore", headers=make_auth_headers(dev)
    )

    assert [m["to"] for m in outbox if "Your account is back" in m["subject"]] == [
        gone.email
    ]
