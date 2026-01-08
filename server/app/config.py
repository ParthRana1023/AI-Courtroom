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
    
    # Google OAuth settings
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    
    # Cloudinary settings for profile photos
    cloudinary_cloud_name: Optional[str] = None
    cloudinary_api_key: Optional[str] = None
    cloudinary_api_secret: Optional[str] = None
    
    # Email settings
    email_sender: str = "noreply@aicourtroom.com"
    email_username: str
    email_password: str
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    
    # Rate limiting settings
    case_generation_rate_limit: int = 5  # Number of case generations allowed per window
    case_generation_rate_window: int = 86400  # Window in seconds (86400 = 24 hours)
    argument_rate_limit: int = 10  # Number of arguments allowed per window
    argument_rate_window: int = 86400  # Window in seconds (86400 = 24 hours)
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def current_db_name(self) -> str:
        return self.test_mongodb_db_name if self.testing else self.mongodb_db_name

settings = Settings()

# Debug: Log environment variable status (safe - only shows if set, not actual values)
print("=" * 50)
print("🔧 Environment Variables Debug:")
print(f"  GOOGLE_CLIENT_ID: {'✅ Set' if settings.google_client_id else '❌ NOT SET'}")
print(f"  GOOGLE_CLIENT_SECRET: {'✅ Set' if settings.google_client_secret else '❌ NOT SET'}")
print(f"  GROQ_API_KEY: {'✅ Set' if settings.groq_api_key else '❌ NOT SET'}")
print(f"  MONGODB_URL: {'✅ Set' if settings.mongodb_url != 'mongodb://localhost:27017' else '⚠️ Using default'}")
print(f"  SECRET_KEY: {'✅ Set' if settings.secret_key != 'secret' else '⚠️ Using default'}")
print("=" * 50)