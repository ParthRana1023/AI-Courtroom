# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from app.database import init_db
from app.config import settings
from app.routes import auth, cases, arguments

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create Motor client and initialize database
    motor_client = AsyncIOMotorClient(settings.mongodb_url)
    await init_db(motor_client)
    yield
    motor_client.close()

app = FastAPI(lifespan=lifespan)

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