from fastapi import APIRouter, HTTPException
from models import ChatMessage, Argument
from database.db_connection import mongodb

chat_router = APIRouter()

@chat_router.post("/save_chat")
async def save_chat(chat_message: ChatMessage):
    await mongodb.connect()
    await mongodb.db.chat_history.insert_one(chat_message.model_dump())
    return {"message": "Chat saved successfully"}

@chat_router.get("/get_chat_history")
async def get_chat_history(user_id: str):
    await mongodb.connect()
    history = await mongodb.db.chat_history.find({"user_id": user_id}).to_list(100)
    return {"chat_history": history}

@chat_router.post("/submit_argument")
async def submit_argument(argument: Argument):
    await mongodb.connect()
    response = f"Counter to your argument: {argument.user_argument[::-1]}"
    
    await mongodb.db.chat_history.insert_one({
        "user_id": argument.user_id,
        "case_id": argument.case_id,
        "user_argument": argument.user_argument,
        "response": response,
        "role": argument.role
    })
    
    return {"response": response}
