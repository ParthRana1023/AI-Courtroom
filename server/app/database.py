# app/database.py
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case
from app.models.case_memory import CaseMemoryChunk
from app.models.client_log import ClientLog
from app.models.feedback import Feedback
from app.models.location_cache import LocationCache
from app.models.otp import OTP
from app.models.rate_limit import RateLimitEntry
from app.models.user import User

logger = get_logger(__name__)

DOCUMENT_MODELS = [
    User,
    Case,
    Feedback,
    OTP,
    RateLimitEntry,
    LocationCache,
    ClientLog,
    CaseMemoryChunk,
]


if not hasattr(AsyncIOMotorClient, "append_metadata"):
    AsyncIOMotorClient.append_metadata = lambda self, *a, **kw: None


async def init_db(motor_client: AsyncIOMotorClient):
    """Initialize Beanie with explicit Motor client"""
    try:
        db_name = settings.current_db_name
        logger.info(f"Initializing database: {db_name}")

        await init_beanie(
            # Beanie types expect PyMongo async; we run it on Motor
            # pyrefly: ignore[bad-argument-type]
            database=motor_client[db_name],
            document_models=DOCUMENT_MODELS,
            allow_index_dropping=True,
            recreate_views=True,
        )
        logger.info(
            f"Database {db_name} initialized successfully with {len(DOCUMENT_MODELS)} models"
        )
    except Exception:
        logger.exception("Database initialization failed")
        raise
