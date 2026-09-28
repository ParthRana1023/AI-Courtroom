"""Unit tests for third-party wrappers: Cloudinary, Cloudflare images, CSC locations.

The SDK/HTTP boundary is faked (``cloudinary.uploader`` functions and
``httpx.MockTransport``), so our request building, response parsing and
error handling run without contacting any provider.
"""

import base64
import json

import cloudinary.uploader
import httpx
import pytest

from app.config import settings
from app.models.location_cache import LocationCache
from app.services import cloudinary_service as cs
from app.services import high_court_mapping as hcm
from app.services import image_generation as ig
from app.services import location_service as ls
from app.utils.datetime import get_current_datetime

# ---------------------------------------------------------------------------
# Cloudinary
# ---------------------------------------------------------------------------


@pytest.fixture
def cloudinary_configured(monkeypatch):
    monkeypatch.setattr(settings, "cloudinary_cloud_name", "demo")
    monkeypatch.setattr(settings, "cloudinary_api_key", "key")
    monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")


@pytest.fixture
def fake_uploader(monkeypatch):
    calls = {"upload": [], "destroy": []}

    def upload(file_bytes, **options):
        calls["upload"].append(options)
        public_id = f"{options['folder']}/{options['public_id']}"
        return {
            "secure_url": f"https://res.cloudinary.com/demo/image/upload/v1/{public_id}.jpg",
            "public_id": public_id,
        }

    def destroy(public_id):
        calls["destroy"].append(public_id)
        return {"result": "ok"}

    monkeypatch.setattr(cloudinary.uploader, "upload", upload)
    monkeypatch.setattr(cloudinary.uploader, "destroy", destroy)
    return calls


def test_configure_cloudinary_requires_all_credentials(
    monkeypatch, cloudinary_configured
):
    assert cs.configure_cloudinary() is True

    monkeypatch.setattr(settings, "cloudinary_api_secret", None)
    assert cs.configure_cloudinary() is False


async def test_upload_profile_photo_replaces_existing(
    cloudinary_configured, fake_uploader
):
    url, public_id = await cs.upload_profile_photo(
        b"img", "u1", existing_public_id="old/photo"
    )

    assert public_id == "ai-courtroom/profile-photos/user_u1"
    assert url.endswith("user_u1.jpg")
    assert fake_uploader["destroy"] == ["old/photo"]
    assert fake_uploader["upload"][0]["transformation"][0]["gravity"] == "face"


async def test_upload_profile_photo_ignores_failed_delete(
    cloudinary_configured, fake_uploader, monkeypatch
):
    def failing_destroy(public_id):
        raise RuntimeError("not found")

    monkeypatch.setattr(cloudinary.uploader, "destroy", failing_destroy)

    _, public_id = await cs.upload_profile_photo(
        b"img", "u1", existing_public_id="gone"
    )

    assert public_id.endswith("user_u1")


async def test_upload_profile_photo_propagates_upload_error(
    cloudinary_configured, monkeypatch
):
    def failing_upload(*args, **kwargs):
        raise RuntimeError("quota exceeded")

    monkeypatch.setattr(cloudinary.uploader, "upload", failing_upload)

    with pytest.raises(RuntimeError, match="quota exceeded"):
        await cs.upload_profile_photo(b"img", "u1")


@pytest.mark.parametrize(
    "call",
    [
        lambda: cs.upload_profile_photo(b"x", "u"),
        lambda: cs.upload_evidence_image(b"x", "CNR", "e1"),
        lambda: cs.delete_profile_photo("p"),
    ],
)
async def test_operations_fail_when_not_configured(call):
    with pytest.raises(Exception, match="not configured"):
        await call()


async def test_upload_evidence_image_sanitises_path(
    cloudinary_configured, fake_uploader
):
    _, public_id = await cs.upload_evidence_image(
        b"img", "MH/01 2026", "ev:1?", existing_public_id="prev"
    )

    assert public_id == "ai-courtroom/evidence/MH012026/evidence_ev1"
    assert fake_uploader["destroy"] == ["prev"]


async def test_upload_evidence_image_ignores_failed_delete_and_propagates_upload_error(
    cloudinary_configured, monkeypatch
):
    def failing(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(cloudinary.uploader, "destroy", failing)
    monkeypatch.setattr(cloudinary.uploader, "upload", failing)

    with pytest.raises(RuntimeError, match="provider down"):
        await cs.upload_evidence_image(b"img", "CNR", "e1", existing_public_id="prev")


@pytest.mark.parametrize(
    "destroy, expected",
    [
        (lambda pid: {"result": "ok"}, True),
        (lambda pid: {"result": "not found"}, False),
        (lambda pid: (_ for _ in ()).throw(RuntimeError("boom")), False),
    ],
)
async def test_delete_returns_whether_provider_confirmed(
    cloudinary_configured, monkeypatch, destroy, expected
):
    monkeypatch.setattr(cloudinary.uploader, "destroy", destroy)

    assert await cs.delete_profile_photo("folder/id") is expected


@pytest.mark.parametrize(
    "url, expected",
    [
        (
            "https://res.cloudinary.com/demo/image/upload/v123/profiles/me.jpg",
            "profiles/me",
        ),
        ("https://res.cloudinary.com/demo/image/upload/profiles/me.png", "profiles/me"),
        ("https://res.cloudinary.com/demo/image/upload/vnoslash", "vnoslash"),
        ("https://res.cloudinary.com/demo/image/fetch/x.jpg", None),
        ("https://example.com/me.jpg", None),
        ("", None),
    ],
)
def test_extract_public_id_from_url(url, expected):
    assert cs.extract_public_id_from_url(url) == expected


# ---------------------------------------------------------------------------
# Cloudflare Workers AI image generation
# ---------------------------------------------------------------------------

PNG_B64 = base64.b64encode(b"\x89PNG-bytes").decode()


@pytest.fixture
def cloudflare_configured(monkeypatch):
    monkeypatch.setattr(settings, "cloudflare_account_id", "acct")
    monkeypatch.setattr(settings, "cloudflare_api_token", "token")
    monkeypatch.setattr(settings, "evidence_image_model", "@cf/flux-1-schnell")
    monkeypatch.setattr(settings, "evidence_image_fallback_model", "@cf/flux-2-dev")


async def test_generate_image_requires_credentials_and_prompt(
    monkeypatch, cloudflare_configured
):
    with pytest.raises(ig.ImageGenerationError, match="empty"):
        await ig.generate_image_from_prompt("   ")

    monkeypatch.setattr(settings, "cloudflare_api_token", None)
    with pytest.raises(ig.ImageGenerationError, match="not configured"):
        await ig.generate_image_from_prompt("a court room")


async def test_generate_image_json_model_success(cloudflare_configured, mock_http):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"result": {"image": PNG_B64}})

    mock_http(ig, handler)

    assert await ig.generate_image_from_prompt(" knife on table ") == b"\x89PNG-bytes"
    assert requests[0].url.path.endswith("/ai/run/@cf/flux-1-schnell")
    assert requests[0].headers["Authorization"] == "Bearer token"
    assert json.loads(requests[0].content) == {"prompt": "knife on table", "steps": 4}


async def test_generate_image_falls_back_to_multipart_model(
    cloudflare_configured, mock_http
):
    def handler(request):
        if "flux-1" in request.url.path:
            return httpx.Response(
                503, json={"errors": [{"code": 3040, "message": "Capacity"}]}
            )
        assert request.headers["content-type"].startswith("multipart/form-data")
        return httpx.Response(200, json={"image": PNG_B64})

    mock_http(ig, handler)

    assert await ig.generate_image_from_prompt("scene") == b"\x89PNG-bytes"


async def test_generate_image_reports_rate_limit_from_last_model(
    cloudflare_configured, mock_http
):
    mock_http(ig, lambda request: httpx.Response(429, text="slow down"))

    with pytest.raises(ig.ImageGenerationError) as exc:
        await ig.generate_image_from_prompt("scene")

    assert exc.value.status_code == 429
    assert exc.value.retryable is True
    assert exc.value.model == "@cf/flux-2-dev"
    assert "rate limiting" in exc.value.user_message
    assert exc.value.provider_detail == "slow down"


@pytest.mark.parametrize(
    "response, message",
    [
        (httpx.Response(200, text="<html>"), "not JSON"),
        (
            httpx.Response(
                200, json={"success": False, "errors": [{"message": "NSFW"}]}
            ),
            "did not return image bytes",
        ),
        (
            httpx.Response(200, json={"image": "!!!not-base64!!!"}),
            "invalid image bytes",
        ),
    ],
)
async def test_generate_image_bad_provider_payloads(
    monkeypatch, cloudflare_configured, mock_http, response, message
):
    monkeypatch.setattr(settings, "evidence_image_fallback_model", "")
    mock_http(ig, lambda request: response)

    with pytest.raises(ig.ImageGenerationError, match=message):
        await ig.generate_image_from_prompt("scene")


async def test_generate_image_network_error(
    monkeypatch, cloudflare_configured, mock_http
):
    monkeypatch.setattr(settings, "evidence_image_fallback_model", "@cf/flux-1-schnell")

    def handler(request):
        raise httpx.ConnectError("dns failure")

    mock_http(ig, handler)

    with pytest.raises(ig.ImageGenerationError) as exc:
        await ig.generate_image_from_prompt("scene")
    assert "request failed" in exc.value.user_message


async def test_generate_image_without_models(monkeypatch, cloudflare_configured):
    monkeypatch.setattr(settings, "evidence_image_model", " ")
    monkeypatch.setattr(settings, "evidence_image_fallback_model", "")

    with pytest.raises(ig.ImageGenerationError, match="No evidence image model"):
        await ig.generate_image_from_prompt("scene")


@pytest.mark.parametrize(
    "data, expected",
    [
        (
            {
                "errors": [
                    {"code": 1, "message": "bad"},
                    "junk",
                    {"code": None, "message": " "},
                ]
            },
            "1 - bad",
        ),
        ({"errors": [], "message": "top level"}, "top level"),
        ({"errors": ["junk"]}, ""),
        ({}, ""),
    ],
)
def test_extract_cloudflare_error_detail(data, expected):
    assert ig._extract_cloudflare_error_detail(data) == expected


def test_extract_provider_error_detail_falls_back_to_body():
    assert ig._extract_provider_error_detail(httpx.Response(500, json=["x"])) == "['x']"
    assert (
        ig._extract_provider_error_detail(httpx.Response(500, json={"a": 1}))
        == "{'a': 1}"
    )


def test_user_error_message_includes_detail():
    assert ig._build_user_error_message("m", 500, "oops").endswith(
        "Provider message: oops"
    )
    assert "provider status 400" in ig._build_user_error_message("m", 400, "")


# ---------------------------------------------------------------------------
# High Court mapping
# ---------------------------------------------------------------------------


def test_get_all_indian_states_sorted_with_names():
    states = hcm.get_all_indian_states()

    names = [s["state_name"] for s in states]
    assert names == sorted(names)
    assert {
        "state_iso2": "MH",
        "state_name": "Maharashtra",
        "high_court": hcm.INDIAN_HIGH_COURTS["MH"],
    } in states


# ---------------------------------------------------------------------------
# Country State City location service
# ---------------------------------------------------------------------------

COUNTRIES = [
    {"name": "India", "iso2": "IN", "phonecode": "91"},
    {"name": "Nepal", "iso2": "NP", "phone_code": "977"},
]
STATES = {"IN": [{"name": "Maharashtra", "iso2": "MH"}, {"name": "Goa", "iso2": "GA"}]}
CITIES = {"IN:MH": [{"name": "Mumbai"}, {"name": "Pune"}]}


@pytest.fixture(autouse=True)
def reset_location_memory(monkeypatch):
    monkeypatch.setattr(ls, "_countries_cache", None)
    monkeypatch.setattr(ls, "_states_cache", {})
    monkeypatch.setattr(ls, "_cities_cache", {})
    monkeypatch.setattr(ls, "_all_locations_cache", None)


def csc_handler(request):
    parts = request.url.path.upper().split("/")
    assert request.headers["X-CSCAPI-KEY"] == ""
    if parts[-1] == "COUNTRIES":
        return httpx.Response(200, json=COUNTRIES)
    if parts[-1] == "STATES":
        return httpx.Response(200, json=STATES.get(parts[-2], []))
    if parts[-1] == "CITIES":
        key = f"{parts[-4]}:{parts[-2]}"
        if key == "IN:GA":
            return httpx.Response(500)
        return httpx.Response(200, json=CITIES.get(key, []))
    return httpx.Response(404)


async def test_fetchers_cache_results(mock_http):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return csc_handler(request)

    mock_http(ls, handler)

    assert await ls.get_countries() == COUNTRIES
    assert await ls.get_countries() == COUNTRIES
    assert await ls.get_states("in") == STATES["IN"]
    assert await ls.get_states("IN") == STATES["IN"]
    assert await ls.get_cities("in", "mh") == CITIES["IN:MH"]
    assert await ls.get_cities("IN", "MH") == CITIES["IN:MH"]
    assert len(calls) == 3


async def test_phone_code_lookup(mock_http):
    mock_http(ls, csc_handler)

    assert await ls.get_phone_code("in") == "91"
    assert await ls.get_phone_code("NP") == "977"
    assert await ls.get_phone_code("XX") is None


@pytest.mark.parametrize(
    "fetch",
    [ls.get_countries, lambda: ls.get_states("IN"), lambda: ls.get_cities("IN", "MH")],
)
@pytest.mark.parametrize(
    "handler, message",
    [
        (lambda r: (_ for _ in ()).throw(httpx.ReadTimeout("slow")), "timed out"),
        (lambda r: httpx.Response(401), "status 401"),
        (lambda r: (_ for _ in ()).throw(httpx.ConnectError("down")), "down"),
    ],
)
async def test_fetchers_translate_errors(mock_http, fetch, handler, message):
    mock_http(ls, handler)

    with pytest.raises(Exception, match=message):
        await fetch()


async def test_preload_builds_from_api_saves_and_searches(mock_http):
    mock_http(ls, csc_handler)

    await ls.preload_cache()

    doc = await LocationCache.find_one(
        LocationCache.cached_month == get_current_datetime().strftime("%Y-%m")
    )
    assert doc is not None
    types = [(loc["type"], loc["name"]) for loc in doc.all_locations]
    assert (
        ("city", "Mumbai") in types
        and ("state", "Goa") in types
        and ("country", "Nepal") in types
    )
    assert ("city", "Panaji") not in types  # Goa's cities failed and were skipped

    results = await ls.search_locations("pu")
    assert results[0]["name"] == "Pune"
    assert await ls.search_locations("p") == []
    assert [r["name"] for r in await ls.search_locations("mumbai")] == ["Mumbai"]
    assert [r["name"] for r in await ls.search_locations("a", limit=50)] == []
    assert "India" in [r["name"] for r in await ls.search_locations("ndi")]


async def test_preload_uses_current_month_cache_without_api():
    await LocationCache(
        cached_month=get_current_datetime().strftime("%Y-%m"),
        countries=COUNTRIES,
        all_locations=[{"type": "city", "name": "Nagpur"}],
    ).insert()

    await ls.preload_cache()  # httpx is blocked, so this must not call the API

    assert [r["name"] for r in await ls.search_locations("nag")] == ["Nagpur"]
    assert await ls.get_countries() == COUNTRIES


async def test_preload_falls_back_to_stale_cache_when_api_fails():
    await LocationCache(
        cached_month="2000-01", all_locations=[{"type": "state", "name": "Kerala"}]
    ).insert()

    await ls.preload_cache()  # API blocked, current month missing

    assert [r["name"] for r in await ls.search_locations("ker")] == ["Kerala"]


async def test_search_triggers_preload_when_empty():
    await LocationCache(
        cached_month=get_current_datetime().strftime("%Y-%m"),
        all_locations=[{"type": "country", "name": "India"}],
    ).insert()

    assert [r["name"] for r in await ls.search_locations("India")] == ["India"]


async def test_save_cache_updates_current_month_and_prunes_old(monkeypatch):
    for month in ("2000-01", "2000-02"):
        await LocationCache(cached_month=month).insert()
    await LocationCache(cached_month=get_current_datetime().strftime("%Y-%m")).insert()
    monkeypatch.setattr(ls, "_all_locations_cache", [{"type": "city", "name": "Surat"}])

    await ls._save_cache_to_db()

    months = sorted(
        doc.cached_month for doc in await LocationCache.find_all().to_list()
    )
    assert months == ["2000-02", get_current_datetime().strftime("%Y-%m")]
    current = await LocationCache.find_one(LocationCache.cached_month == months[-1])
    assert current is not None
    assert current.all_locations == [{"type": "city", "name": "Surat"}]


async def test_cache_helpers_survive_database_errors(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(LocationCache, "find_one", broken)
    monkeypatch.setattr(LocationCache, "find", broken)

    assert await ls._should_refresh_cache() is True
    assert await ls._load_cache_from_db() is False
    await ls._save_cache_to_db()  # logs and returns


def test_extract_public_id_handles_unexpected_input():
    # wrong type on purpose
    # pyrefly: ignore[bad-argument-type]
    assert cs.extract_public_id_from_url(["cloudinary"]) is None


async def test_load_cache_from_empty_database():
    assert await ls._load_cache_from_db() is False
