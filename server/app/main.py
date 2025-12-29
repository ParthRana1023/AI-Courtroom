# app/main.py
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from app.database import init_db
from app.config import settings
from app.routes import auth, cases, arguments, rate_limit, feedback, case_analysis, people
from beanie.odm.fields import PydanticObjectId
import json
import time
import uvicorn

# Track service start time for uptime calculation
SERVICE_START_TIME = time.time()

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
    title="AI Courtroom",
    lifespan=lifespan,
    # Configure JSON encoders globally
    json_encoders={PydanticObjectId: str}
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://ai-courtroom-backend-v2.onrender.com", "https://ai-courtroom.vercel.app"],  # Next.js default development port
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    expose_headers=["Content-Length"],
    max_age=3600,
)

@app.get("/")
async def read_root():
    return {"message": "Welcome to AI Courtroom API!"}

@app.get("/health")
async def health_check():
    """
    Health check endpoint for Render monitoring.
    Returns service status, uptime, and timestamp.
    """
    return {
        "status": "healthy",
        "uptime_seconds": round(time.time() - SERVICE_START_TIME, 2),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "AI Courtroom API"
    }

app.include_router(auth.router, prefix="/auth")
app.include_router(cases.router, prefix="/cases")
app.include_router(arguments.router, prefix="/cases")
app.include_router(people.router, prefix="/cases")
app.include_router(rate_limit.router, prefix="/limit")
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])
app.include_router(case_analysis.router, prefix="/cases", tags=["Case Analysis"])

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)