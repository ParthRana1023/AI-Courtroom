import motor.motor_asyncio
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "chatbot")

class MongoDB:
    def __init__(self):
        self.client = None
        self.db = None

    async def connect(self):
        if self.client is None:
            self.client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
            self.db = self.client[DATABASE_NAME]
            print(f"Connected to MongoDB: {MONGO_URI}, Database: {DATABASE_NAME}")

    async def close(self):
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
            print("MongoDB connection closed.")

mongodb = MongoDB()
