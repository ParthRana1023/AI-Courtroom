# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from app.database import init_db
from app.config import settings
from app.routes import auth, cases, arguments, rate_limit
from app.utils.rate_limiter import rate_limiter
from beanie.odm.fields import PydanticObjectId
import json

# Custom JSON encoder to handle PydanticObjectId
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, PydanticObjectId):
            return str(obj)
        return super().default(obj)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create Motor client and initialize database
    motor_client = AsyncIOMotorClient(settings.mongodb_url)
    
    # Use test database if in testing mode
    if settings.testing:
        print(f"Using test database: {settings.test_mongodb_db_name}")
    else:
        print(f"Using production database: {settings.mongodb_db_name}")
        
    await init_db(motor_client)
    yield
    motor_client.close()

app = FastAPI(
    title="AI Courtroom API",
    lifespan=lifespan,
    # Configure JSON encoders globally
    json_encoders={PydanticObjectId: str}
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Add your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth")
app.include_router(cases.router, prefix="/cases")
app.include_router(arguments.router, prefix="/cases")
app.include_router(rate_limit.router, prefix="/arguments")
