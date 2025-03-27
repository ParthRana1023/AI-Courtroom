# app/routes/arguments.py
from fastapi import APIRouter, Body, Depends, HTTPException
from beanie import PydanticObjectId
from app.models.case import Case, CaseStatus
from app.dependencies import get_current_user
from app.services.llm.lawyer import generate_counter_argument
from app.services.llm.judge import generate_verdict
from app.utils.rate_limiter import RateLimiter
from app.models.user import User

router = APIRouter(tags=["arguments"])

rate_limiter = RateLimiter(5, 60)  # 5 requests per minute

@router.post("/{case_cnr}/arguments")
async def submit_argument(
    case_cnr: str,
    role: str = Body(...),
    argument: str = Body(...),
    current_user: User = Depends(get_current_user),
    rate_limited: None = Depends(rate_limiter)
):
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    # Check existing user role in this case
    existing_roles = set()
    for arg in case.plaintiff_arguments:
        if str(arg.get("user_id")) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        if str(arg.get("user_id")) == str(current_user.id):
            existing_roles.add("defendant")

    if existing_roles and role not in existing_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}"
        )
    else:
        # First submission - track user ID with role
        if role == "plaintiff":
            case.plaintiff_arguments.append({
                "type": "user",
                "content": argument,
                "user_id": current_user.id
            })
        else:
            case.defendant_arguments.append({
                "type": "user",
                "content": argument,
                "user_id": current_user.id
            })

    # Generate counter-argument for opposing side
    counter = await generate_counter_argument(argument)

    if case.status == CaseStatus.NOT_STARTED:
        case.status = CaseStatus.ACTIVE
    
    if role == "plaintiff":
        case.defendant_arguments.append({
            "type": "counter",
            "content": counter
        })
    else:
        case.plaintiff_arguments.append({
            "type": "counter",
            "content": counter
        })

    await case.save()
    
    # Check if both sides have at least one argument to generate verdict
    # Modify the verdict generation condition to:
    if (
        sum(1 for arg in case.plaintiff_arguments if arg["type"] == "user") >= 1
        and sum(1 for arg in case.defendant_arguments if arg["type"] == "user") >= 1
        and not case.verdict
    ):
        # Generate verdict only when both sides have user arguments
        user_args = [
            arg["content"] for arg in case.plaintiff_arguments + case.defendant_arguments 
            if arg["type"] == "user"
        ]
        counter_args = [
            arg["content"] for arg in case.plaintiff_arguments + case.defendant_arguments 
            if arg["type"] == "counter"
        ]
        
        case.verdict = await generate_verdict(user_args, counter_args)
        case.status = CaseStatus.RESOLVED  # Move status update here
        await case.save()
    
    return {"counter_argument": counter, "verdict": case.verdict}