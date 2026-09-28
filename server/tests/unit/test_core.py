"""Unit tests for config, logging, datetime helpers, the LLM factory and app wiring."""

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, ClassVar
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from app import config as config_module
from app import database, logging_config, main
from app.config import settings
from app.schemas.user import CaseLocationPreferenceUpdate, UserCreate
from app.utils import datetime as dt
from app.utils import llm as llm_utils
from app.utils.llm import _create_llm_instance as real_create_llm_instance

# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------


def test_current_db_name_follows_testing_flag(monkeypatch):
    monkeypatch.setattr(settings, "testing", False)
    assert settings.current_db_name == settings.mongodb_db_name

    monkeypatch.setattr(settings, "testing", True)
    assert settings.current_db_name == settings.test_mongodb_db_name


def test_cors_origins_are_trimmed_deduplicated_and_include_frontend(monkeypatch):
    monkeypatch.setattr(
        settings, "cors_allowed_origins", " http://a.com/ ,http://b.com,,http://a.com"
    )
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.com/")

    assert settings.parsed_cors_allowed_origins == [
        "http://a.com",
        "http://b.com",
        "https://app.example.com",
    ]


def test_log_environment_status_reports_without_leaking_secrets(caplog):
    with caplog.at_level(logging.INFO, logger="app.config"):
        config_module.log_environment_status()

    record = next(
        r
        for r in caplog.records
        if r.getMessage() == "Environment configuration loaded"
    )
    env = record.env_config
    assert env["GROQ_API_KEY"] == "Set"
    assert env["CLOUDINARY_API_KEY"] == "NOT SET"
    assert settings.groq_api_key
    assert settings.groq_api_key not in json.dumps(env, default=str)


def test_log_environment_status_warns_about_missing_config(monkeypatch, caplog):
    for name in (
        "groq_api_key",
        "openrouter_api_key",
        "google_client_id",
        "email_username",
    ):
        monkeypatch.setattr(settings, name, None)
    monkeypatch.setattr(settings, "mongodb_url", "mongodb://localhost:27017")

    with caplog.at_level(logging.WARNING, logger="app.config"):
        config_module.log_environment_status()

    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "No LLM API keys" in messages
    assert "Google OAuth credentials not set" in messages
    assert "Email credentials not set" in messages


# ---------------------------------------------------------------------------
# datetime helpers
# ---------------------------------------------------------------------------


def test_current_datetime_is_in_india_timezone():
    now = dt.get_current_datetime()

    assert now.tzinfo == ZoneInfo("Asia/Kolkata")


def test_expiry_helpers():
    now = dt.get_current_datetime()

    assert (
        timedelta(minutes=9) < dt.create_expiry_time(10) - now < timedelta(minutes=11)
    )
    assert timedelta(minutes=14) < dt.create_jwt_expiry() - now < timedelta(minutes=16)
    assert (
        timedelta(hours=1, minutes=-1) < dt.create_jwt_expiry(timedelta(hours=1)) - now
    )


# ---------------------------------------------------------------------------
# logging_config
# ---------------------------------------------------------------------------


def make_record(msg, args=(), level=logging.INFO, name="app.test"):
    return logging.LogRecord(name, level, __file__, 1, msg, args, None)


@pytest.mark.parametrize(
    "raw, expected_fragment, secret",
    [
        ("login for john.doe@example.com", "j***@example.com", "john.doe@"),
        ("token eyJabc.eyJdef.sig123", "[REDACTED_TOKEN]", "eyJabc"),
        ('password="hunter22"', "[REDACTED]", "hunter22"),
        ("api_key=abcdefghijklmnopqrstuvwxyz", "[REDACTED_KEY]", "abcdefghijklmnop"),
    ],
)
def test_sensitive_data_filter_masks_message(raw, expected_fragment, secret):
    record = make_record(raw)

    logging_config.SensitiveDataFilter().filter(record)

    assert expected_fragment in record.msg
    assert secret not in record.msg


def test_sensitive_data_filter_masks_string_args_and_skips_dict_args():
    record = make_record("user %s id %d", ("a.b@example.com", 7))
    logging_config.SensitiveDataFilter().filter(record)
    assert record.args == ("a***@example.com", 7)

    dict_record = make_record("%(email)s", ({"email": "a.b@example.com"},))
    assert logging_config.SensitiveDataFilter().filter(dict_record) is True
    assert dict_record.args == {"email": "a.b@example.com"}


def test_request_id_filter_uses_context_value():
    logging_config.set_request_id("req-42")
    record = make_record("hello")

    logging_config.RequestIdFilter().filter(record)

    assert record.__dict__["request_id"] == "req-42"
    assert logging_config.get_request_id() == "req-42"
    assert len(logging_config.generate_request_id()) == 8


def test_compact_debug_filter_truncates_long_sdk_debug_logs():
    filt = logging_config.CompactDebugFilter()
    long_record = make_record(
        "x" * 800, level=logging.DEBUG, name="openai._base_client"
    )
    short_record = make_record("short", level=logging.DEBUG, name="groq")
    info_record = make_record("x" * 800, level=logging.INFO, name="openai")
    app_record = make_record("x" * 800, level=logging.DEBUG, name="app.routes")

    for record in (long_record, short_record, info_record, app_record):
        assert filt.filter(record) is True

    assert "truncated 100 chars" in long_record.msg
    assert short_record.msg == "short"
    assert info_record.msg == app_record.msg == "x" * 800


def test_colored_formatter_restores_levelname():
    record = make_record("hi", level=logging.WARNING)

    output = logging_config.ColoredFormatter("%(levelname)s %(message)s").format(record)

    assert "\033[33mWARNING\033[0m hi" == output
    assert record.levelname == "WARNING"


def test_json_formatter_includes_extras_and_exception():
    record = make_record("done")
    record.request_id = "r1"
    for key, value in {
        "duration_ms": 12.5,
        "user_id": "u1",
        "endpoint": "/x",
        "method": "GET",
        "status_code": 200,
    }.items():
        setattr(record, key, value)
    try:
        raise ValueError("bad")
    except ValueError:
        import sys

        record.exc_info = sys.exc_info()

    data = json.loads(logging_config.JsonFormatter().format(record))

    assert data["message"] == "done" and data["request_id"] == "r1"
    assert data["status_code"] == 200 and data["duration_ms"] == 12.5
    assert "ValueError: bad" in data["exception"]


@pytest.mark.parametrize(
    "fmt, formatter_type", [("json", "JsonFormatter"), ("text", "ColoredFormatter")]
)
def test_setup_logging_installs_single_handler(fmt, formatter_type):
    root = logging.getLogger()
    saved_handlers, saved_level = root.handlers[:], root.level
    try:
        logging_config.setup_logging("debug", fmt)

        handlers = [h for h in root.handlers if isinstance(h, logging.StreamHandler)]
        assert len(handlers) == 1
        assert type(handlers[0].formatter).__name__ == formatter_type
        assert root.level == logging.DEBUG
        assert logging.getLogger("pymongo").level == logging.WARNING
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)


@pytest.mark.asyncio
async def test_log_execution_time_async(caplog):
    logger = logging.getLogger("app.timing")

    @logging_config.log_execution_time(logger, "async op")
    async def ok():
        return 5

    @logging_config.log_execution_time(logger, "async fail")
    async def fail():
        raise RuntimeError("nope")

    with caplog.at_level(logging.INFO, logger="app.timing"):
        assert await ok() == 5
        with pytest.raises(RuntimeError):
            await fail()

    text = caplog.text
    assert "async op completed" in text and "async fail failed" in text


def test_log_execution_time_sync(caplog):
    logger = logging.getLogger("app.timing")

    @logging_config.log_execution_time(logger, "sync op")
    def ok(x):
        return x * 2

    @logging_config.log_execution_time(logger)
    def fail():
        raise KeyError("k")

    with caplog.at_level(logging.INFO, logger="app.timing"):
        assert ok(4) == 8
        with pytest.raises(KeyError):
            fail()

    assert "sync op completed" in caplog.text
    assert "Operation failed" in caplog.text


# ---------------------------------------------------------------------------
# LLM factory (model objects are built, never called)
# ---------------------------------------------------------------------------


def test_create_llm_instance_builds_each_provider():
    groq = real_create_llm_instance("groq", "llama-3.3-70b-versatile")
    openrouter = real_create_llm_instance("openrouter", "some/model:free")

    assert type(groq).__name__ == "ChatGroq"
    assert isinstance(openrouter, ChatOpenAI)
    assert openrouter.openai_api_base == "https://openrouter.ai/api/v1"


def test_create_llm_instance_rejects_unknown_provider():
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        real_create_llm_instance("cohere", "x")


def test_get_llm_rejects_unknown_task():
    with pytest.raises(ValueError, match="Unknown LLM task"):
        llm_utils.get_llm("poet")


def test_get_llm_uses_configured_primary_and_fallback(monkeypatch):
    built = []
    monkeypatch.setattr(
        llm_utils,
        "_create_llm_instance",
        lambda provider, model_id: built.append((provider, model_id))
        or real_create_llm_instance("groq", "m"),
    )
    llm_utils.get_llm.cache_clear()

    llm_utils.get_llm("judge")

    assert built == [
        (settings.judge_provider, settings.judge_model),
        (settings.judge_fallback_provider, settings.judge_fallback_model),
    ]


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------


def user_create(**overrides):
    data: dict[str, Any] = {
        "first_name": "A",
        "last_name": "B",
        "date_of_birth": date(1990, 1, 1),
        "phone_number": "(987) 654-3210",
        "email": "a@example.com",
        "password": "Password1!",
        "gender": "others",
        "city": "Pune",
        "state": "Maharashtra",
        "state_iso2": "MH",
        "country": "India",
        "country_iso2": "IN",
    }
    data.update(overrides)
    return UserCreate(**data)


def test_user_create_normalises_phone_number():
    assert user_create().phone_number == "9876543210"


def test_user_create_accepts_exactly_18_years_old():
    today = dt.get_current_datetime().date()
    try:
        birthday = today.replace(year=today.year - 18)
    except ValueError:  # 29 Feb
        birthday = today.replace(year=today.year - 18, day=28)

    assert user_create(date_of_birth=birthday).date_of_birth == birthday


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"phone_number": "123"}, "exactly 10 digits"),
        (
            {
                "date_of_birth": dt.get_current_datetime().date()
                - timedelta(days=365 * 17)
            },
            "at least 18",
        ),
        ({"password": "Pa1!"}, "at least 8"),
        ({"password": "Password!"}, "1 digit"),
        ({"password": "12345678!"}, "1 letter"),
        ({"password": "Password1"}, "special character"),
    ],
)
def test_user_create_validation_messages(overrides, message):
    with pytest.raises(ValidationError, match=message):
        user_create(**overrides)


def test_case_location_preference_requires_state_only_for_specific_state():
    assert (
        CaseLocationPreferenceUpdate(
            case_location_preference="random"
        ).preferred_case_state
        is None
    )
    with pytest.raises(ValidationError, match="preferred_case_state is required"):
        CaseLocationPreferenceUpdate(case_location_preference="specific_state")


# ---------------------------------------------------------------------------
# App wiring: main.py and database.py
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_root_endpoint(client):
    response = await client.get("/")

    assert response.json() == {"message": "Welcome to AI Courtroom API!"}


@pytest.mark.asyncio
async def test_request_id_header_is_echoed(client):
    response = await client.get("/health", headers={"X-Request-ID": "abc123"})

    assert response.headers["X-Request-ID"] == "abc123"
    assert response.json()["request_id"] == "abc123"


@pytest.mark.asyncio
async def test_middleware_logs_and_reraises_unhandled_errors(monkeypatch):
    middleware = main.RequestLoggingMiddleware(app=main.app)

    class FakeRequest:
        headers: ClassVar[dict] = {}
        method = "GET"

        class url:
            path = "/boom"

    async def call_next(request):
        raise RuntimeError("handler exploded")

    with pytest.raises(RuntimeError, match="handler exploded"):
        # minimal fake
        # pyrefly: ignore[bad-argument-type]
        await middleware.dispatch(FakeRequest(), call_next)


@pytest.mark.parametrize("testing", [True, False])
@pytest.mark.asyncio
async def test_lifespan_initialises_database_and_preloads_locations(
    monkeypatch, testing
):
    from mongomock_motor import AsyncMongoMockClient

    monkeypatch.setattr(settings, "testing", testing)

    client = AsyncMongoMockClient()
    preloaded = []

    async def fake_preload():
        preloaded.append(True)

    monkeypatch.setattr(main, "AsyncIOMotorClient", lambda url: client)
    monkeypatch.setattr(main, "preload_location_cache", fake_preload)
    cases = client[settings.current_db_name]["cases"]
    await cases.insert_one({"cnr": "STUCK", "is_ai_examining": True})

    async with main.lifespan(main.app):
        import asyncio

        await asyncio.sleep(0)  # let the preload task run

    assert preloaded == [True]
    stuck = await cases.find_one({"cnr": "STUCK"})
    assert stuck is not None and stuck["is_ai_examining"] is False


@pytest.mark.asyncio
async def test_init_db_uses_production_name_when_not_testing(monkeypatch):
    from mongomock_motor import AsyncMongoMockClient

    monkeypatch.setattr(settings, "testing", False)
    client = AsyncMongoMockClient()

    await database.init_db(client)

    from app.models.user import User

    assert User.get_pymongo_collection().database.name == settings.mongodb_db_name


@pytest.mark.asyncio
async def test_init_db_reraises_failures(monkeypatch):
    async def broken_init(**kwargs):
        raise RuntimeError("cannot connect")

    monkeypatch.setattr(database, "init_beanie", broken_init)

    with pytest.raises(RuntimeError, match="cannot connect"):
        await database.init_db(MagicMock())


def test_timezone_constant():
    assert dt.get_timezone() == ZoneInfo(dt.DEFAULT_TIMEZONE)
    assert isinstance(dt.get_current_datetime(), datetime)


def test_settings_come_from_test_env_not_dotenv():
    assert settings.testing is True
    assert settings.mongodb_url.startswith("mongodb://127.0.0.1:1/")
    assert settings.groq_api_key == "test-groq-key"
    assert settings.openrouter_api_key == "test-openrouter-key"


async def test_fake_llm_error_fails_primary_and_fallback(fake_llm):
    fake_llm.error = RuntimeError("provider down")

    with pytest.raises(RuntimeError, match="provider down"):
        await llm_utils.get_llm("judge").ainvoke("hello")
    assert len(fake_llm.calls) == 2  # primary, then fallback


@pytest.mark.parametrize("bad", ["", "secret", "another-secret", "short-but-random"])
@pytest.mark.parametrize("field", ["SECRET_KEY", "OAUTH_STATE_SECRET"])
def test_settings_refuse_weak_secrets_outside_tests(monkeypatch, field, bad):
    monkeypatch.setenv("TESTING", "false")
    monkeypatch.setenv(field, bad)

    with pytest.raises(ValidationError, match=field):
        config_module.Settings()


def test_settings_accept_strong_secrets_and_skip_check_in_tests(monkeypatch):
    monkeypatch.setenv("TESTING", "false")
    assert config_module.Settings().secret_key == settings.secret_key

    monkeypatch.setenv("TESTING", "true")
    monkeypatch.setenv("SECRET_KEY", "")
    assert config_module.Settings().secret_key == ""


def test_get_session_rejects_invalid_token():
    from fastapi import HTTPException

    from app.dependencies import get_session

    with pytest.raises(HTTPException) as exc:
        get_session("not-a-jwt")

    assert exc.value.status_code == 401
