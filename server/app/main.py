# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from app.database import init_db
from app.config import settings, log_environment_status
from app.routes import auth, cases, arguments, rate_limit, feedback, case_analysis, parties, location, client_logs, witness
from app.services.location_service import preload_cache as preload_location_cache
from app.logging_config import setup_logging, get_logger, generate_request_id, set_request_id, get_request_id
from app.utils.datetime import get_current_datetime
from beanie.odm.fields import PydanticObjectId
import json
import time
import uvicorn

# Initialize logging first
setup_logging(log_level=settings.log_level, log_format=settings.log_format)
logger = get_logger(__name__)

# Track service start time for uptime calculation
SERVICE_START_TIME = time.time()

# Custom JSON encoder to handle PydanticObjectId
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, PydanticObjectId):
            return str(obj)
        return super().default(obj)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for request ID injection and request/response logging."""
    
    async def dispatch(self, request: Request, call_next):
        # Generate and set request ID
        request_id = request.headers.get("X-Request-ID", generate_request_id())
        set_request_id(request_id)
        
        # Log request
        start_time = time.perf_counter()
        logger.info(
            f"➡️ {request.method} {request.url.path}",
            extra={"method": request.method, "endpoint": request.url.path}
        )
        
        try:
            response = await call_next(request)
            
            # Log response
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(
                f"⬅️ {request.method} {request.url.path} → {response.status_code} ({duration_ms:.2f}ms)",
                extra={
                    "method": request.method,
                    "endpoint": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": round(duration_ms, 2)
                }
            )
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            return response
            
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                f"❌ {request.method} {request.url.path} failed after {duration_ms:.2f}ms: {str(e)}",
                extra={
                    "method": request.method,
                    "endpoint": request.url.path,
                    "duration_ms": round(duration_ms, 2)
                },
                exc_info=True
            )
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting AI Courtroom API...")
    
    # Log environment configuration
    log_environment_status()
    
    # Create Motor client and initialize database
    motor_client = AsyncIOMotorClient(settings.mongodb_url)
    
    # Use test database if in testing mode
    if settings.testing:
        logger.info(f"📦 Using test database: {settings.test_mongodb_db_name}")
    else:
        logger.info(f"📦 Using production database: {settings.mongodb_db_name}")
        
    await init_db(motor_client)
    logger.info("✅ Database initialized successfully")
    
    # Preload location cache in background (don't block startup)
    import asyncio
    asyncio.create_task(preload_location_cache())
    logger.debug("🌍 Location cache preload task started")
    
    logger.info(f"✅ AI Courtroom API started successfully on port {settings.port}")
    
    yield
    
    logger.info("🛑 Shutting down AI Courtroom API...")
    motor_client.close()
    logger.info("✅ Database connection closed")

app = FastAPI(
    title="AI Courtroom",
    lifespan=lifespan,
    # Configure JSON encoders globally
    json_encoders={PydanticObjectId: str}
)

# Add request logging middleware (before CORS)
app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://ai-courtroom-backend-v2.onrender.com", "https://ai-courtroom.vercel.app"],  # Next.js default development port
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    expose_headers=["Content-Length", "X-Request-ID"],
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
        "timestamp": get_current_datetime().isoformat(),
        "service": "AI Courtroom API",
        "request_id": get_request_id()
    }

app.include_router(auth.router, prefix="/auth")
app.include_router(cases.router, prefix="/cases")
app.include_router(arguments.router, prefix="/cases")
app.include_router(parties.router, prefix="/cases")
app.include_router(witness.router, prefix="/cases")
app.include_router(rate_limit.router, prefix="/limit")
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])
app.include_router(case_analysis.router, prefix="/cases", tags=["Case Analysis"])
app.include_router(location.router)
app.include_router(client_logs.router)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)