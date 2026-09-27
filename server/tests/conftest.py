"""Shared pytest fixtures.

Every test runs against an isolated MongoDB database, a scripted fake LLM, a
fake embedder and a captured email outbox, so the suite never touches the
real services configured in ``server/.env``.

The database is in-memory (mongomock-motor) by default. Set TEST_MONGODB_URL
(e.g. mongodb://localhost:27017) to run the same tests against a real MongoDB
server through Motor, exactly as production does; each test then gets its own
throwaway database.
"""

import hashlib
import itertools
import os
import sys
import types
import uuid
import warnings
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Settings() is built at import time and also reads server/.env, which holds
# real credentials. Process env vars take precedence over .env, so these are
# assigned (not setdefault) before any `app` import to keep tests offline.
_TEST_ENV = {
    "TESTING": "true",
    # Unreachable on purpose: nothing in the tests may reach the real database.
    "MONGODB_URL": "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=100",
    "SECRET_KEY": "test-secret-key-0123456789abcdef0123456789",
    "OAUTH_STATE_SECRET": "test-oauth-state-secret-0123456789abcdef",
    "GROQ_API_KEY": "test-groq-key",
    "OPENROUTER_API_KEY": "test-openrouter-key",
    "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "test-google-secret",
    "CLOUDINARY_CLOUD_NAME": "",
    "CLOUDINARY_API_KEY": "",
    "CLOUDINARY_API_SECRET": "",
    "CLOUDINARY_URL": "",
    "CLOUDFLARE_ACCOUNT_ID": "",
    "CLOUDFLARE_API_TOKEN": "",
    "CSC_API_KEY": "",
    "EMAIL_USERNAME": "test@example.com",
    "EMAIL_PASSWORD": "test-password",
    "RAG_ENABLED": "true",
    "CASE_GENERATION_RATE_LIMIT": "5",
    "CASE_GENERATION_RATE_WINDOW": "86400",
    "ARGUMENT_RATE_LIMIT": "10",
    "ARGUMENT_RATE_WINDOW": "86400",
    "LOG_LEVEL": "WARNING",
    "LOG_FORMAT": "text",
}
os.environ.update(_TEST_ENV)
REAL_MONGODB_URL = os.environ.get("TEST_MONGODB_URL")

# Import-time noise from langchain on Python 3.14; must be filtered before the
# import below. Our code does not use Pydantic V1.
warnings.filterwarnings(
    "ignore", message="Core Pydantic V1 functionality", category=UserWarning
)

import httpx
import pytest
import pytest_asyncio
from beanie import init_beanie
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import Field

from app.config import settings
from app.database import DOCUMENT_MODELS
from app.models.case import Case
from app.models.user import User
from app.services import email as email_service
from app.services.auth import create_access_token, ph
from app.services.rag import service as rag_service
from app.utils import llm as llm_utils

TEST_PASSWORD = "Password123!"


def pytest_configure(config):
    # server/pyproject.toml sets asyncio_mode = "auto", but pytest only reads it
    # when the given path is under server/. Running from the repo root (or the
    # VS Code test runner, which passes ".") would fall back to strict mode and
    # fail every unmarked async test with "async def functions are not natively
    # supported". Setting it here works however the suite is launched.
    config.option.asyncio_mode = "auto"
    # Same reason: keep this filter here rather than in pyproject.toml. The
    # deprecation comes from inside Beanie and lazy_model, not from our code.
    config.addinivalue_line(
        "filterwarnings",
        "ignore:Accessing the 'model_fields' attribute on the instance:DeprecationWarning",
    )


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def db():
    """Fresh database with all Beanie models initialised."""
    if REAL_MONGODB_URL:
        client = AsyncIOMotorClient(REAL_MONGODB_URL, serverSelectionTimeoutMS=5000)
        database = client[f"ai_courtroom_test_{uuid.uuid4().hex[:12]}"]
    else:
        client = AsyncMongoMockClient()
        database = client[settings.current_db_name]
    # Beanie types expect PyMongo async; we run it on Motor
    # pyrefly: ignore[bad-argument-type]
    await init_beanie(database=database, document_models=DOCUMENT_MODELS)
    yield database
    if REAL_MONGODB_URL:
        await client.drop_database(database.name)
        client.close()


# ---------------------------------------------------------------------------
# External services
# ---------------------------------------------------------------------------


class FakeChatModel(BaseChatModel):
    """Scripted chat model that records every prompt it receives.

    Queue replies with ``responses``, or set ``responder`` to a function of
    the prompt text for calls whose order is not fixed (asyncio.gather). Set
    ``error`` to make every call raise (primary and fallback share this
    instance, so the whole chain fails).
    """

    responses: list[str] = Field(default_factory=list)
    responder: Callable[[str], str] | None = None
    default_response: str = "Fake LLM response for tests."
    error: Exception | None = None
    calls: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs: Any):
        self.calls.append(list(messages))
        if self.error is not None:
            raise self.error
        if self.responder is not None:
            text = self.responder("\n".join(str(m.content) for m in messages))
        elif self.responses:
            text = self.responses.pop(0)
        else:
            text = self.default_response
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=text))])

    @property
    def prompts(self) -> list[str]:
        """Each call's messages joined into one string, for easy assertions."""
        return ["\n".join(str(m.content) for m in call) for call in self.calls]


@pytest.fixture(autouse=True)
def fake_llm(monkeypatch):
    """Replace every task model from ``get_llm`` with one FakeChatModel."""
    model = FakeChatModel()
    monkeypatch.setattr(
        llm_utils, "_create_llm_instance", lambda provider, model_id: model
    )
    llm_utils.get_llm.cache_clear()
    yield model
    llm_utils.get_llm.cache_clear()


def _fake_embedding(text: str, dims: int = 32) -> list[float]:
    """Deterministic bag-of-words vector; shared words give higher similarity."""
    vector = [0.0] * dims
    for word in text.lower().split():
        bucket = int(hashlib.md5(word.encode()).hexdigest(), 16) % dims
        vector[bucket] += 1.0
    magnitude = sum(v * v for v in vector) ** 0.5
    return [v / magnitude for v in vector] if magnitude else vector


@pytest.fixture(autouse=True)
def fake_embeddings(monkeypatch):
    """Keep sentence-transformers (and PyTorch) out of the test run."""

    async def embed_texts(texts):
        return [_fake_embedding(text) for text in texts]

    async def embed_query(text):
        return _fake_embedding(text)

    monkeypatch.setattr(rag_service, "embed_texts", embed_texts)
    monkeypatch.setattr(rag_service, "embed_query", embed_query)


class ThirdPartyCallBlocked(RuntimeError):
    """Raised when a test reaches a real third-party API without mocking it."""


def _blocked(name: str):
    def _raise(*args, **kwargs):
        raise ThirdPartyCallBlocked(f"Unmocked third-party call: {name}")

    return _raise


def _httpx_stub(handler=None) -> types.SimpleNamespace:
    """Stand-in for the ``httpx`` module inside one service module.

    With no handler every request is blocked; with a handler, requests go to
    ``httpx.MockTransport(handler)``. The module reference is swapped rather
    than ``httpx.AsyncClient`` itself because the test client uses the real one.
    """

    def async_client(*args, **kwargs):
        if handler is None:
            raise ThirdPartyCallBlocked("Unmocked httpx.AsyncClient")
        kwargs.pop("transport", None)
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    return types.SimpleNamespace(
        AsyncClient=async_client,
        Response=httpx.Response,
        TimeoutException=httpx.TimeoutException,
        HTTPError=httpx.HTTPError,
        HTTPStatusError=httpx.HTTPStatusError,
        RequestError=httpx.RequestError,
    )


@pytest.fixture(autouse=True)
def block_third_party_calls(monkeypatch):
    """Block every third-party client at the library boundary.

    Our own wrappers (google_auth, cloudinary_service, image_generation,
    location_service) still run; only the outbound call is stopped. Tests
    that need a provider response patch the same boundary with a fake.
    """
    import urllib.request

    import cloudinary.uploader
    from google.oauth2 import id_token

    from app.services import image_generation, location_service

    monkeypatch.setattr(cloudinary.uploader, "upload", _blocked("cloudinary upload"))
    monkeypatch.setattr(cloudinary.uploader, "destroy", _blocked("cloudinary destroy"))
    monkeypatch.setattr(
        id_token, "verify_oauth2_token", _blocked("Google token verify")
    )
    monkeypatch.setattr(urllib.request, "urlopen", _blocked("urllib.request.urlopen"))
    monkeypatch.setattr(image_generation, "httpx", _httpx_stub())
    monkeypatch.setattr(location_service, "httpx", _httpx_stub())


@pytest.fixture
def mock_http(monkeypatch):
    """Route one module's httpx calls to a handler: ``mock_http(module, handler)``."""

    def _install(module, handler):
        monkeypatch.setattr(module, "httpx", _httpx_stub(handler))

    return _install


@pytest.fixture
def image_pipeline(monkeypatch):
    """Fake Cloudflare generation and Cloudinary upload as evidence_service sees them.

    Set ``state["fail"]`` to an exception to make generation fail.
    """
    from app.services import evidence_service

    state = {"fail": None, "uploads": []}

    async def generate(prompt):
        if state["fail"]:
            raise state["fail"]
        return b"png"

    async def upload(image_bytes, cnr, evidence_id, existing_public_id=None):
        state["uploads"].append(evidence_id)
        return f"https://img/{evidence_id}.png", f"evidence/{evidence_id}"

    monkeypatch.setattr(evidence_service, "generate_image_from_prompt", generate)
    monkeypatch.setattr(evidence_service, "upload_evidence_image", upload)
    return state


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    """Capture outgoing email by replacing smtplib.SMTP with a recorder."""
    sent: list[dict] = []

    class RecordingSMTP:
        def __init__(self, host, port):
            self.host, self.port = host, port

        def starttls(self):
            pass

        def login(self, username, password):
            pass

        def send_message(self, message):
            body = message.get_payload()[0].get_payload()
            sent.append(
                {"to": message["To"], "subject": message["Subject"], "body": body}
            )

        def quit(self):
            pass

    monkeypatch.setattr(email_service.smtplib, "SMTP", RecordingSMTP)
    return sent


# ---------------------------------------------------------------------------
# App and data factories
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    """HTTP client bound to the FastAPI app (lifespan is not run)."""
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


_counter = itertools.count(1)


@pytest.fixture
def make_user():
    async def _make(**overrides) -> User:
        n = next(_counter)
        data = {
            "first_name": "Test",
            "last_name": f"User{n}",
            "date_of_birth": date(2000, 1, 1),
            "phone_number": "9999999999",
            "email": f"user{n}@example.com",
            "password_hash": ph.hash(TEST_PASSWORD),
        }
        data.update(overrides)
        return await User(**data).insert()

    return _make


@pytest.fixture
def make_case():
    async def _make(user: User, **overrides) -> Case:
        n = next(_counter)
        data = {
            "cnr": f"TEST{n:012d}",
            "title": f"Test Case {n}",
            "details": "The plaintiff alleges breach of contract by the defendant.",
            "user_id": user.id,
        }
        data.update(overrides)
        return await Case(**data).insert()

    return _make


@pytest.fixture
def make_auth_headers():
    """Bearer headers carrying a real JWT, so get_current_user runs unmodified."""

    def _make(user: User) -> dict:
        token = create_access_token(data={"sub": user.email})
        return {"Authorization": f"Bearer {token}"}

    return _make


@pytest_asyncio.fixture
async def user(make_user) -> User:
    return await make_user()


@pytest.fixture
def auth_headers(user, make_auth_headers) -> dict:
    return make_auth_headers(user)
