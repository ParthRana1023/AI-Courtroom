# app/database.py
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.models.user import User
from app.models.case import Case
from beanie import init_beanie

async def init_db(motor_client: AsyncIOMotorClient):
    """Initialize Beanie with explicit Motor client"""
    try:
        await init_beanie(
            database=motor_client[settings.mongodb_db_name],
            document_models=[User, Case],
            allow_index_dropping=True,
            recreate_views=True
        )
    except Exception as e:
        print(f"Database initialization failed: {str(e)}")
        raise