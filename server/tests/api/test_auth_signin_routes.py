"""Tests for the redesigned sign-in: sessions, phone codes, password reset, slimmer sign-up."""

import re
from datetime import UTC, timedelta

import jwt
import pytest

from app import messages
from app.config import settings
from app.models.otp import OTP
from app.models.user import User
from app.models.user_session import UserSession
from app.services import auth as auth_service
from app.services import otp as otp_service
from app.services.sms import send_sms
from app.utils.datetime import get_current_datetime
from tests.helpers import reload

VALID_PASSWORD = "Password123!"


def slim_registration(**overrides) -> dict:
    data = {
        "first_name": "Asha",
        "last_name": "Verma",
        "email": "asha@example.com",
        "password": VALID_PASSWORD,
        "confirm_adult": True,
    }
    data.update(overrides)
    return data


async def sign_in(client, user) -> str:
    """Email + password + emailed code; returns the access token."""
    await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": VALID_PASSWORD}
    )
    otp = await OTP.find_one(OTP.email == user.email)
    assert otp is not None
    response = await client.post(
        "/auth/login/verify",
        json={"email": user.email, "otp": otp.otp},
        headers={"user-agent": "Firefox/130"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Sign-up without date of birth, phone, gender or location
# ---------------------------------------------------------------------------


async def test_register_needs_only_name_email_password_and_adult_box(client):
    response = await client.post("/auth/register/initiate", json=slim_registration())
    assert response.status_code == 200
    otp = await OTP.find_one(OTP.email == "asha@example.com")
    assert otp is not None

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": slim_registration(), "otp": otp.otp},
    )
    assert response.status_code == 201
    user = await User.find_one(User.email == "asha@example.com")
    assert user is not None
    assert user.date_of_birth is None and user.phone_number is None
    assert user.auth_method == "email"


async def test_register_requires_the_adult_box_without_a_birth_date(client):
    response = await client.post(
        "/auth/register/initiate", json=slim_registration(confirm_adult=False)
    )
    assert response.status_code == 422
    assert "18 years old" in response.text


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


async def test_sign_in_records_the_device_and_puts_its_id_in_the_token(
    client, make_user
):
    user = await make_user(email="dev@example.com")
    token = await sign_in(client, user)

    claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert claims["sub"] == str(user.id)
    session = await UserSession.find_one(UserSession.sid == claims["sid"])
    assert session is not None
    assert session.user_id == user.id
    assert session.user_agent == "Firefox/130"
    assert session.revoked is False


async def test_revoked_session_is_signed_out(client, make_user):
    user = await make_user(email="dev@example.com")
    token = await sign_in(client, user)
    assert (await client.get("/auth/profile", headers=bearer(token))).status_code == 200

    assert user.id is not None
    assert await auth_service.revoke_sessions(user.id) == 1
    assert (await client.get("/auth/profile", headers=bearer(token))).status_code == 401


async def test_revoke_can_keep_the_current_device(client, make_user):
    user = await make_user(email="dev@example.com")
    first = await sign_in(client, user)
    second = await sign_in(client, user)
    keep = jwt.decode(second, settings.secret_key, algorithms=[settings.algorithm])

    assert user.id is not None
    assert await auth_service.revoke_sessions(user.id, keep_sid=keep["sid"]) == 1
    assert (await client.get("/auth/profile", headers=bearer(first))).status_code == 401
    assert (
        await client.get("/auth/profile", headers=bearer(second))
    ).status_code == 200


async def test_last_active_is_refreshed_after_a_while(client, make_user):
    user = await make_user(email="dev@example.com")
    token = await sign_in(client, user)
    sid = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])["sid"]
    session = await UserSession.find_one(UserSession.sid == sid)
    assert session is not None
    stale = get_current_datetime() - timedelta(hours=1)
    session.last_active = stale
    await session.save()

    await client.get("/auth/profile", headers=bearer(token))

    fresh = await reload(session)
    touched = fresh.last_active
    if touched.tzinfo is None:  # MongoDB returns naive UTC
        touched = touched.replace(tzinfo=UTC)
    assert touched > stale + timedelta(minutes=30)


async def test_profile_reports_how_the_account_signs_in(
    client, make_user, make_auth_headers
):
    google_user = await make_user(google_id="g-1")  # created before auth_method existed
    response = await client.get("/auth/profile", headers=make_auth_headers(google_user))
    assert response.json()["auth_method"] == "google"


# ---------------------------------------------------------------------------
# Phone codes
# ---------------------------------------------------------------------------


@pytest.fixture
def texts(monkeypatch):
    """Turn phone sign-in on and capture the SMS messages it sends."""
    sent: list[tuple[str, str]] = []

    async def record(to, body):
        sent.append((to, body))
        return True

    monkeypatch.setattr(settings, "phone_auth_enabled", True)
    monkeypatch.setattr(otp_service, "send_sms", record)
    return sent


def phone_body(purpose="register", number="98765 43210", **extra) -> dict:
    data = {"phone_code": "91", "phone_number": number, "purpose": purpose}
    if purpose == "register":
        data.update(first_name="Ravi", last_name="Kumar", confirm_adult=True)
    data.update(extra)
    return data


def code_in(texts) -> str:
    match = re.search(r"\d{6}", texts[-1][1])
    assert match
    return match.group()


async def test_phone_routes_are_hidden_when_disabled(client):
    response = await client.post("/auth/phone/send-otp", json=phone_body())
    assert response.status_code == 404


async def test_phone_sign_up_then_sign_in(client, texts):
    response = await client.post("/auth/phone/send-otp", json=phone_body())
    assert response.status_code == 200
    assert texts[0][0] == "+919876543210"

    response = await client.post(
        "/auth/phone/verify", json=phone_body(otp=code_in(texts), remember_me=True)
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    profile = (await client.get("/auth/profile", headers=bearer(token))).json()
    assert profile["email"] is None
    assert profile["auth_method"] == "phone"
    assert profile["phone_number"] == "9876543210"
    assert profile["is_developer"] is False

    # Same number again: sign in instead.
    taken = await client.post("/auth/phone/send-otp", json=phone_body())
    assert taken.status_code == 400
    assert taken.json()["detail"] == messages.PHONE_TAKEN

    await client.post("/auth/phone/send-otp", json=phone_body("login"))
    response = await client.post(
        "/auth/phone/verify", json=phone_body("login", otp=code_in(texts))
    )
    assert response.status_code == 200


async def test_two_phone_accounts_without_email_can_coexist(client, texts):
    for number in ("9876543210", "9123456780"):
        await client.post("/auth/phone/send-otp", json=phone_body(number=number))
        response = await client.post(
            "/auth/phone/verify", json=phone_body(number=number, otp=code_in(texts))
        )
        assert response.status_code == 200
    assert await User.find(User.auth_method == "phone").count() == 2


async def test_phone_sign_in_needs_an_enrolled_number(client, texts):
    response = await client.post("/auth/phone/send-otp", json=phone_body("login"))
    assert response.status_code == 400
    assert response.json()["detail"] == messages.PHONE_NOT_REGISTERED


async def test_phone_wrong_code(client, texts):
    await client.post("/auth/phone/send-otp", json=phone_body())
    response = await client.post("/auth/phone/verify", json=phone_body(otp="000000"))
    assert response.status_code == 400
    assert response.json()["detail"] == messages.OTP_INVALID


async def test_phone_sign_up_rejects_a_number_enrolled_meanwhile(
    client, texts, make_user
):
    await client.post("/auth/phone/send-otp", json=phone_body())
    await make_user(
        email=None, auth_method="phone", phone_code="91", phone_number="9876543210"
    )
    response = await client.post(
        "/auth/phone/verify", json=phone_body(otp=code_in(texts))
    )
    assert response.status_code == 400
    assert response.json()["detail"] == messages.PHONE_TAKEN


async def test_phone_sign_in_for_an_account_removed_meanwhile(client, texts, make_user):
    user = await make_user(
        email=None, auth_method="phone", phone_code="91", phone_number="9876543210"
    )
    await client.post("/auth/phone/send-otp", json=phone_body("login"))
    await user.delete()
    response = await client.post(
        "/auth/phone/verify", json=phone_body("login", otp=code_in(texts))
    )
    assert response.status_code == 400
    assert response.json()["detail"] == messages.PHONE_NOT_REGISTERED


@pytest.mark.parametrize(
    ("body", "error"),
    [
        (phone_body(number="12345"), "10-digit"),
        (phone_body(number="98765abcde"), "digits only"),
        (phone_body(number=""), "required"),
        (phone_body(phone_code="+"), "country code"),
        (phone_body(phone_code="44", number="123"), "valid mobile"),
        (phone_body(first_name=" "), "name"),
        (phone_body(confirm_adult=False), "18 years old"),
    ],
)
async def test_phone_input_is_checked(client, texts, body, error):
    response = await client.post("/auth/phone/send-otp", json=body)
    assert response.status_code == 422
    assert error in response.text


async def test_phone_numbers_outside_india_take_6_to_14_digits(client, texts):
    body = phone_body(phone_code="+44", number="(020) 7946-0958")
    response = await client.post("/auth/phone/send-otp", json=body)
    assert response.status_code == 200
    assert texts[0][0] == "+4402079460958"


async def test_log_sms_provider_writes_the_message_to_the_log(caplog):
    with caplog.at_level("INFO"):
        assert await send_sms("+919876543210", "123456 is your code") is True
    assert "123456 is your code" in caplog.text


# ---------------------------------------------------------------------------
# Forgot password
# ---------------------------------------------------------------------------


def link_token(outbox) -> str:
    match = re.search(r"forgot-password\?token=([\w.-]+)", outbox[-1]["body"])
    assert match
    return match.group(1)


async def test_forgot_password_emails_a_link(client, make_user, outbox):
    user = await make_user(email="dev@example.com")
    response = await client.post(
        "/auth/password/forgot", json={"email": "DEV@example.com"}
    )

    assert response.status_code == 200
    assert response.json()["message"] == messages.RESET_LINK_SENT
    assert outbox[-1]["to"] == "dev@example.com"
    claims = jwt.decode(
        link_token(outbox), settings.secret_key, algorithms=[settings.algorithm]
    )
    assert claims["sub"] == str(user.id)
    assert claims["email"] == "dev@example.com"


@pytest.mark.parametrize(
    ("origin", "base"),
    [
        (
            "http://localhost:3000",
            "http://localhost:3000",
        ),  # allowed origin: link back to it
        ("https://evil.example", None),  # unknown origin: FRONTEND_URL
        ("capacitor://localhost", None),  # app origin can't be opened from mail
        (None, None),
    ],
)
async def test_reset_link_points_at_the_page_that_asked(
    client, make_user, outbox, monkeypatch, origin, base
):
    monkeypatch.setattr(settings, "frontend_url", "https://ai-courtroom.vercel.app")
    await make_user(email="dev@example.com")
    headers = {"origin": origin} if origin else {}
    await client.post(
        "/auth/password/forgot", json={"email": "dev@example.com"}, headers=headers
    )
    expected = base or "https://ai-courtroom.vercel.app"
    assert f"{expected}/forgot-password?token=" in outbox[-1]["body"]


def test_reset_links_never_follow_the_lan_origin_pattern(monkeypatch):
    monkeypatch.setattr(settings, "frontend_url", "https://ai-courtroom.vercel.app")
    monkeypatch.setattr(
        settings, "cors_allow_origin_regex", r"http://192\.168\.\d+\.\d+:3000"
    )
    assert settings.app_url_for("http://192.168.1.5:3000") == (
        "https://ai-courtroom.vercel.app"
    )
    # Trailing slashes or paths are not exact origins either.
    assert settings.app_url_for("http://localhost:3000/x") == (
        "https://ai-courtroom.vercel.app"
    )


async def test_forgot_password_does_not_reveal_unknown_emails(client, outbox):
    response = await client.post(
        "/auth/password/forgot", json={"email": "nobody@example.com"}
    )
    assert response.status_code == 200
    assert response.json()["message"] == messages.RESET_LINK_SENT
    assert outbox == []


async def test_forgot_password_is_rate_limited(client):
    for _ in range(settings.otp_send_limit):
        await client.post("/auth/password/forgot", json={"email": "x@example.com"})
    response = await client.post(
        "/auth/password/forgot", json={"email": "x@example.com"}
    )
    assert response.status_code == 429


async def test_reset_sets_the_password_and_signs_out_everywhere(
    client, make_user, outbox
):
    user = await make_user(email="dev@example.com")
    token = await sign_in(client, user)
    await client.post("/auth/password/forgot", json={"email": "dev@example.com"})
    reset = link_token(outbox)

    response = await client.post(
        "/auth/password/reset", json={"token": reset, "password": "NewPassword9!"}
    )
    assert response.status_code == 200
    assert response.json()["message"] == messages.PASSWORD_CHANGED
    assert (await client.get("/auth/profile", headers=bearer(token))).status_code == 401
    fresh = await reload(user)
    assert fresh.password_hash
    auth_service.ph.verify(fresh.password_hash, "NewPassword9!")

    # The link works once.
    again = await client.post(
        "/auth/password/reset", json={"token": reset, "password": "Another9!"}
    )
    assert again.status_code == 400
    assert again.json()["detail"] == messages.RESET_LINK_INVALID


async def test_reset_rejects_weak_passwords(client, make_user):
    user = await make_user(email="dev@example.com")
    token = auth_service.create_password_reset_token(user)
    response = await client.post(
        "/auth/password/reset", json={"token": token, "password": "short"}
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        jwt.encode({"purpose": "other", "sub": "x"}, "k" * 32, algorithm="HS256"),
    ],
)
async def test_reset_rejects_bad_links(client, token):
    response = await client.post(
        "/auth/password/reset", json={"token": token, "password": VALID_PASSWORD}
    )
    assert response.status_code == 400


async def test_reset_links_for_other_purposes_or_users_do_nothing(make_user):
    other_purpose = jwt.encode(
        {"purpose": "other", "sub": "x"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    assert await auth_service.user_from_reset_token(other_purpose) is None

    bad_id = jwt.encode(
        {"purpose": "password_reset", "sub": "not-an-id"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    assert await auth_service.user_from_reset_token(bad_id) is None

    user = await make_user(email="gone@example.com")
    token = auth_service.create_password_reset_token(user)
    await user.delete()
    assert await auth_service.user_from_reset_token(token) is None
