"""
FastAPI route for receiving and storing client-side logs.
Logs are processed in background to minimize response time.
"""

from fastapi import APIRouter, Request, BackgroundTasks
from typing import List
from datetime import datetime

from app.models.client_log import ClientLog
from app.schemas.client_log import ClientLogEntry, ClientLogBatch
from app.logging_config import get_logger

router = APIRouter(prefix="/logs", tags=["Client Logs"])
logger = get_logger(__name__)


@router.post("/client")
async def receive_client_logs(
    batch: ClientLogBatch,
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Receive and store client-side logs.
    Logs are processed in background to minimize response time.
    """
    # Add to background task for async processing
    background_tasks.add_task(process_client_logs, batch.logs)
    
    return {"received": len(batch.logs)}


async def process_client_logs(logs: List[ClientLogEntry]):
    """Process and store client logs in MongoDB."""
    for entry in logs:
        try:
            # Log errors to server console as well
            if entry.level == "error":
                logger.warning(
                    f"[CLIENT ERROR] {entry.category}: {entry.message}",
                    extra={
                        "session_id": entry.session_id,
                        "user_id": entry.user_id,
                        "url": entry.url,
                        "error_stack": entry.error_stack[:500] if entry.error_stack else None
                    }
                )
            elif entry.level == "warn":
                logger.info(
                    f"[CLIENT WARN] {entry.category}: {entry.message}",
                    extra={
                        "session_id": entry.session_id,
                        "user_id": entry.user_id,
                        "url": entry.url
                    }
                )
            
            # Parse timestamp
            try:
                # Handle ISO format with Z suffix
                timestamp_str = entry.timestamp.replace("Z", "+00:00")
                timestamp = datetime.fromisoformat(timestamp_str)
            except ValueError:
                timestamp = datetime.utcnow()
            
            # Store in MongoDB
            client_log = ClientLog(
                timestamp=timestamp,
                level=entry.level,
                category=entry.category,
                message=entry.message,
                session_id=entry.session_id,
                user_id=entry.user_id,
                url=entry.url,
                user_agent=entry.user_agent,
                error_name=entry.error_name,
                error_stack=entry.error_stack,
                component_stack=entry.component_stack,
                context=entry.context,
                duration_ms=entry.duration_ms
            )
            await client_log.insert()
            
        except Exception as e:
            logger.error(f"Failed to store client log: {e}")


@router.get("/client/stats")
async def get_client_log_stats():
    """
    Get statistics about client logs.
    Useful for monitoring error rates.
    """
    try:
        # Count logs by level in the last 24 hours
        from datetime import timedelta
        
        since = datetime.utcnow() - timedelta(hours=24)
        
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {"_id": "$level", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        
        results = await ClientLog.aggregate(pipeline).to_list()
        
        stats = {item["_id"]: item["count"] for item in results}
        
        return {
            "period": "last_24_hours",
            "counts": stats,
            "total": sum(stats.values())
        }
    except Exception as e:
        logger.error(f"Failed to get client log stats: {e}")
        return {"error": str(e)}
