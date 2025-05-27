from fastapi import APIRouter, HTTPException, status
from app.schemas.feedback import FeedbackCreate, FeedbackOut
from app.models.feedback import Feedback

router = APIRouter()

@router.post("/submit", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(feedback_data: FeedbackCreate):
    try:
        feedback = Feedback(**feedback_data.model_dump())
        await feedback.insert()

        feedback_dict = feedback.model_dump()
        feedback_dict["_id"] = str(feedback.id)
        feedback_dict["created_at"] = feedback.created_at.isoformat()
        return feedback_dict
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))