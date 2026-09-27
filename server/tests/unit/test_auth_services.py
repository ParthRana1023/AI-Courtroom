"""Unit tests for auth, OTP, email, Google OAuth and rate-limit services.

Third-party boundaries (Google's token endpoints via urllib / google-auth,
SMTP) are replaced with fakes; no request leaves the process.
"""

import io
import json
import time
import urllib.error
from datetime import UTC, datetime, timedelta
from email.message import Message
from types import SimpleNamespace
from typing import Any

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from app.config import settings
from app.models.otp import OTP
from app.models.rate_limit import RateLimitEntry
from app.models.user import User
from app.schemas.user import UserCreate
from app.services import auth as auth_service
from app.services import email as email_service
from app.services import google_auth
from app.services import otp as otp_service
from app.utils import rate_limiter as rl
from app.utils.datetime import get_current_datetime


def user_create(**overrides) -> UserCreate:
    data: dict[str, Any] = {
        "first_name": "Meera",
        "last_name": "Iyer",
        "date_of_birth": "1992-03-04",
        "phone_number": "9000000001",
        "email": "meera@example.com",
        "password": "Password1!",
        "gender": "female",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "state_iso2": "TN",
        "country": "India",
        "country_iso2": "IN",
    }
    data.update(overrides)
    return UserCreate(**data)


# ---------------------------------------------------------------------------
# services/auth.py
# ---------------------------------------------------------------------------


async def test_create_user_hashes_password_and_rejects_duplicates():
    user = await auth_service.create_user(user_create())

    assert user.password_hash and user.password_hash != "Password1!"
    auth_service.ph.verify(user.password_hash, "Password1!")
    with pytest.raises(HTTPException) as exc:
        await auth_service.create_user(user_create())
    assert exc.value.status_code == 400


def test_create_access_token_default_expiry():
    token = auth_service.create_access_token({"sub": "x@example.com"})

    claims = pyjwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    remaining = claims["exp"] - time.time()
    assert claims["sub"] == "x@example.com"
    assert 13 * 60 < remaining <= 15 * 60


# ---------------------------------------------------------------------------
# services/otp.py
# ---------------------------------------------------------------------------


def test_generate_otp_is_numeric_with_requested_length():
    code = otp_service.generate_otp(8)

    assert len(code) == 8 and code.isdigit()


async def test_create_otp_replaces_previous_code(outbox):
    first = await otp_service.create_otp("r@example.com", is_registration=True)
    second = await otp_service.create_otp("r@example.com", is_registration=False)

    stored = await OTP.find(OTP.email == "r@example.com").to_list()
    assert [o.otp for o in stored] == [second]
    assert stored[0].is_registration is False
    assert len(outbox) == 2 and first in outbox[0]["body"]


async def test_verify_otp_expired_code_is_deleted():
    await OTP(
        email="e@example.com",
        otp="123456",
        expiry=datetime.now(UTC) - timedelta(seconds=1),
    ).insert()

    assert await otp_service.verify_otp("e@example.com", "123456") is False
    assert await OTP.find(OTP.email == "e@example.com").count() == 0


# ---------------------------------------------------------------------------
# services/email.py (smtplib is replaced by the outbox fixture)
# ---------------------------------------------------------------------------


async def test_send_otp_email_mentions_action(outbox):
    assert (
        await email_service.send_otp_email(
            "a@example.com", "987654", is_registration=False
        )
        is True
    )

    assert outbox[0]["subject"] == "Your OTP for login - AI Courtroom"
    assert "987654" in outbox[0]["body"]


async def test_send_email_returns_false_on_smtp_failure(monkeypatch):
    class FailingSMTP:
        def __init__(self, host, port):
            raise OSError("connection refused")

    monkeypatch.setattr(email_service.smtplib, "SMTP", FailingSMTP)

    assert await email_service.send_otp_email("a@example.com", "1", True) is False


# ---------------------------------------------------------------------------
# services/google_auth.py (google-auth and urllib are faked)
# ---------------------------------------------------------------------------


def fake_verify(claims=None, error=None):
    def _verify(token, request, audience, clock_skew_in_seconds=0):
        if error:
            raise error
        return {**(claims or {}), "aud": audience}

    return _verify


async def test_verify_google_token_accepts_google_issuer(monkeypatch):
    monkeypatch.setattr(
        google_auth.id_token,
        "verify_oauth2_token",
        fake_verify(
            {"iss": "https://accounts.google.com", "sub": "1", "email": "a@example.com"}
        ),
    )

    info = await google_auth.verify_google_token("id-token")

    assert info["aud"] == settings.google_client_id
    assert info["sub"] == "1"


@pytest.mark.parametrize(
    "verify",
    [
        fake_verify({"iss": "evil.example.com"}),
        fake_verify(error=ValueError("Token expired")),
    ],
)
async def test_verify_google_token_rejects(monkeypatch, verify):
    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", verify)

    with pytest.raises(HTTPException) as exc:
        await google_auth.verify_google_token("id-token")
    assert exc.value.status_code == 401


async def test_verify_google_token_requires_client_id(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", None)

    with pytest.raises(HTTPException) as exc:
        await google_auth.verify_google_token("id-token")
    assert "GOOGLE_CLIENT_ID" in exc.value.detail


async def test_verify_risc_token(monkeypatch):
    monkeypatch.setattr(
        google_auth.id_token,
        "verify_oauth2_token",
        fake_verify({"iss": "accounts.google.com", "events": {}}),
    )
    assert (await google_auth.verify_risc_token("t"))["iss"] == "accounts.google.com"

    monkeypatch.setattr(
        google_auth.id_token, "verify_oauth2_token", fake_verify({"iss": "other"})
    )
    with pytest.raises(ValueError, match="Invalid RISC token"):
        await google_auth.verify_risc_token("t")


class FakeHTTPResponse:
    def __init__(self, payload, status=200):
        self.status = status
        self._body = json.dumps(payload).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code=400, body=b'{"error": "invalid_grant"}'):
    return urllib.error.HTTPError(
        "https://oauth2.googleapis.com",
        code,
        "Bad Request",
        Message(),
        io.BytesIO(body),
    )


async def test_exchange_code_for_token(monkeypatch):
    sent = {}

    def urlopen(request):
        sent["body"] = request.data.decode()
        return FakeHTTPResponse({"id_token": "idt", "access_token": "at"})

    monkeypatch.setattr(google_auth.urllib.request, "urlopen", urlopen)

    tokens = await google_auth.exchange_code_for_token("code-1")

    assert tokens["id_token"] == "idt"
    assert "code=code-1" in sent["body"] and "redirect_uri=postmessage" in sent["body"]


async def test_exchange_code_for_token_errors(monkeypatch):
    monkeypatch.setattr(
        google_auth.urllib.request,
        "urlopen",
        lambda r: FakeHTTPResponse({}, status=503),
    )
    with pytest.raises(ValueError, match="returned 503"):
        await google_auth.exchange_code_for_token("c")

    def raise_http_error(request):
        raise http_error()

    monkeypatch.setattr(google_auth.urllib.request, "urlopen", raise_http_error)
    with pytest.raises(ValueError, match="Failed to exchange code"):
        await google_auth.exchange_code_for_token("c")

    monkeypatch.setattr(settings, "google_client_secret", None)
    with pytest.raises(ValueError, match="not configured"):
        await google_auth.exchange_code_for_token("c")


async def test_authenticate_google_user_keeps_existing_photo(monkeypatch, make_user):
    await make_user(
        email="c@example.com", google_id="sub-c", profile_photo_url="https://x/p.jpg"
    )

    async def verify(credential):
        return {
            "sub": "sub-c",
            "email": "c@example.com",
            "picture": "https://new/p.jpg",
            "email_verified": True,
        }

    monkeypatch.setattr(google_auth, "verify_google_token", verify)

    result = await google_auth.authenticate_google_user(credential="idt")

    assert result["is_new_user"] is False
    user = await User.find_one(User.email == "c@example.com")
    assert user is not None
    assert user.profile_photo_url == "https://x/p.jpg"  # existing photo kept


async def test_authenticate_google_user_new_user_without_name(monkeypatch):
    async def verify(credential):
        return {"sub": "sub-d", "email": "d@example.com", "email_verified": "true"}

    monkeypatch.setattr(google_auth, "verify_google_token", verify)

    result = await google_auth.authenticate_google_user(credential="idt")

    assert result["google_user_data"]["first_name"] == ""
    assert result["google_user_data"]["last_name"] == ""


# ---------------------------------------------------------------------------
# utils/rate_limiter.py
# ---------------------------------------------------------------------------


def test_ensure_ist_timezone_handles_naive_and_aware():
    naive = datetime(2026, 1, 1, 0, 0)  # noqa: DTZ001 - naive on purpose
    aware = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)

    assert rl.ensure_ist_timezone(naive).utcoffset() == timedelta(hours=5, minutes=30)
    assert rl.ensure_ist_timezone(aware).hour == 5


@pytest.fixture
def limiter():
    return rl.RateLimiter(requests=2, window=3600, rate_limiter_type="test_limiter")


async def test_get_remaining_attempts_counts_and_reports_reset(limiter):
    assert await limiter.get_remaining_attempts("u1") == (2, None)

    await limiter.register_usage("u1")
    await limiter.register_usage("u1")
    remaining, seconds = await limiter.get_remaining_attempts("u1")

    assert remaining == 0
    assert 3500 < seconds <= 3600


async def test_expired_entries_are_purged(limiter):
    await RateLimitEntry(
        user_id="u2",
        rate_limiter_type="test_limiter",
        expiration_time=get_current_datetime() - timedelta(seconds=1),
    ).insert()

    assert await limiter.get_remaining_attempts("u2") == (2, None)
    assert await RateLimitEntry.find(RateLimitEntry.user_id == "u2").count() == 0


async def test_check_only_does_not_register(limiter, user):
    returned = await limiter.check_only(user=user)

    assert returned is user
    assert (
        await RateLimitEntry.find(RateLimitEntry.user_id == str(user.id)).count() == 0
    )


async def test_check_only_raises_429_with_wait_time(limiter, user):
    await limiter.register_usage(str(user.id))
    await limiter.register_usage(str(user.id))

    with pytest.raises(HTTPException) as exc:
        await limiter.check_only(user=user)

    assert exc.value.status_code == 429
    assert "hours" in exc.value.detail or "minutes" in exc.value.detail


@pytest.mark.parametrize(
    "window, expected, unexpected",
    [(30, "seconds", "hours"), (7200, "1 hours", None)],
)
async def test_wait_message_matches_window(user, window, expected, unexpected):
    limiter = rl.RateLimiter(requests=1, window=window, rate_limiter_type=f"w{window}")
    await limiter.register_usage(str(user.id))

    with pytest.raises(HTTPException) as exc:
        await limiter.check_only(user=user)

    assert expected in exc.value.detail
    if unexpected:
        assert unexpected not in exc.value.detail


async def test_verify_otp_checks_code_and_purpose_and_is_single_use():
    await OTP(
        email="v@example.com",
        otp="123456",
        expiry=get_current_datetime() + timedelta(minutes=5),
        is_registration=True,
    ).insert()

    assert await otp_service.verify_otp("v@example.com", "654321") is False
    assert (
        await otp_service.verify_otp("v@example.com", "123456", is_registration=False)
        is False
    )
    assert (
        await otp_service.verify_otp("v@example.com", "123456", is_registration=True)
        is True
    )
    assert (
        await otp_service.verify_otp("v@example.com", "123456") is False
    )  # already used


async def test_verify_otp_accepts_timezone_aware_expiry(monkeypatch):
    aware_future = datetime.now(UTC) + timedelta(minutes=5)
    deleted = []

    async def delete():
        deleted.append(True)

    async def find_one(*args, **kwargs):
        return SimpleNamespace(expiry=aware_future, delete=delete)

    monkeypatch.setattr(OTP, "find_one", find_one)

    assert await otp_service.verify_otp("x@example.com", "1") is True
    assert deleted == [True]
