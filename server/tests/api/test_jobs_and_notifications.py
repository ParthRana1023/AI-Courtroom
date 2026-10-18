"""Slice 10 endpoints: POST /admin/jobs/daily (scheduler token), POST
/admin/announcements (developers), /notifications/unsubscribe (signed token),
and Cloudflare Turnstile on guest Contact messages."""

import httpx
import pytest

from app.config import settings
from app.models.announcement import Announcement
from app.models.job_run import JobRun
from app.models.user import User
from app.services import daily_jobs, turnstile
from app.services.google_auth import create_google_signup_token
from app.services.notifications import read_unsubscribe_token, unsubscribe_token
from app.utils.datetime import get_current_datetime
from tests.helpers import boom, reload

TOKEN = "jobs-secret"


@pytest.fixture
def jobs_token(monkeypatch):
    monkeypatch.setattr(settings, "jobs_token", TOKEN)
    return {"Authorization": f"Bearer {TOKEN}"}


# ---------------------------------------------------------------------------
# POST /admin/jobs/daily
# ---------------------------------------------------------------------------


async def test_jobs_endpoint_is_hidden_without_a_configured_token(client):
    response = await client.post(
        "/admin/jobs/daily", headers={"Authorization": "Bearer x"}
    )
    assert response.status_code == 404


async def test_jobs_endpoint_rejects_a_wrong_token(client, jobs_token):
    response = await client.post(
        "/admin/jobs/daily", headers={"Authorization": "Bearer nope"}
    )
    assert response.status_code == 401


async def test_jobs_endpoint_runs_the_jobs(client, jobs_token):
    response = await client.post("/admin/jobs/daily?dry_run=true", headers=jobs_token)

    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    assert {"purge_due", "reminders_due", "announcements_pending"} <= set(
        body["counts"]
    )
    run = await JobRun.find_one()
    assert run is not None and run.dry_run and run.trigger == "http"


async def test_jobs_endpoint_reports_a_held_lock(client, jobs_token):
    await daily_jobs._acquire_lock(get_current_datetime())

    response = await client.post("/admin/jobs/daily", headers=jobs_token)

    assert response.status_code == 409


async def test_jobs_endpoint_fails_loudly_when_a_step_fails(
    client, jobs_token, monkeypatch
):
    monkeypatch.setattr(daily_jobs, "STEPS", (("purge", boom),))

    response = await client.post("/admin/jobs/daily", headers=jobs_token)

    assert response.status_code == 500
    assert response.json()["errors"] == ["purge: RuntimeError"]


# ---------------------------------------------------------------------------
# POST /admin/announcements
# ---------------------------------------------------------------------------


ANNOUNCEMENT = {
    "subject": "Objections are here",
    "body": "You can now object in court.\n\nTry it in your next hearing.",
}


async def test_only_developers_can_announce(client, auth_headers):
    response = await client.post(
        "/admin/announcements", json=ANNOUNCEMENT, headers=auth_headers
    )
    assert response.status_code == 404


async def test_announcement_is_saved_and_the_first_batch_sent(
    client, user, make_user, make_auth_headers, monkeypatch, outbox
):
    monkeypatch.setattr(settings, "dev_mode_emails", user.email)
    reader = await make_user(notification_prefs={"product_updates": True})
    await make_user()  # not opted in

    response = await client.post(
        "/admin/announcements",
        json={**ANNOUNCEMENT, "body": "<script>x</script> hello there"},
        headers=make_auth_headers(user),
    )

    assert response.status_code == 201
    announcement = await Announcement.find_one()
    assert announcement is not None and announcement.finished_at is not None
    assert "&lt;script&gt;" in announcement.body_html
    assert [m["to"] for m in outbox] == [reader.email]
    assert outbox[0]["subject"] == "Objections are here - AI Courtroom"


async def test_announcement_input_is_validated(client, user, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "dev_mode_emails", user.email)
    response = await client.post(
        "/admin/announcements",
        json={"subject": "Hi", "body": "x"},
        headers=auth_headers,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# unsubscribe
# ---------------------------------------------------------------------------


async def test_unsubscribe_turns_one_email_off(client, make_user):
    user = await make_user(notification_prefs={"product_updates": True})
    token = unsubscribe_token(user, "product_updates")

    status = await client.get(f"/notifications/unsubscribe?token={token}")
    assert status.json() == {
        "kind": "product_updates",
        "label": "Product updates",
        "subscribed": True,
    }

    # What a mail app's one-click button sends (RFC 8058).
    done = await client.post(
        f"/notifications/unsubscribe?token={token}",
        content="List-Unsubscribe=One-Click",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert done.status_code == 200 and done.json()["subscribed"] is False
    prefs = (await reload(user)).notification_prefs
    assert prefs.product_updates is False
    assert prefs.case_ready is True and prefs.hearing_reminders is True  # untouched

    again = await client.post(f"/notifications/unsubscribe?token={token}")
    assert again.status_code == 200


@pytest.mark.parametrize(
    "token",
    [
        "not-a-token",
        create_google_signup_token(
            "g-1", "a@example.com"
        ),  # signed by us, wrong purpose
    ],
)
async def test_unsubscribe_rejects_bad_tokens(client, token):
    response = await client.post(f"/notifications/unsubscribe?token={token}")
    assert response.status_code == 400
    assert "invalid or has expired" in response.json()["detail"]


async def test_unsubscribe_for_an_erased_account_still_succeeds(client, make_user):
    user = await make_user()
    token = unsubscribe_token(user, "hearing_reminders")
    await user.delete()

    response = await client.post(f"/notifications/unsubscribe?token={token}")
    assert response.status_code == 200


def test_unsubscribe_token_round_trip(user):
    assert read_unsubscribe_token(unsubscribe_token(user, "case_ready")) == (
        str(user.id),
        "case_ready",
    )


# ---------------------------------------------------------------------------
# Turnstile on guest Contact messages
# ---------------------------------------------------------------------------

GUEST = {
    "feedback_category": "general",
    "message": "Hello from a guest sender.",
    "name": "Guest",
    "email": "guest@example.com",
}


@pytest.fixture
def turnstile_on(monkeypatch, mock_http):
    """Turnstile configured, with Cloudflare answering through ``answer``."""
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    monkeypatch.setattr(settings, "frontend_url", "https://ai-courtroom.vercel.app")
    monkeypatch.setattr(settings, "turnstile_hostnames", "")
    seen: list[str] = []

    def install(answer):
        def handler(request: httpx.Request):
            seen.append(request.content.decode())
            return answer(request)

        mock_http(turnstile, handler)

    return install, seen


async def test_guest_needs_a_turnstile_token(client, turnstile_on):
    install, seen = turnstile_on
    install(lambda r: httpx.Response(200, json={"success": True}))

    response = await client.post("/feedback/submit", json=GUEST)

    assert response.status_code == 403
    assert seen == []  # no token, so Cloudflare isn't even asked


# What Cloudflare returns for a token from our Contact page.
PASSED = {"success": True, "action": "contact", "hostname": "ai-courtroom.vercel.app"}


async def test_guest_with_a_good_token_is_accepted(client, turnstile_on):
    install, seen = turnstile_on
    install(lambda r: httpx.Response(200, json=PASSED))

    response = await client.post(
        "/feedback/submit", json={**GUEST, "turnstile_token": "tok-1"}
    )

    assert response.status_code == 201
    assert "response=tok-1" in seen[0] and "secret=secret" in seen[0]


async def test_guest_with_a_rejected_token_is_refused(client, turnstile_on):
    install, _ = turnstile_on
    install(
        lambda r: httpx.Response(
            200, json={"success": False, "error-codes": ["invalid-input-response"]}
        )
    )

    response = await client.post(
        "/feedback/submit", json={**GUEST, "turnstile_token": "used"}
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    "reply",
    [
        {**PASSED, "action": "signup"},  # minted for another form
        {**PASSED, "hostname": "evil.example.com"},  # minted on another site
        {**PASSED, "hostname": "localhost"},  # not allowed in production
    ],
)
async def test_tokens_for_another_action_or_host_are_refused(
    client, turnstile_on, reply
):
    install, _ = turnstile_on
    install(lambda r: httpx.Response(200, json=reply))

    response = await client.post(
        "/feedback/submit", json={**GUEST, "turnstile_token": "tok"}
    )

    assert response.status_code == 403


async def test_hostname_allowlist_can_be_set_and_is_never_empty(
    client, turnstile_on, monkeypatch
):
    install, _ = turnstile_on
    install(lambda r: httpx.Response(200, json={**PASSED, "hostname": "localhost"}))
    monkeypatch.setattr(settings, "turnstile_hostnames", "localhost, 127.0.0.1")
    ok = await client.post("/feedback/submit", json={**GUEST, "turnstile_token": "a"})
    assert ok.status_code == 201

    # No list and no FRONTEND_URL: nothing is allowed, rather than everything.
    monkeypatch.setattr(settings, "turnstile_hostnames", "")
    monkeypatch.setattr(settings, "frontend_url", None)
    assert settings.allowed_turnstile_hostnames == set()
    refused = await client.post(
        "/feedback/submit", json={**GUEST, "turnstile_token": "b"}
    )
    assert refused.status_code == 403


async def test_cloudflare_unreachable_asks_to_retry(client, turnstile_on):
    install, _ = turnstile_on

    def down(request):
        raise httpx.ConnectError("down")

    install(down)

    response = await client.post(
        "/feedback/submit", json={**GUEST, "turnstile_token": "tok"}
    )

    assert response.status_code == 503


async def test_signed_in_senders_skip_turnstile(client, auth_headers, turnstile_on):
    install, seen = turnstile_on
    install(lambda r: httpx.Response(200, json={"success": False}))

    response = await client.post(
        "/feedback/submit",
        json={"feedback_category": "general", "message": "Signed-in hello there."},
        headers=auth_headers,
    )

    assert response.status_code == 201
    assert seen == []


async def test_unsubscribe_token_for_a_malformed_id_is_refused(client):
    malformed = User.model_construct(id="not-an-object-id")
    token = unsubscribe_token(malformed, "case_ready")

    response = await client.post(f"/notifications/unsubscribe?token={token}")

    assert response.status_code == 400
