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
    csc_api_key: Optional[str] = None  # Country State City API key
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
    
    # Logging settings
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR
    log_format: str = "json"  # json (production) or text (development)
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def current_db_name(self) -> str:
        return self.test_mongodb_db_name if self.testing else self.mongodb_db_name

settings = Settings()

def log_environment_status():
    """Log environment variable status on startup (called from main.py after logging is set up)"""
    from app.logging_config import get_logger
    logger = get_logger(__name__)
    
    # helper to check if a value is set without revealing it
    def is_set(val):
        return "Set" if val else "NOT SET"
        
    env_status = {
        # Database
        "MONGODB_URL": "Set" if settings.mongodb_url != "mongodb://localhost:27017" else "Using default",
        "MONGODB_DB_NAME": settings.mongodb_db_name,
        "TEST_MONGODB_DB_NAME": settings.test_mongodb_db_name,
        
        # Security
        "SECRET_KEY": "Set" if settings.secret_key != "secret" else "Using default (UNSAFE)",
        "ALGORITHM": settings.algorithm,
        "ACCESS_TOKEN_EXPIRE_MINUTES": settings.access_token_expire_minutes,
        "EXTENDED_TOKEN_EXPIRE_DAYS": settings.extended_token_expire_days,
        
        # Environment
        "TESTING": settings.testing,
        "PORT": settings.port,
        
        # API Keys & External Services
        "GROQ_API_KEY": is_set(settings.groq_api_key),
        "CSC_API_KEY": is_set(settings.csc_api_key),
        
        # Google OAuth
        "GOOGLE_CLIENT_ID": is_set(settings.google_client_id),
        "GOOGLE_CLIENT_SECRET": is_set(settings.google_client_secret),
        
        # Cloudinary
        "CLOUDINARY_CLOUD_NAME": is_set(settings.cloudinary_cloud_name),
        "CLOUDINARY_API_KEY": is_set(settings.cloudinary_api_key),
        "CLOUDINARY_API_SECRET": is_set(settings.cloudinary_api_secret),
        
        # Email
        "EMAIL_SENDER": settings.email_sender,
        "EMAIL_USERNAME": is_set(settings.email_username),
        "EMAIL_PASSWORD": is_set(settings.email_password),
        "SMTP_SERVER": settings.smtp_server,
        "SMTP_PORT": settings.smtp_port,
        
        # Rate Limiting
        "CASE_GENERATION_RATE_LIMIT": settings.case_generation_rate_limit,
        "CASE_GENERATION_RATE_WINDOW": settings.case_generation_rate_window,
        "ARGUMENT_RATE_LIMIT": settings.argument_rate_limit,
        "ARGUMENT_RATE_WINDOW": settings.argument_rate_window,
        
        # Logging
        "LOG_LEVEL": settings.log_level,
        "LOG_FORMAT": settings.log_format
    }
    
    logger.info("Environment configuration loaded", extra={"env_config": env_status})
    
    # Log warnings for critical missing variables
    if not settings.groq_api_key:
        logger.warning("GROQ_API_KEY not set - LLM features will not work")
    if settings.secret_key == "secret":
        logger.warning("SECRET_KEY using default value - not secure for production")
    if not settings.google_client_id or not settings.google_client_secret:
        logger.warning("Google OAuth credentials not set - Login with Google will fail")
    if not settings.email_username or not settings.email_password:
        logger.warning("Email credentials not set - OTP emails will not send")