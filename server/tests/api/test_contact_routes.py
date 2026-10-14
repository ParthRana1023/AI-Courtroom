"""Contact form (POST /feedback/submit): signed in or guest, account recovery, limits."""

from datetime import timedelta

import pytest

from app import messages
from app.config import settings
from app.models.feedback import Feedback
from app.services.auth import create_access_token
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import contact_ip_limiter, contact_sender_limiter
from tests.helpers import boom

GUEST = {"name": "Meera Iyer", "email": "Meera@Example.com"}


def days_ago(n: int) -> str:
    return (get_current_datetime().date() - timedelta(days=n)).isoformat()


async def test_signed_in_message_uses_the_account(client, user, auth_headers):
    response = await client.post(
        "/feedback/submit",
        headers=auth_headers,
        json={"feedback_category": "bug_report", "message": "The gavel is too loud."},
    )

    assert response.status_code == 201
    assert response.json()["feedback_category"] == "bug_report"
    saved = await Feedback.find_one(Feedback.user_id == str(user.id))
    assert saved is not None
    assert (saved.email, saved.first_name, saved.message) == (
        user.email,
        user.first_name,
        "The gavel is too loud.",
    )


async def test_phone_account_without_email_can_write(client, make_user):
    phone_user = await make_user(email=None, auth_method="phone")
    token = create_access_token(data={"sub": str(phone_user.id)})

    response = await client.post(
        "/feedback/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={"feedback_category": "general", "message": "Lovely app, thank you."},
    )

    assert response.status_code == 201
    saved = await Feedback.find_one(Feedback.user_id == str(phone_user.id))
    assert saved is not None and saved.email is None


async def test_guest_must_leave_name_and_email(client):
    body = {"feedback_category": "general", "message": "Hello from a visitor."}

    nameless = await client.post("/feedback/submit", json=body)
    stale_token = await client.post(
        "/feedback/submit", headers={"Authorization": "Bearer nope"}, json=body
    )
    bad_email = await client.post(
        "/feedback/submit", json={**body, **GUEST, "email": "not-an-email"}
    )
    sent = await client.post("/feedback/submit", json={**body, **GUEST})

    assert nameless.status_code == 422
    assert nameless.json()["detail"] == messages.GUEST_DETAILS_REQUIRED
    assert stale_token.status_code == 422  # treated as a guest, not a 401
    assert bad_email.status_code == 422
    assert sent.status_code == 201
    saved = await Feedback.find_one(Feedback.name == "Meera Iyer")
    assert saved is not None
    assert (saved.user_id, saved.email) == (None, "meera@example.com")


RECOVERY = {"feedback_category": "account_recovery", "account_identifier": "a@b.co"}


@pytest.mark.parametrize(
    "body",
    [
        {"feedback_category": "general", "message": ""},
        {"feedback_category": "general", "message": "short"},
        {**RECOVERY, "message": "short"},
        {"feedback_category": "account_recovery"},
        {**RECOVERY, "account_identifier": "nobody"},
        {**RECOVERY, "deleted_on": 40},  # past the 30 days
        {**RECOVERY, "deleted_on": -3},  # in the future
    ],
)
async def test_invalid_messages_are_refused(client, auth_headers, body):
    if "deleted_on" in body:
        body = {**body, "deleted_on": days_ago(body["deleted_on"])}

    response = await client.post("/feedback/submit", headers=auth_headers, json=body)

    assert response.status_code == 422
    assert await Feedback.count() == 0


async def test_account_recovery_needs_no_message_and_alerts_support(client, outbox):
    response = await client.post(
        "/feedback/submit",
        json={
            **GUEST,
            "feedback_category": "account_recovery",
            "account_identifier": "+91 98765 43210",
            "deleted_on": days_ago(3),
            "message": "It had my <b>moot</b> cases.",
        },
    )
    bare = await client.post(
        "/feedback/submit",
        json={**GUEST, "feedback_category": "account_recovery", **RECOVERY},
    )

    assert (response.status_code, bare.status_code) == (201, 201)
    saved = await Feedback.find_one(Feedback.deleted_on != None)
    assert saved is not None
    assert (saved.account_identifier, saved.deleted_on) == (
        "+91 98765 43210",
        days_ago(3),
    )
    alerts = [m for m in outbox if "Account recovery request" in m["subject"]]
    assert [m["to"] for m in alerts] == [settings.email_username] * 2
    assert "+91 98765 43210" in alerts[0]["body"]
    assert "&lt;b&gt;moot&lt;/b&gt;" in alerts[0]["body"]  # typed text is escaped


async def test_other_categories_drop_recovery_fields(client, auth_headers, outbox):
    await client.post(
        "/feedback/submit",
        headers=auth_headers,
        json={
            "feedback_category": "general",
            "message": "Just saying hello.",
            "account_identifier": "me@example.com",
        },
    )

    saved = await Feedback.find_one()
    assert saved is not None and saved.account_identifier is None
    assert not [m for m in outbox if "Account recovery" in m["subject"]]


async def test_senders_and_ips_are_rate_limited(client, monkeypatch):
    monkeypatch.setattr(contact_sender_limiter, "requests", 2)
    monkeypatch.setattr(contact_ip_limiter, "requests", 3)
    body = {"feedback_category": "general", "message": "Hello from a visitor."}

    same_sender = [
        (await client.post("/feedback/submit", json={**body, **GUEST})).status_code
        for _ in range(3)
    ]
    other_sender = await client.post(
        "/feedback/submit", json={**body, "name": "Ravi", "email": "ravi@example.com"}
    )
    same_ip = await client.post(
        "/feedback/submit", json={**body, "name": "Asha", "email": "asha@example.com"}
    )

    assert same_sender == [201, 201, 429]
    assert other_sender.status_code == 201  # third message from this IP
    assert same_ip.status_code == 429
    assert "wait" in same_ip.json()["detail"]
    assert await Feedback.count() == 3


async def test_a_failed_save_is_reported_and_not_counted(
    client, auth_headers, monkeypatch
):
    monkeypatch.setattr(Feedback, "insert", boom)

    failed = await client.post(
        "/feedback/submit",
        headers=auth_headers,
        json={"feedback_category": "other", "message": "A long enough message"},
    )

    assert failed.status_code == 500
    remaining, _ = await contact_ip_limiter.get_remaining_attempts("127.0.0.1")
    assert remaining == settings.contact_ip_rate_limit
