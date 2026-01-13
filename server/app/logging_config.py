# app/logging_config.py
"""
Centralized logging configuration for AI Courtroom backend.
Provides structured logging with request tracing, performance metrics, and sensitive data masking.
"""

import logging
import sys
import re
import time
import uuid
from functools import wraps
from typing import Optional, Callable, Any
from contextvars import ContextVar

# Context variable for request ID (thread-safe)
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Add request_id to all log records."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("-")
        return True


class SensitiveDataFilter(logging.Filter):
    """Mask sensitive data in log messages."""
    
    # Patterns for sensitive data
    EMAIL_PATTERN = re.compile(r'([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})')
    TOKEN_PATTERN = re.compile(r'(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)')
    PASSWORD_PATTERN = re.compile(r'(password["\']?\s*[:=]\s*["\']?)([^"\'}\s]+)')
    API_KEY_PATTERN = re.compile(r'(api[_-]?key["\']?\s*[:=]\s*["\']?)([a-zA-Z0-9_-]{20,})')
    
    def filter(self, record: logging.LogRecord) -> bool:
        if hasattr(record, 'msg') and isinstance(record.msg, str):
            record.msg = self._mask_sensitive(record.msg)
        if hasattr(record, 'args') and record.args:
            record.args = tuple(
                self._mask_sensitive(str(arg)) if isinstance(arg, str) else arg
                for arg in record.args
            )
        return True
    
    def _mask_sensitive(self, text: str) -> str:
        """Mask sensitive data in text."""
        # Mask emails: john.doe@email.com -> j***@email.com
        text = self.EMAIL_PATTERN.sub(lambda m: f"{m.group(1)[0]}***@{m.group(2)}", text)
        # Mask JWT tokens
        text = self.TOKEN_PATTERN.sub("[REDACTED_TOKEN]", text)
        # Mask passwords
        text = self.PASSWORD_PATTERN.sub(r'\1[REDACTED]', text)
        # Mask API keys
        text = self.API_KEY_PATTERN.sub(r'\1[REDACTED_KEY]', text)
        return text


class ColoredFormatter(logging.Formatter):
    """Colored formatter for development console output."""
    
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record: logging.LogRecord) -> str:
        # Add color to level name
        levelname = record.levelname
        if levelname in self.COLORS:
            record.levelname = f"{self.COLORS[levelname]}{levelname}{self.RESET}"
        result = super().format(record)
        record.levelname = levelname  # Restore original
        return result


class JsonFormatter(logging.Formatter):
    """JSON formatter for production logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        import json
        from datetime import datetime
        
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "request_id": getattr(record, 'request_id', '-'),
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add extra fields
        if hasattr(record, 'duration_ms'):
            log_data['duration_ms'] = record.duration_ms
        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id
        if hasattr(record, 'endpoint'):
            log_data['endpoint'] = record.endpoint
        if hasattr(record, 'method'):
            log_data['method'] = record.method
        if hasattr(record, 'status_code'):
            log_data['status_code'] = record.status_code
        
        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_data)


def setup_logging(log_level: str = "INFO", log_format: str = "text") -> None:
    """
    Configure logging for the application.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        log_format: Output format ('json' for production, 'text' for development)
    """
    # Get numeric level
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    
    # Create root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    
    # Add filters
    console_handler.addFilter(RequestIdFilter())
    console_handler.addFilter(SensitiveDataFilter())
    
    # Set formatter based on environment
    if log_format.lower() == "json":
        formatter = JsonFormatter()
    else:
        formatter = ColoredFormatter(
            fmt="%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("motor").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.
    
    Args:
        name: Logger name (typically __name__)
        
    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)


def generate_request_id() -> str:
    """Generate a unique request ID."""
    return str(uuid.uuid4())[:8]


def set_request_id(request_id: str) -> None:
    """Set the request ID for the current context."""
    request_id_var.set(request_id)


def get_request_id() -> str:
    """Get the current request ID."""
    return request_id_var.get("-")


def log_execution_time(logger: logging.Logger, operation: str = "Operation"):
    """
    Decorator to log execution time of async functions.
    
    Args:
        logger: Logger instance to use
        operation: Description of the operation being timed
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            start_time = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.info(
                    f"{operation} completed in {duration_ms:.2f}ms",
                    extra={"duration_ms": round(duration_ms, 2)}
                )
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.error(
                    f"{operation} failed after {duration_ms:.2f}ms: {str(e)}",
                    extra={"duration_ms": round(duration_ms, 2)}
                )
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            start_time = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.info(
                    f"{operation} completed in {duration_ms:.2f}ms",
                    extra={"duration_ms": round(duration_ms, 2)}
                )
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.error(
                    f"{operation} failed after {duration_ms:.2f}ms: {str(e)}",
                    extra={"duration_ms": round(duration_ms, 2)}
                )
                raise
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


class LogContext:
    """Context manager for adding extra context to logs."""
    
    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.perf_counter() - self.start_time) * 1000
        if exc_type:
            self.logger.error(
                f"Context failed after {duration_ms:.2f}ms: {exc_val}",
                extra={**self.context, "duration_ms": round(duration_ms, 2)}
            )
        return False  # Don't suppress exceptions
