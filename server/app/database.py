# app/database.py
from beanie import init_beanie
from pymongo import AsyncMongoClient

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case
from app.models.case_memory import CaseMemoryChunk
from app.models.case_outcome import CaseOutcomeRecord
from app.models.client_log import ClientLog
from app.models.cnr_counter import CnrCounter
from app.models.feedback import Feedback
from app.models.location_cache import LocationCache
from app.models.otp import OTP
from app.models.rate_limit import RateLimitEntry
from app.models.user import User
from app.models.user_session import UserSession

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
    CnrCounter,
    CaseOutcomeRecord,
    UserSession,
]


async def init_db(client: AsyncMongoClient):
    """Initialize Beanie on PyMongo's async client."""
    try:
        db_name = settings.current_db_name
        logger.info(f"Initializing database: {db_name}")

        await init_beanie(
            database=client[db_name],
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
