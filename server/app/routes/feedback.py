from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas.feedback import FeedbackCreate, FeedbackOut
from app.models.feedback import Feedback
from app.models.user import User
from app.dependencies import get_current_user

router = APIRouter()

@router.post("/submit", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(feedback_data: FeedbackCreate, current_user: User = Depends(get_current_user)):
    try:
        # Create feedback with user details fetched from current user
        feedback = Feedback(
            user_id=str(current_user.id),
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            email=current_user.email,
            phone_number=current_user.phone_number,
            feedback_category=feedback_data.feedback_category.value,
            message=feedback_data.message
        )
        await feedback.insert()

        feedback_dict = feedback.model_dump()
        feedback_dict["_id"] = str(feedback.id)
        feedback_dict["created_at"] = feedback.created_at.isoformat()
        return feedback_dict
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))