# app/config.py
import os
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "AI-Courtroom"
    test_mongodb_db_name: str = "AI-Courtroom-Test"
    secret_key: str = "secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    testing: bool = False

    model_config = ConfigDict(env_file=".env")

    @property
    def current_db_name(self) -> str:
        return self.test_mongodb_db_name if self.testing else self.mongodb_db_name

settings = Settings()