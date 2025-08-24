# app/config.py
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "AI-Courtroom"
    test_mongodb_db_name: str = "AI-Courtroom-Test"
    secret_key: str = "secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    extended_token_expire_days: int = 7
    testing: bool = False
    groq_api_key: Optional[str] = None
    port: int = 8000
    
    # Email settings
    email_sender: str = "noreply@aicourtroom.com"
    email_username: str
    email_password: str
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def current_db_name(self) -> str:
        return self.test_mongodb_db_name if self.testing else self.mongodb_db_name

settings = Settings()