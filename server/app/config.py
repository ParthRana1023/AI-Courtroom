# app/config.py
import re
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
    llm_model: str = "meta-llama/llama-4-maverick-17b-128e-instruct"
    port: int = 8000

    # Google OAuth settings
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None

    # OAuth Security settings
    oauth_state_secret: str = "another-secret"
    risc_webhook_secret: Optional[str] = None
    oauth_state_token_expiry: int = 600  # 10 minutes

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

    # CORS settings
    cors_allowed_origins: str = (
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://10.0.2.2:3000,"
        "capacitor://localhost,"
        "ionic://localhost"
    )
    cors_allow_origin_regex: str = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|10\.0\.2\.2|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?$"
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def current_db_name(self) -> str:
        return self.test_mongodb_db_name if self.testing else self.mongodb_db_name

    @property
    def parsed_cors_allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]


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
        "MONGODB_URL": (
            "Set"
            if settings.mongodb_url != "mongodb://localhost:27017"
            else "Using default"
        ),
        "MONGODB_DB_NAME": settings.mongodb_db_name,
        "TEST_MONGODB_DB_NAME": settings.test_mongodb_db_name,
        # Security
        "SECRET_KEY": (
            "Set" if settings.secret_key != "secret" else "Using default (UNSAFE)"
        ),
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
        "OAUTH_STATE_SECRET_SET": (
            "Yes"
            if settings.oauth_state_secret
            and settings.oauth_state_secret != "another-secret"
            else "Using Default (Unsafe)"
        ),
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
        "LOG_FORMAT": settings.log_format,
        # CORS
        "CORS_ALLOWED_ORIGINS": settings.parsed_cors_allowed_origins,
        "CORS_ALLOW_ORIGIN_REGEX_SET": "Yes"
        if settings.cors_allow_origin_regex
        else "No",
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
