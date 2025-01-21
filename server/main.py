from fastapi import FastAPI
from routes.auth import auth_router
from routes.chat import chat_router
from fastapi.middleware.cors import CORSMiddleware
from database.db_connection import mongodb
from contextlib import asynccontextmanager

app = FastAPI(
    lifespan=asynccontextmanager(lambda app: manage_db_connection())
)

async def manage_db_connection():
    await mongodb.connect()
    yield
    await mongodb.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace "*" with your frontend URL for better security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(chat_router, prefix="/chat", tags=["Chat"])

@app.get("/")
def root():
    return {"message": "API is running!"}
