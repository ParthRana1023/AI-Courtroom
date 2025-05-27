# app/database.py
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.models.user import User
from app.models.case import Case
from app.models.feedback import Feedback
from beanie import init_beanie
from app.models.otp import OTP

# In the init_db function, add OTP to the models list
async def init_db(motor_client: AsyncIOMotorClient):
    """Initialize Beanie with explicit Motor client"""
    try:
        # Use test database name if in testing mode
        db_name = settings.test_mongodb_db_name if settings.testing else settings.mongodb_db_name
        print(f"Initializing database: {db_name}")
        
        await init_beanie(
            database=motor_client[db_name],
            document_models=[User, Case, Feedback],
            allow_index_dropping=True,
            recreate_views=True
        )
    except Exception as e:
        print(f"Database initialization failed: {str(e)}")
        raise