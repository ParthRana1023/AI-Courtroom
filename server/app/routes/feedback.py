# app/routes/feedback.py
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    status,
)

from app import messages
from app.dependencies import get_optional_user
from app.logging_config import get_logger
from app.models.feedback import Feedback
from app.models.user import User
from app.routes.auth import client_ip
from app.schemas.feedback import FeedbackCategory, FeedbackCreate, FeedbackOut
from app.services.email import send_recovery_request_email
from app.utils.rate_limiter import contact_ip_limiter, contact_sender_limiter

logger = get_logger(__name__)

router = APIRouter()


@router.post("/submit", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    feedback_data: FeedbackCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User | None = Depends(get_optional_user),
):
    """The Contact form. Open to guests, who must leave a name and email to reply to."""
    if current_user is None and not (feedback_data.name and feedback_data.email):
        raise HTTPException(status_code=422, detail=messages.GUEST_DETAILS_REQUIRED)

    ip = client_ip(request)
    sender = str(current_user.id) if current_user else feedback_data.email or ip
    await contact_ip_limiter.ensure_available(ip, messages.CONTACT_LIMIT)
    await contact_sender_limiter.ensure_available(sender, messages.CONTACT_LIMIT)

    category = feedback_data.feedback_category.value
    if current_user:
        feedback = Feedback(
            user_id=str(current_user.id),
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            email=current_user.email,
            phone_number=current_user.phone_number,
            feedback_category=category,
        )
    else:
        feedback = Feedback(
            name=feedback_data.name,
            email=feedback_data.email,
            feedback_category=category,
        )
    feedback.message = feedback_data.message
    feedback.account_identifier = feedback_data.account_identifier
    feedback.deleted_on = (
        feedback_data.deleted_on.isoformat() if feedback_data.deleted_on else None
    )
    feedback.ip = ip
    logger.info(f"Contact message ({category}) from {sender}")

    try:
        await feedback.insert()
    except Exception:
        logger.exception(f"Error saving feedback from {sender}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save feedback. Please try again.",
        )
    await contact_ip_limiter.register_usage(ip)
    await contact_sender_limiter.register_usage(sender)

    # Deleted accounts are erased after 30 days, so support hears about these at once.
    if feedback_data.feedback_category == FeedbackCategory.ACCOUNT_RECOVERY:
        background_tasks.add_task(
            send_recovery_request_email,
            {
                "Account": feedback.account_identifier,
                "Deleted on": feedback.deleted_on,
                "Reply to": feedback.email or feedback.phone_number,
                "Name": feedback.name
                or f"{feedback.first_name or ''} {feedback.last_name or ''}".strip(),
                "Message": feedback.message,
            },
        )

    return FeedbackOut(
        id=str(feedback.id),
        feedback_category=category,
        created_at=feedback.created_at.isoformat(),
    )
