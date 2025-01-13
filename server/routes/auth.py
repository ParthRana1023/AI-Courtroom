from fastapi import APIRouter, HTTPException
from models import User, LoginUser
import motor.motor_asyncio
from argon2 import PasswordHasher

auth_router = APIRouter()
client = motor.motor_asyncio.AsyncIOMotorClient("mongodb://localhost:27017")
db = client.chatbot  # Replace 'chatbot' with your database name if different

# Initialize Argon2 password hasher
ph = PasswordHasher()

# Registration route
@auth_router.post("/register")
async def register(user: User):
    # Check if the email is already registered
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check if the username is already taken
    existing_username = await db.users.find_one({"username": user.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    # Hash the password using Argon2
    hashed_password = ph.hash(user.password)
    user.password = hashed_password  # Store the hashed password as a string

    # Insert the user into the database
    await db.users.insert_one(user.model_dump())  # Use .dict() instead of model_dump
    return {"message": "User registered successfully!"}

# Login route
@auth_router.post("/login")
async def login(user: LoginUser):
    # Determine whether input is email or username (case-insensitive)
    query_field = "email" if "@" in user.username_or_email else "username"
    db_user = await db.users.find_one({query_field: user.username_or_email})

    # Debugging output
    print(f"Searching for user by {query_field}: {user.username_or_email}")

    # Check if user exists
    if db_user:
        print(f"User found: {db_user}")
    else:
        print("User not found")

    # Verify user exists and password matches using Argon2
    try:
        # Debugging output to check the values
        print(f"Stored hash: {db_user['password']}")
        print(f"Entered password: {user.password}")
        ph.verify(db_user["password"], user.password)
    except Exception as e:
        print(f"Error verifying password: {e}")
        raise HTTPException(status_code=400, detail="Invalid username/email or password")

    # Generate a token (e.g., JWT)
    return {"access_token": "your_generated_token", "token_type": "bearer"}
