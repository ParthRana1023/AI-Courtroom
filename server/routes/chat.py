from fastapi import APIRouter, HTTPException, Depends
from models import ChatMessage
import motor.motor_asyncio

chat_router = APIRouter()
client = motor.motor_asyncio.AsyncIOMotorClient("mongodb://localhost:27017")
db = client.chatbot

@chat_router.post("/save_chat")
async def save_chat(chat_message: ChatMessage):
    await db.chat_history.insert_one(chat_message.dict())
    return {"message": "Chat saved successfully"}

@chat_router.get("/get_chat_history")
async def get_chat_history(user_id: str):
    history = await db.chat_history.find({"user_id": user_id}).to_list(100)
    return {"chat_history": history}
