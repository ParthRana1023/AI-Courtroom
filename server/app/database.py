# app/database.py
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.models.user import User
from app.models.case import Case
from app.models.feedback import Feedback
from beanie import init_beanie
from app.models.otp import OTP
from app.models.rate_limit import RateLimitEntry
from app.models.location_cache import LocationCache
from app.logging_config import get_logger

logger = get_logger(__name__)

async def init_db(motor_client: AsyncIOMotorClient):
    """Initialize Beanie with explicit Motor client"""
    try:
        # Use test database name if in testing mode
        db_name = settings.test_mongodb_db_name if settings.testing else settings.mongodb_db_name
        logger.info(f"Initializing database: {db_name}")
        
        await init_beanie(
            database=motor_client[db_name],
            document_models=[User, Case, Feedback, OTP, RateLimitEntry, LocationCache],
            allow_index_dropping=True,
            recreate_views=True
        )
        logger.info(f"Database {db_name} initialized successfully with {len([User, Case, Feedback, OTP, RateLimitEntry, LocationCache])} models")
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}", exc_info=True)
        raise