"""Unit tests for auth, OTP, email, Google OAuth and rate-limit services.

Third-party boundaries (Google's endpoints via a mocked httpx, google-auth's
signature check, SMTP) are replaced with fakes; no request leaves the process.
"""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
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


async def test_create_otp_expires_after_configured_minutes(outbox):
    before = get_current_datetime()
    await otp_service.create_otp("t@example.com")

    stored = await OTP.find_one(OTP.email == "t@example.com")
    assert stored is not None
    expiry = (
        stored.expiry.replace(tzinfo=UTC)
        if stored.expiry.tzinfo is None
        else stored.expiry
    )
    lifetime = expiry - before
    assert timedelta(minutes=settings.otp_expire_minutes - 1) < lifetime
    assert lifetime <= timedelta(minutes=settings.otp_expire_minutes, seconds=5)


async def test_verify_otp_expired_code_is_deleted(monkeypatch):
    # MongoDB's TTL sweep runs about once a minute, so an expired code can still
    # be read; mongomock hides it at once, hence the one-shot fake lookup.
    otp = OTP(
        email="e@example.com",
        otp="123456",
        expiry=datetime.now(UTC) - timedelta(seconds=1),
    )
    original_find_one = OTP.find_one

    async def stored_otp():
        return otp

    def find_one(*args, **kwargs):
        monkeypatch.setattr(OTP, "find_one", original_find_one)
        return stored_otp()

    monkeypatch.setattr(OTP, "find_one", find_one)

    assert await otp_service.verify_otp("e@example.com", "123456") is False


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
# services/google_auth.py (Google's endpoints served by mock_http; signature
# checks faked at google.auth.jwt.decode)
# ---------------------------------------------------------------------------

CERTS = {"kid-1": "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n"}


@pytest.fixture
def served_certs(mock_http):
    """Serve CERTS at Google's certs URL; the list collects every request made."""
    hits: list[str] = []

    def handler(request):
        hits.append(str(request.url))
        return httpx.Response(
            200, json=CERTS, headers={"cache-control": "public, max-age=600"}
        )

    mock_http(google_auth, handler)
    return hits


def fake_decode(claims=None, error=None):
    def _decode(token, certs, audience, clock_skew_in_seconds=0):
        assert certs == CERTS
        if error:
            raise error
        return {**(claims or {}), "aud": audience}

    return _decode


async def test_google_certs_are_cached_until_max_age(served_certs, monkeypatch):
    assert await google_auth.google_certs() == CERTS
    assert await google_auth.google_certs() == CERTS
    assert served_certs == [google_auth.GOOGLE_CERTS_URL]

    # an expired cache is fetched again
    monkeypatch.setattr(google_auth, "_certs", (0.0, {}))
    assert await google_auth.google_certs() == CERTS
    assert len(served_certs) == 2


async def test_google_certs_without_max_age_and_on_error(mock_http, monkeypatch):
    mock_http(google_auth, lambda r: httpx.Response(200, json=CERTS))
    assert await google_auth.google_certs() == CERTS

    monkeypatch.setattr(google_auth, "_certs", None)
    mock_http(google_auth, lambda r: httpx.Response(503))
    with pytest.raises(httpx.HTTPStatusError):
        await google_auth.google_certs()


async def test_verify_google_token_accepts_google_issuer(served_certs, monkeypatch):
    monkeypatch.setattr(
        google_auth.google_jwt,
        "decode",
        fake_decode(
            {"iss": "https://accounts.google.com", "sub": "1", "email": "a@example.com"}
        ),
    )

    info = await google_auth.verify_google_token("id-token")

    assert info["aud"] == settings.google_client_id
    assert info["sub"] == "1"


@pytest.mark.parametrize(
    "decode",
    [
        fake_decode({"iss": "evil.example.com"}),
        fake_decode(error=ValueError("Token expired")),
    ],
)
async def test_verify_google_token_rejects(served_certs, monkeypatch, decode):
    monkeypatch.setattr(google_auth.google_jwt, "decode", decode)

    with pytest.raises(HTTPException) as exc:
        await google_auth.verify_google_token("id-token")
    assert exc.value.status_code == 401


async def test_verify_google_token_requires_client_id(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", None)

    with pytest.raises(HTTPException) as exc:
        await google_auth.verify_google_token("id-token")
    # The misconfiguration is logged; the caller only learns the token failed.
    assert exc.value.detail == "Invalid Google token."


async def test_verify_risc_token(served_certs, monkeypatch):
    monkeypatch.setattr(
        google_auth.google_jwt,
        "decode",
        fake_decode({"iss": "accounts.google.com", "events": {}}),
    )
    assert (await google_auth.verify_risc_token("t"))["iss"] == "accounts.google.com"

    monkeypatch.setattr(google_auth.google_jwt, "decode", fake_decode({"iss": "other"}))
    with pytest.raises(ValueError, match="Invalid RISC token"):
        await google_auth.verify_risc_token("t")


async def test_exchange_code_for_token(mock_http):
    sent = {}

    def handler(request):
        sent["url"] = str(request.url)
        sent["body"] = request.content.decode()
        return httpx.Response(200, json={"id_token": "idt", "access_token": "at"})

    mock_http(google_auth, handler)

    tokens = await google_auth.exchange_code_for_token("code-1")

    assert tokens["id_token"] == "idt"
    assert sent["url"] == google_auth.GOOGLE_TOKEN_URL
    assert "code=code-1" in sent["body"] and "redirect_uri=postmessage" in sent["body"]


async def test_exchange_code_for_token_errors(mock_http, monkeypatch):
    mock_http(
        google_auth, lambda r: httpx.Response(400, json={"error": "invalid_grant"})
    )
    with pytest.raises(ValueError, match="Failed to exchange code: HTTP 400"):
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
    assert "hour" in exc.value.detail or "minute" in exc.value.detail


@pytest.mark.parametrize(
    "window, expected, unexpected",
    [(30, "1 minute", "hour"), (7200, "2 hours", None)],
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
    otp = OTP(
        email="x@example.com",
        otp="111111",
        expiry=datetime.now(UTC) + timedelta(minutes=5),
    )
    await otp.insert()

    original_find_one = OTP.find_one

    async def stored_otp():
        return otp  # keeps the aware datetime; the DB would hand back a naive one

    def find_one(*args, **kwargs):
        # only the lookup in verify_otp; later calls (e.g. delete) hit the DB
        monkeypatch.setattr(OTP, "find_one", original_find_one)
        return stored_otp()

    monkeypatch.setattr(OTP, "find_one", find_one)

    assert await otp_service.verify_otp("x@example.com", "111111") is True
    assert await OTP.get(otp.id) is None


async def test_verify_otp_allows_a_typo_but_discards_code_after_max_attempts():
    await OTP(
        email="b@example.com",
        otp="123456",
        expiry=get_current_datetime() + timedelta(minutes=5),
    ).insert()

    assert await otp_service.verify_otp("b@example.com", "000000") is False
    assert await otp_service.verify_otp("b@example.com", "123456") is True

    await OTP(
        email="b@example.com",
        otp="123456",
        expiry=get_current_datetime() + timedelta(minutes=5),
    ).insert()
    for _ in range(settings.otp_max_attempts):
        assert await otp_service.verify_otp("b@example.com", "000000") is False

    assert await OTP.find(OTP.email == "b@example.com").count() == 0
    assert await otp_service.verify_otp("b@example.com", "123456") is False


async def test_verify_otp_rejects_code_whose_tries_are_used_up():
    # e.g. a parallel request claimed the last try between our read and update
    await OTP(
        email="c@example.com",
        otp="123456",
        expiry=get_current_datetime() + timedelta(minutes=5),
        attempts=settings.otp_max_attempts,
    ).insert()

    assert await otp_service.verify_otp("c@example.com", "123456") is False
    assert await OTP.find(OTP.email == "c@example.com").count() == 0


async def test_create_otp_limits_codes_per_email(outbox):
    for _ in range(settings.otp_send_limit):
        await otp_service.create_otp("s@example.com")

    with pytest.raises(HTTPException) as exc:
        await otp_service.create_otp("s@example.com")

    assert exc.value.status_code == 429
    assert "minute" in exc.value.detail
    assert len(outbox) == settings.otp_send_limit
    await otp_service.create_otp("other@example.com")  # limit is per address


@pytest.mark.parametrize(
    "seconds, expected",
    [
        (40, "1 minute"),
        (125, "3 minutes"),
        (3600, "1 hour"),
        (3 * 3600 + 5 * 60, "3 hours and 5 minutes"),
        (3600 + 60, "1 hour and 1 minute"),
    ],
)
def test_format_wait(seconds, expected):
    assert rl.format_wait(seconds) == expected


async def test_reserve_lets_only_the_limit_through_in_parallel(limiter):
    async def attempt():
        try:
            return await limiter.reserve("p1", "Wait {minutes} minutes.")
        except HTTPException as e:
            return e.status_code

    results = await asyncio.gather(*(attempt() for _ in range(5)))

    assert results.count(429) == 3
    assert await RateLimitEntry.find(RateLimitEntry.user_id == "p1").count() == 2


async def test_a_released_attempt_doesnt_count(limiter):
    for _ in range(4):
        await rl.RateLimiter.release(await limiter.reserve("p2", "{minutes}"))

    assert await limiter.get_remaining_attempts("p2") == (2, None)


async def test_a_code_that_was_never_sent_is_not_kept(monkeypatch):
    async def undelivered(*_args, **_kwargs):
        return False

    monkeypatch.setattr(otp_service, "send_otp_email", undelivered)

    with pytest.raises(HTTPException) as exc:
        await otp_service.create_otp("lost@example.com")

    assert exc.value.status_code == 503
    assert await OTP.find(OTP.email == "lost@example.com").count() == 0


async def test_a_code_signs_in_once_even_when_sent_twice_at_once(outbox):
    code = await otp_service.create_otp("twice@example.com")

    results = await asyncio.gather(
        otp_service.verify_otp("twice@example.com", code),
        otp_service.verify_otp("twice@example.com", code),
    )

    assert sorted(results) == [False, True]


@pytest.mark.parametrize(
    "url, kept",
    [
        ("https://lh3.googleusercontent.com/a/photo", True),
        ("https://googleusercontent.com/photo", True),
        ("http://lh3.googleusercontent.com/a/photo", False),
        ("https://evil.example/googleusercontent.com/x", False),
        ("https://googleusercontent.com.evil.example/x", False),
        ("javascript:alert(1)", False),
        (None, False),
    ],
)
def test_only_google_profile_pictures_are_taken(url, kept):
    from app.routes.auth import google_photo

    assert google_photo(url) == (url if kept else None)


async def test_reserve_locks_dont_pile_up(limiter):
    for i in range(20):
        await rl.RateLimiter.release(await limiter.reserve(f"k{i}", "{minutes}"))

    assert rl._reserving._locks == {} and rl._reserving._users == {}


async def test_reserve_is_exact_even_when_the_database_is_slow(limiter, monkeypatch):
    # On a real server an insert can have its id but not have landed yet when a
    # later one counts (what CI's mongodb leg hit). Simulated: ids first, then
    # uneven pauses before each write. Only the lock keeps this exact.
    from beanie import PydanticObjectId

    real_insert = RateLimitEntry.insert
    pauses = iter([0.03, 0.0, 0.02, 0.0, 0.01, 0.0])

    async def in_flight(self, *args, **kwargs):
        if self.id is None:
            self.id = PydanticObjectId()
        await asyncio.sleep(next(pauses, 0.0))
        return await real_insert(self, *args, **kwargs)

    monkeypatch.setattr(RateLimitEntry, "insert", in_flight)

    async def attempt():
        try:
            return await limiter.reserve("slow", "{minutes}")
        except HTTPException as e:
            return e.status_code

    results = await asyncio.gather(*(attempt() for _ in range(6)))

    assert results.count(429) == 4
    assert await RateLimitEntry.find(RateLimitEntry.user_id == "slow").count() == 2
