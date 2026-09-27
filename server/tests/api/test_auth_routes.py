"""Tests for /auth routes: registration, login OTP, profile and Google sign-in."""

from datetime import timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.config import settings
from app.models.case import CaseStatus
from app.models.otp import OTP
from app.models.user import User
from app.routes import auth as auth_routes
from app.services import google_auth
from app.utils.datetime import get_current_datetime
from tests.helpers import boom, reload

VALID_PASSWORD = "Password123!"


def registration_payload(**overrides) -> dict:
    data = {
        "first_name": "Asha",
        "last_name": "Verma",
        "date_of_birth": "1995-05-17",
        "phone_number": "98765-43210",
        "email": "asha@example.com",
        "password": VALID_PASSWORD,
        "gender": "female",
        "city": "Pune",
        "state": "Maharashtra",
        "state_iso2": "MH",
        "country": "India",
        "country_iso2": "IN",
    }
    data.update(overrides)
    return data


async def stored_otp(email: str) -> OTP:
    otp = await OTP.find_one(OTP.email == email)
    assert otp is not None, f"no OTP stored for {email}"
    return otp


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_initiate_sends_otp(client, outbox):
    response = await client.post("/auth/register/initiate", json=registration_payload())

    assert response.status_code == 200
    assert response.json()["skip_otp"] is False
    assert outbox[0]["to"] == "asha@example.com"
    otp = await stored_otp("asha@example.com")
    assert otp.is_registration is True
    assert otp.otp in outbox[0]["body"]


@pytest.mark.asyncio
async def test_register_initiate_rejects_existing_email(client, make_user):
    await make_user(email="asha@example.com")

    response = await client.post("/auth/register/initiate", json=registration_payload())

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


@pytest.mark.parametrize(
    "overrides",
    [
        {"phone_number": "12345"},
        {"password": "short1!"},
        {"password": "NoDigitsHere!"},
        {"password": "12345678!"},
        {"password": "NoSpecial123"},
        {"date_of_birth": "2015-01-01"},
        {"gender": "unknown"},
    ],
)
@pytest.mark.asyncio
async def test_register_initiate_validates_input(client, overrides):
    response = await client.post(
        "/auth/register/initiate", json=registration_payload(**overrides)
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_with_google_id_requires_google_proof(client):
    response = await client.post(
        "/auth/register/initiate",
        json=registration_payload(google_id="attacker-chosen-id"),
    )

    assert response.status_code in (400, 401, 403)


@pytest.mark.asyncio
async def test_register_verify_creates_user_and_consumes_otp(client):
    await client.post("/auth/register/initiate", json=registration_payload())
    otp = await stored_otp("asha@example.com")

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": registration_payload(), "otp": otp.otp, "remember_me": True},
    )

    assert response.status_code == 201
    token = response.json()["access_token"]
    claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert claims["sub"] == "asha@example.com"
    user = await User.find_one(User.email == "asha@example.com")
    assert user is not None
    assert user.phone_number == "9876543210"
    assert user.password_hash and user.password_hash != VALID_PASSWORD
    assert await OTP.find(OTP.email == "asha@example.com").count() == 0


@pytest.mark.asyncio
async def test_register_verify_rejects_wrong_otp(client):
    await client.post("/auth/register/initiate", json=registration_payload())

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": registration_payload(), "otp": "000000x"},
    )

    assert response.status_code == 400
    assert await User.find(User.email == "asha@example.com").count() == 0


@pytest.mark.asyncio
async def test_register_verify_rejects_expired_otp(client):
    await client.post("/auth/register/initiate", json=registration_payload())
    otp = await stored_otp("asha@example.com")
    otp.expiry = get_current_datetime() - timedelta(minutes=1)
    await otp.save()

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": registration_payload(), "otp": otp.otp},
    )

    assert response.status_code == 400
    assert await OTP.find(OTP.email == "asha@example.com").count() == 0


@pytest.mark.asyncio
async def test_register_verify_rejects_login_otp(client, make_user):
    # An OTP issued for login must not complete a registration.
    await OTP(
        email="asha@example.com",
        otp="123456",
        expiry=get_current_datetime() + timedelta(minutes=5),
        is_registration=False,
    ).insert()

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": registration_payload(), "otp": "123456"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_register_verify_rejects_email_registered_meanwhile(client, make_user):
    await client.post("/auth/register/initiate", json=registration_payload())
    otp = await stored_otp("asha@example.com")
    await make_user(email="asha@example.com")

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": registration_payload(), "otp": otp.otp},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("body", [{}, {"email": "a@example.com"}, {"password": "x"}])
@pytest.mark.asyncio
async def test_login_initiate_requires_email_and_password(client, body):
    response = await client.post("/auth/login/initiate", json=body)

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_login_initiate_unknown_email(client):
    response = await client.post(
        "/auth/login/initiate",
        json={"email": "nobody@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_login_initiate_google_only_account(client, make_user):
    await make_user(email="g@example.com", password_hash=None, google_id="g-123")

    response = await client.post(
        "/auth/login/initiate",
        json={"email": "g@example.com", "password": "whatever1!"},
    )

    assert response.status_code == 400
    assert "Google" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_initiate_wrong_password(client, user, outbox):
    response = await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": "Wrong123!"}
    )

    assert response.status_code == 401
    assert outbox == []


@pytest.mark.asyncio
async def test_login_locks_email_after_repeated_wrong_passwords(client, user, outbox):
    for _ in range(settings.login_failure_limit):
        response = await client.post(
            "/auth/login/initiate", json={"email": user.email, "password": "Wrong123!"}
        )
        assert response.status_code == 401

    # Even the right password is refused until the window passes.
    locked = await client.post(
        "/auth/login/initiate",
        json={"email": user.email.upper(), "password": VALID_PASSWORD},
    )

    assert locked.status_code == 429
    assert "minute" in locked.json()["detail"]
    assert outbox == []


@pytest.mark.asyncio
async def test_login_locks_ip_trying_many_accounts(client, monkeypatch):
    monkeypatch.setattr(auth_routes.login_failure_ip_limiter, "requests", 3)
    for i in range(3):
        await client.post(
            "/auth/login/initiate",
            json={"email": f"nobody{i}@example.com", "password": VALID_PASSWORD},
        )

    response = await client.post(
        "/auth/login/initiate",
        json={"email": "fresh@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 429


@pytest.mark.asyncio
async def test_login_ip_limit_ignores_client_supplied_forwarded_for(
    client, monkeypatch
):
    monkeypatch.setattr(auth_routes.login_failure_ip_limiter, "requests", 2)
    for i in range(2):
        await client.post(
            "/auth/login/initiate",
            json={"email": f"x{i}@example.com", "password": VALID_PASSWORD},
            # a fake left entry, then the address the proxy appended
            headers={"X-Forwarded-For": f"10.9.9.{i}, 203.0.113.7"},
        )

    response = await client.post(
        "/auth/login/initiate",
        json={"email": "y@example.com", "password": VALID_PASSWORD},
        headers={"X-Forwarded-For": "198.51.100.1, 203.0.113.7"},
    )

    assert response.status_code == 429


@pytest.mark.asyncio
async def test_login_initiate_sends_login_otp(client, user, outbox):
    response = await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": VALID_PASSWORD}
    )

    assert response.status_code == 200
    assert outbox[0]["to"] == user.email
    assert "login" in outbox[0]["subject"]
    assert (await stored_otp(user.email)).is_registration is False


@pytest.mark.asyncio
async def test_logout_adjourns_only_the_users_running_hearings(
    client, user, auth_headers, make_user, make_case
):
    running = await make_case(user, status=CaseStatus.ACTIVE)
    paused = await make_case(user, status=CaseStatus.ADJOURNED)
    someone_elses = await make_case(await make_user(), status=CaseStatus.ACTIVE)

    response = await client.post("/auth/logout", headers=auth_headers)

    assert response.json() == {"adjourned_cases": 1}
    running = await reload(running)
    assert running.status == CaseStatus.ADJOURNED and running.adjourned_by_session_end
    assert (await reload(paused)).adjourned_by_session_end is False
    assert (await reload(someone_elses)).status == CaseStatus.ACTIVE


@pytest.mark.asyncio
async def test_login_adjourns_hearings_left_running_by_an_expired_session(
    client, user, make_case
):
    running = await make_case(user, status=CaseStatus.ACTIVE)
    await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": VALID_PASSWORD}
    )
    otp = await stored_otp(user.email)

    await client.post("/auth/login/verify", json={"email": user.email, "otp": otp.otp})

    assert (await reload(running)).adjourned_by_session_end is True


@pytest.mark.asyncio
async def test_login_verify_issues_token(client, user):
    await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": VALID_PASSWORD}
    )
    otp = await stored_otp(user.email)

    response = await client.post(
        "/auth/login/verify", json={"email": user.email, "otp": otp.otp}
    )

    assert response.status_code == 200
    profile = await client.get(
        "/auth/profile",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
    )
    assert profile.json()["email"] == user.email
    assert await OTP.find(OTP.email == user.email).count() == 0


@pytest.mark.asyncio
async def test_login_verify_remember_me_extends_expiry(client, user):
    await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": VALID_PASSWORD}
    )
    otp = await stored_otp(user.email)

    response = await client.post(
        "/auth/login/verify",
        json={"email": user.email, "otp": otp.otp, "remember_me": True},
    )

    claims = jwt.decode(
        response.json()["access_token"],
        settings.secret_key,
        algorithms=[settings.algorithm],
    )
    lifetime = claims["exp"] - get_current_datetime().timestamp()
    assert (
        lifetime
        > timedelta(days=settings.extended_token_expire_days - 1).total_seconds()
    )


@pytest.mark.asyncio
async def test_login_verify_rejects_wrong_otp(client, user):
    response = await client.post(
        "/auth/login/verify", json={"email": user.email, "otp": "999999"}
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_login_verify_rejects_malformed_body(client):
    response = await client.post("/auth/login/verify", json={"email": "not-an-email"})

    assert response.status_code == 400
    assert "Invalid request format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_verify_user_deleted_after_otp(client, user):
    await client.post(
        "/auth/login/initiate", json={"email": user.email, "password": VALID_PASSWORD}
    )
    otp = await stored_otp(user.email)
    await user.delete()

    response = await client.post(
        "/auth/login/verify", json={"email": user.email, "otp": otp.otp}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "User not found"


# ---------------------------------------------------------------------------
# Token handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_token_is_rejected(client):
    response = await client.get(
        "/auth/profile", headers={"Authorization": "Bearer junk"}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_without_subject_is_rejected(client):
    token = jwt.encode(
        {"foo": "bar"}, settings.secret_key, algorithm=settings.algorithm
    )

    response = await client.get(
        "/auth/profile", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_for_deleted_user_is_rejected(client, user, auth_headers):
    await user.delete()

    response = await client.get("/auth/profile", headers=auth_headers)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_with_user_id_subject_is_accepted(client, user):
    token = jwt.encode(
        {"sub": str(user.id)}, settings.secret_key, algorithm=settings.algorithm
    )

    response = await client.get(
        "/auth/profile", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == user.email


@pytest.mark.asyncio
async def test_token_with_malformed_id_subject_is_rejected(client):
    token = jwt.encode(
        {"sub": "not-an-object-id"}, settings.secret_key, algorithm=settings.algorithm
    )

    response = await client.get(
        "/auth/profile", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_profile_changes_only_given_fields(client, user, auth_headers):
    response = await client.put(
        "/auth/profile",
        headers=auth_headers,
        json={
            "first_name": "Ravi",
            "nickname": "   ",
            "gender": "male",
            "date_of_birth": "1990-02-03",
            "phone_number": "9123456789",
            "last_name": "Kumar",
            "city": "Nagpur",
            "state": "Maharashtra",
            "state_iso2": "MH",
            "country": "India",
            "country_iso2": "IN",
            "phone_code": "91",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_name"] == "Ravi"
    assert body["nickname"] is None
    assert body["date_of_birth"] == "1990-02-03"
    assert body["city"] == "Nagpur"
    refreshed = await reload(user)
    assert refreshed.last_name == "Kumar"
    assert refreshed.phone_code == "91"


@pytest.mark.asyncio
async def test_update_profile_keeps_nickname(client, auth_headers):
    response = await client.put(
        "/auth/profile", headers=auth_headers, json={"nickname": "Ash"}
    )

    assert response.json()["nickname"] == "Ash"


@pytest.mark.asyncio
async def test_update_profile_rejects_bad_date(client, auth_headers):
    response = await client.put(
        "/auth/profile", headers=auth_headers, json={"date_of_birth": "03/02/1990"}
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_case_location_preference(client, user, auth_headers):
    response = await client.put(
        "/auth/profile/case-location-preference",
        headers=auth_headers,
        json={
            "case_location_preference": "specific_state",
            "preferred_case_state": "KA",
        },
    )

    assert response.status_code == 200
    assert response.json()["preferred_case_state"] == "KA"

    response = await client.put(
        "/auth/profile/case-location-preference",
        headers=auth_headers,
        json={"case_location_preference": "random", "preferred_case_state": "KA"},
    )

    assert response.json()["preferred_case_state"] is None


@pytest.mark.asyncio
async def test_case_location_preference_requires_state(client, auth_headers):
    response = await client.put(
        "/auth/profile/case-location-preference",
        headers=auth_headers,
        json={"case_location_preference": "specific_state"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_rag_preference(client, user, auth_headers):
    response = await client.put(
        "/auth/profile/rag-preference",
        headers=auth_headers,
        json={"rag_enabled": False},
    )

    assert response.status_code == 200
    assert (await reload(user)).rag_enabled is False


# ---------------------------------------------------------------------------
# Profile photo (Cloudinary itself is mocked)
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_cloudinary(monkeypatch):
    from app.services import cloudinary_service

    calls = {"upload": [], "delete": []}

    async def upload(file_bytes, user_id, existing_public_id=None):
        calls["upload"].append((len(file_bytes), user_id, existing_public_id))
        return (
            f"https://res.cloudinary.com/demo/image/upload/v1/profiles/{user_id}.jpg",
            f"profiles/{user_id}",
        )

    async def delete(public_id):
        calls["delete"].append(public_id)
        return True

    monkeypatch.setattr(cloudinary_service, "upload_profile_photo", upload)
    monkeypatch.setattr(cloudinary_service, "delete_profile_photo", delete)
    return calls


@pytest.mark.asyncio
async def test_upload_profile_photo(client, user, auth_headers, fake_cloudinary):
    response = await client.post(
        "/auth/profile/photo",
        headers=auth_headers,
        files={"file": ("me.png", b"\x89PNG fake", "image/png")},
    )

    assert response.status_code == 200
    url = response.json()["profile_photo_url"]
    assert url.startswith("https://res.cloudinary.com/demo/") and "?v=" in url
    assert fake_cloudinary["upload"] == [(9, str(user.id), None)]


@pytest.mark.asyncio
async def test_upload_profile_photo_reuses_existing_public_id(
    client, make_user, make_auth_headers, fake_cloudinary
):
    user = await make_user(
        profile_photo_url="https://res.cloudinary.com/demo/image/upload/v9/profiles/old.jpg?x=1"
    )

    response = await client.post(
        "/auth/profile/photo",
        headers=make_auth_headers(user),
        files={"file": ("me.jpg", b"jpeg", "image/jpeg")},
    )

    assert response.status_code == 200
    assert fake_cloudinary["upload"][0][2] == "profiles/old"


@pytest.mark.asyncio
async def test_upload_profile_photo_rejects_wrong_type(
    client, auth_headers, fake_cloudinary
):
    response = await client.post(
        "/auth/profile/photo",
        headers=auth_headers,
        files={"file": ("me.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    assert fake_cloudinary["upload"] == []


@pytest.mark.asyncio
async def test_upload_profile_photo_rejects_large_file(
    client, auth_headers, fake_cloudinary
):
    response = await client.post(
        "/auth/profile/photo",
        headers=auth_headers,
        files={"file": ("big.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_profile_photo_provider_failure(client, auth_headers, monkeypatch):
    from app.services import cloudinary_service

    async def failing_upload(*args, **kwargs):
        raise ValueError("Cloudinary not configured")

    monkeypatch.setattr(cloudinary_service, "upload_profile_photo", failing_upload)

    response = await client.post(
        "/auth/profile/photo",
        headers=auth_headers,
        files={"file": ("me.png", b"png", "image/png")},
    )

    assert response.status_code == 500


@pytest.mark.asyncio
async def test_delete_profile_photo(
    client, make_user, make_auth_headers, fake_cloudinary
):
    user = await make_user(
        profile_photo_url="https://res.cloudinary.com/demo/image/upload/v2/profiles/me.jpg"
    )

    response = await client.delete(
        "/auth/profile/photo", headers=make_auth_headers(user)
    )

    assert response.status_code == 200
    assert response.json()["profile_photo_url"] is None
    assert fake_cloudinary["delete"] == ["profiles/me"]


@pytest.mark.asyncio
async def test_delete_profile_photo_non_cloudinary_url(
    client, make_user, make_auth_headers, fake_cloudinary
):
    user = await make_user(
        profile_photo_url="https://lh3.googleusercontent.com/photo.jpg"
    )

    response = await client.delete(
        "/auth/profile/photo", headers=make_auth_headers(user)
    )

    assert response.status_code == 200
    assert fake_cloudinary["delete"] == []


@pytest.mark.asyncio
async def test_delete_profile_photo_without_photo(
    client, auth_headers, fake_cloudinary
):
    response = await client.delete("/auth/profile/photo", headers=auth_headers)

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_profile_photo_provider_failure(
    client, make_user, make_auth_headers, monkeypatch
):
    from app.services import cloudinary_service

    async def failing_delete(public_id):
        raise RuntimeError("boom")

    monkeypatch.setattr(cloudinary_service, "delete_profile_photo", failing_delete)
    user = await make_user(
        profile_photo_url="https://res.cloudinary.com/demo/image/upload/profiles/me.jpg"
    )

    response = await client.delete(
        "/auth/profile/photo", headers=make_auth_headers(user)
    )

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Google sign-in (Google's endpoints are mocked at the verify/exchange boundary)
# ---------------------------------------------------------------------------


def google_claims(**overrides) -> dict:
    claims = {
        "sub": "google-sub-1",
        "email": "gina@example.com",
        "name": "Gina Rao",
        "picture": "https://lh3.googleusercontent.com/gina.jpg",
        "email_verified": True,
    }
    claims.update(overrides)
    return claims


@pytest.fixture
def google_id_token(monkeypatch):
    """Make any ID token verify to the claims stored in the returned dict."""
    claims = google_claims()

    async def verify(credential):
        return dict(claims)

    monkeypatch.setattr(google_auth, "verify_google_token", verify)
    return claims


@pytest.mark.asyncio
async def test_oauth_state_round_trip(client):
    response = await client.get("/auth/oauth/state")

    state = response.json()["state"]
    assert google_auth.validate_state_token(state) is True
    assert google_auth.validate_state_token("forged") is False


def test_expired_oauth_state_is_invalid():
    import time

    import jwt as pyjwt

    token = pyjwt.encode(
        {"exp": int(time.time()) - 5},
        settings.oauth_state_secret,
        algorithm=settings.algorithm,
    )

    assert google_auth.validate_state_token(token) is False


@pytest.mark.asyncio
async def test_google_login_new_user_returns_prefill_data(client, google_id_token):
    response = await client.post("/auth/google", json={"credential": "id-token"})

    body = response.json()
    assert response.status_code == 200
    assert body["is_new_user"] is True
    assert body["access_token"] is None
    data = body["google_user_data"]
    token = data.pop("google_signup_token")
    assert data == {
        "first_name": "Gina",
        "last_name": "Rao",
        "email": "gina@example.com",
        "google_id": "google-sub-1",
        "profile_photo_url": "https://lh3.googleusercontent.com/gina.jpg",
    }
    claims = google_auth.read_google_signup_token(token)
    assert claims and claims["sub"] == "google-sub-1"
    assert await User.find(User.email == "gina@example.com").count() == 0


async def test_google_signup_flow_creates_account_without_otp(
    client, google_id_token, outbox
):
    prefill = (
        await client.post("/auth/google", json={"credential": "id-token"})
    ).json()["google_user_data"]

    response = await client.post(
        "/auth/register/initiate",
        json=registration_payload(
            email="gina@example.com",
            google_id="client-cannot-choose-this",
            google_signup_token=prefill["google_signup_token"],
        ),
    )

    assert response.json()["skip_otp"] is True and response.json()["access_token"]
    user = await User.find_one(User.email == "gina@example.com")
    assert user is not None
    assert user.google_id == "google-sub-1"  # taken from the signed token
    assert outbox == []


@pytest.mark.parametrize(
    "token_for",
    ["other_email", "forged", "expired", "wrong_purpose"],
)
async def test_google_signup_rejects_bad_tokens(client, token_for):
    import time

    import jwt as pyjwt

    tokens = {
        "other_email": google_auth.create_google_signup_token(
            "sub-1", "someone-else@example.com"
        ),
        "forged": pyjwt.encode(
            {"purpose": "google_signup", "sub": "s", "email": "asha@example.com"},
            "an-attackers-own-key-0123456789abcdef",
            algorithm="HS256",
        ),
        "expired": pyjwt.encode(
            {
                "purpose": "google_signup",
                "sub": "s",
                "email": "asha@example.com",
                "exp": int(time.time()) - 1,
            },
            settings.secret_key,
            algorithm=settings.algorithm,
        ),
        "wrong_purpose": pyjwt.encode(
            {
                "purpose": "oauth_state",
                "sub": "s",
                "email": "asha@example.com",
                "exp": int(time.time()) + 60,
            },
            settings.secret_key,
            algorithm=settings.algorithm,
        ),
    }

    response = await client.post(
        "/auth/register/initiate",
        json=registration_payload(google_signup_token=tokens[token_for]),
    )

    assert response.status_code == 400
    assert await User.find(User.email == "asha@example.com").count() == 0


@pytest.mark.asyncio
async def test_google_login_existing_google_user(client, make_user, google_id_token):
    await make_user(email="gina@example.com", google_id="google-sub-1")

    response = await client.post(
        "/auth/google", json={"credential": "id-token", "remember_me": True}
    )

    body = response.json()
    assert body["is_new_user"] is False
    assert body["access_token"]
    user = await User.find_one(User.email == "gina@example.com")
    assert user is not None
    assert user.profile_photo_url == "https://lh3.googleusercontent.com/gina.jpg"


@pytest.mark.asyncio
async def test_google_login_links_existing_email_account(
    client, make_user, google_id_token
):
    user = await make_user(email="gina@example.com")

    response = await client.post("/auth/google", json={"credential": "id-token"})

    assert response.json()["is_new_user"] is False
    linked = await reload(user)
    assert linked.google_id == "google-sub-1"
    assert linked.profile_photo_url == "https://lh3.googleusercontent.com/gina.jpg"


@pytest.mark.asyncio
async def test_google_login_rejects_unverified_email(
    client, make_user, google_id_token
):
    await make_user(email="gina@example.com")
    google_id_token["email_verified"] = False

    response = await client.post("/auth/google", json={"credential": "id-token"})

    assert response.status_code in (400, 401, 403)


@pytest.mark.asyncio
async def test_google_login_requires_a_token(client):
    response = await client.post("/auth/google", json={})

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_google_login_code_flow(client, monkeypatch, google_id_token):
    async def exchange(code):
        assert code == "auth-code"
        return {"id_token": "id-token", "access_token": "at"}

    monkeypatch.setattr(auth_routes, "exchange_code_for_token", exchange)
    state = (await client.get("/auth/oauth/state")).json()["state"]

    response = await client.post(
        "/auth/google", json={"code": "auth-code", "state": state}
    )

    assert response.status_code == 200
    assert response.json()["is_new_user"] is True


@pytest.mark.asyncio
async def test_google_login_code_flow_rejects_bad_state(client):
    response = await client.post(
        "/auth/google", json={"code": "auth-code", "state": "forged"}
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_google_login_unexpected_error_is_500(client, monkeypatch):
    async def exchange(code):
        raise ValueError("Google OAuth credentials not configured")

    monkeypatch.setattr(auth_routes, "exchange_code_for_token", exchange)
    state = google_auth.generate_state_token()

    response = await client.post(
        "/auth/google", json={"code": "auth-code", "state": state}
    )

    assert response.status_code == 500


@pytest.mark.asyncio
async def test_google_code_flow_requires_state(client, monkeypatch):
    monkeypatch.setattr(auth_routes, "exchange_code_for_token", boom)

    response = await client.post("/auth/google", json={"code": "auth-code"})

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# RISC webhook
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_risc_webhook_accepts_valid_event(client, monkeypatch):
    async def verify(token):
        return {
            "sub": "google-sub-1",
            "events": {
                "https://schemas.openid.net/secevent/risc/event-type/sessions-revoked": {}
            },
        }

    monkeypatch.setattr(auth_routes, "verify_risc_token", verify)

    response = await client.post("/auth/risc/webhook", content=b"signed.jwt.token")

    assert response.json() == {"status": "received"}


@pytest.mark.asyncio
async def test_risc_webhook_rejects_invalid_token(client, monkeypatch):
    async def verify(token):
        raise ValueError("Invalid RISC token")

    monkeypatch.setattr(auth_routes, "verify_risc_token", verify)

    response = await client.post("/auth/risc/webhook", content=b"bad")

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_risc_webhook_unexpected_error(client, monkeypatch):
    async def verify(token):
        raise RuntimeError("boom")

    monkeypatch.setattr(auth_routes, "verify_risc_token", verify)

    response = await client.post("/auth/risc/webhook", content=b"x")

    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Unexpected failures inside auth routes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "error, status",
    [
        (HTTPException(status_code=400, detail="Email already registered"), 400),
        (RuntimeError("db down"), 500),
    ],
)
async def test_google_registration_errors(client, monkeypatch, error, status):
    async def failing_create_user(user_data):
        raise error

    monkeypatch.setattr(auth_routes, "create_user", failing_create_user)

    token = google_auth.create_google_signup_token("g-1", "asha@example.com")
    response = await client.post(
        "/auth/register/initiate", json=registration_payload(google_signup_token=token)
    )

    assert response.status_code == status


async def test_register_verify_unexpected_error(client, monkeypatch):
    await client.post("/auth/register/initiate", json=registration_payload())
    otp = await stored_otp("asha@example.com")

    async def failing_create_user(user_data):
        raise RuntimeError("db down")

    monkeypatch.setattr(auth_routes, "create_user", failing_create_user)

    response = await client.post(
        "/auth/register/verify",
        json={"user_data": registration_payload(), "otp": otp.otp},
    )

    assert response.status_code == 500


async def test_upload_profile_photo_url_with_query_string(
    client, auth_headers, monkeypatch
):
    from app.services import cloudinary_service

    async def upload(file_bytes, user_id, existing_public_id=None):
        return "https://res.cloudinary.com/demo/image/upload/p.jpg?_a=1", "p"

    monkeypatch.setattr(cloudinary_service, "upload_profile_photo", upload)

    response = await client.post(
        "/auth/profile/photo",
        headers=auth_headers,
        files={"file": ("p.png", b"png", "image/png")},
    )

    assert "?_a=1&v=" in response.json()["profile_photo_url"]


@pytest.mark.parametrize(
    "path, body",
    [
        (
            "/auth/profile/case-location-preference",
            {"case_location_preference": "random"},
        ),
        ("/auth/profile/rag-preference", {"rag_enabled": True}),
    ],
)
async def test_preference_save_failures(client, auth_headers, monkeypatch, path, body):
    monkeypatch.setattr(User, "save", boom)

    response = await client.put(path, headers=auth_headers, json=body)

    assert response.status_code == 500
