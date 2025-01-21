from fastapi import APIRouter, HTTPException, Depends
from models import User, LoginUser
from argon2 import PasswordHasher
from utils import create_access_token
from database.db_connection import mongodb

auth_router = APIRouter()
ph = PasswordHasher()

@auth_router.post("/register")
async def register(user: User):
    await mongodb.connect()
    existing_user = await mongodb.db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash and store user
    user.password = ph.hash(user.password)
    await mongodb.db.users.insert_one(user.model_dump())
    return {"message": "User registered successfully!"}

@auth_router.post("/login")
async def login(user: LoginUser):
    await mongodb.connect()
    query_field = "email" if "@" in user.username_or_email else "username"
    db_user = await mongodb.db.users.find_one({query_field: user.username_or_email})
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid username/email or password")

    try:
        ph.verify(db_user["password"], user.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid username/email or password")

    access_token = create_access_token({"sub": db_user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}
