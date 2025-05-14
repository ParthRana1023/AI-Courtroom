# app/routes/arguments.py
from fastapi import APIRouter, Body, Depends, HTTPException
from beanie import PydanticObjectId
from app.models.case import Case, CaseStatus
from app.dependencies import get_current_user
from app.services.llm.lawyer import generate_counter_argument, opening_statement, closing_statement
from app.services.llm.judge import generate_verdict
from app.utils.rate_limiter import RateLimiter
from app.models.user import User
from datetime import datetime, timezone

router = APIRouter(tags=["arguments"])

# 10 arguments per day (86400 seconds)
rate_limiter = RateLimiter(10, 86400)

# Update the submit_argument function
@router.post("/{case_cnr}/arguments")
async def submit_argument(
    case_cnr: str,
    role: str = Body(...),
    argument: str = Body(...),
    is_closing: bool = Body(False),
    current_user: User = Depends(get_current_user),
    rate_limited: None = Depends(rate_limiter)
):
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    # Convert both IDs to strings for proper comparison
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    # Check if this is the first argument submission
    if not case.plaintiff_arguments and not case.defendant_arguments:
        # First argument must be from plaintiff
        if role != "plaintiff":
            # If user (defendant) submits the first argument:
            # 1. AI generates plaintiff's opening statement
            plaintiff_opening_statement = await opening_statement("plaintiff", case.details)
            case.plaintiff_arguments.append({
                "type": "opening",
                "content": plaintiff_opening_statement,
                "user_id": None,  # LLM-generated
                "timestamp": datetime.now(timezone.utc)
            })

            # 2. User's submitted argument is recorded as the defendant's opening statement
            defendant_opening_statement_content = argument
            case.defendant_arguments.append({
                "type": "opening", # Defendant's first statement is an opening statement
                "content": defendant_opening_statement_content,
                "user_id": current_user.id,
                "timestamp": datetime.now(timezone.utc)
            })

            # Prepare history for counter-argument
            history = f"Defendant: {defendant_opening_statement_content}\n"
            
            # 3. AI (as plaintiff) generates a counter-argument to the defendant's opening statement
            ai_plaintiff_counter_to_defendant_opening = await generate_counter_argument(history, defendant_opening_statement_content, "plaintiff", case.details)
            case.plaintiff_arguments.append({
                "type": "counter",
                "content": ai_plaintiff_counter_to_defendant_opening,
                "user_id": None, # LLM-generated
                "timestamp": datetime.now(timezone.utc)
            })

            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE

            await case.save()
            # Return both AI plaintiff opening and AI plaintiff counter
            return {
                "plaintiff_opening_statement": plaintiff_opening_statement,
                "ai_plaintiff_counter_argument": ai_plaintiff_counter_to_defendant_opening
            }
        else:
            # User is plaintiff, proceed normally with first argument
            case.plaintiff_arguments.append({
                "type": "user",
                "content": argument,
                "user_id": current_user.id,
                "timestamp": datetime.now(timezone.utc)
            })
    elif not case.plaintiff_arguments and role == "defendant":
        # Defendant cannot submit before plaintiff
        raise HTTPException(
            status_code=400,
            detail="The plaintiff must submit the first argument"
        )
    else:
        # Check if user has participated in this case with the specified role
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
            # Not first submission - track user ID with role
            # Check if current_user.id is not None before adding it
            user_id = current_user.id if current_user.id is not None else ""
            
            if role == "plaintiff":
                case.plaintiff_arguments.append({
                    "type": "user",
                    "content": argument,
                    "user_id": user_id,
                    "timestamp": datetime.now(timezone.utc)
                })
            else:
                case.defendant_arguments.append({
                    "type": "user",
                    "content": argument,
                    "user_id": user_id,
                    "timestamp": datetime.now(timezone.utc)
                })

    # Prepare history for counter-argument generation
    history = ""
    if role == "plaintiff":
        # If user is plaintiff, include all previous arguments as history
        for arg in case.plaintiff_arguments:
            history += f"Plaintiff: {arg.get('content')}\n"
        for arg in case.defendant_arguments:
            history += f"Defendant: {arg.get('content')}\n"
    else:
        # If user is defendant, include all previous arguments as history
        for arg in case.defendant_arguments:
            history += f"Defendant: {arg.get('content')}\n"
        for arg in case.plaintiff_arguments:
            history += f"Plaintiff: {arg.get('content')}\n"
    
    # Determine AI role based on user's role
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"
    
    # Check if this is a closing statement
    if is_closing:
        # Record user's closing statement
        if role == "plaintiff":
            case.plaintiff_arguments.append({
                "type": "closing",
                "content": argument,
                "user_id": current_user.id,
                "timestamp": datetime.now(timezone.utc)
            })
        else:
            case.defendant_arguments.append({
                "type": "closing",
                "content": argument,
                "user_id": current_user.id,
                "timestamp": datetime.now(timezone.utc)
            })
        
        # Generate AI's closing statement
        counter = await closing_statement(history, ai_role)
        
        # Record AI's closing statement
        if role == "plaintiff":
            case.defendant_arguments.append({
                "type": "closing",
                "content": counter,
                "user_id": None,  # LLM-generated
                "timestamp": datetime.now(timezone.utc)
            })
        else:
            case.plaintiff_arguments.append({
                "type": "closing",
                "content": counter,
                "user_id": None,  # LLM-generated
                "timestamp": datetime.now(timezone.utc)
            })
        
        # Update case status to CLOSED
        case.status = CaseStatus.CLOSED
    else:
        # Generate counter-argument for opposing side
        counter = await generate_counter_argument(history, argument, ai_role, case.details)

    if case.status == CaseStatus.NOT_STARTED:
        case.status = CaseStatus.ACTIVE
    
    # If this is the first plaintiff argument (from user), generate defendant opening
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 0 and role == "plaintiff":
        case.defendant_arguments.append({
            "type": "opening",
            "content": counter,
            "user_id": None,  # LLM-generated
            "timestamp": datetime.now(timezone.utc)
        })
    # Otherwise add counter argument to appropriate side
    elif role == "plaintiff":
        case.defendant_arguments.append({
            "type": "counter",
            "content": counter,
            "timestamp": datetime.now(timezone.utc)
        })
    else:
        case.plaintiff_arguments.append({
            "type": "counter",
            "content": counter,
            "timestamp": datetime.now(timezone.utc)
        })

    await case.save()

    return {"counter_argument": counter}


@router.post("/{case_cnr}/closing-statement")
async def submit_closing_statement(
    case_cnr: str,
    role: str = Body(...),
    statement: str = Body(...),
    current_user: User = Depends(get_current_user),
    rate_limited: None = Depends(rate_limiter)
):
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check if the case belongs to the current user
    # Convert both IDs to strings for proper comparison
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    # Check if user has participated in this case with the specified role
    existing_roles = set()
    for arg in case.plaintiff_arguments:
        if str(arg.get("user_id")) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        if str(arg.get("user_id")) == str(current_user.id):
            existing_roles.add("defendant")

    if role not in existing_roles:
        raise HTTPException(
            status_code=403,
            detail=f"You must have previously participated as {role} to submit a closing statement"
        )
    
    # Add closing statement to the appropriate side
    # Check if current_user.id is not None before adding it
    user_id = current_user.id if current_user.id is not None else ""
    
    if role == "plaintiff":
        case.plaintiff_arguments.append({
            "type": "closing",
            "content": statement,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc)
        })
    else:
        case.defendant_arguments.append({
            "type": "closing",
            "content": statement,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc)
        })
    
    await case.save()
    
    # Prepare history for AI closing statement
    history = ""
    for arg in case.plaintiff_arguments:
        history += f"Plaintiff: {arg.get('content')}\n"
    for arg in case.defendant_arguments:
        history += f"Defendant: {arg.get('content')}\n"
    
    # Determine AI role based on user's role (opposite side)
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"
    
    # Generate AI's closing statement
    ai_closing = await closing_statement(history, ai_role)
    
    # Add AI's closing statement to the appropriate side
    if role == "plaintiff":
        case.defendant_arguments.append({
            "type": "closing",
            "content": ai_closing,
            "user_id": None,  # LLM-generated
            "timestamp": datetime.now(timezone.utc)
        })
    else:
        case.plaintiff_arguments.append({
            "type": "closing",
            "content": ai_closing,
            "user_id": None,  # LLM-generated
            "timestamp": datetime.now(timezone.utc)
        })
    
    # Generate verdict using all arguments from both sides
    # Ensure we're only extracting string content for the verdict generation
    user_args = [
        str(arg["content"]) for arg in case.plaintiff_arguments + case.defendant_arguments 
        if arg["type"] in ["user", "closing"]
    ]
    counter_args = [
        str(arg["content"]) for arg in case.plaintiff_arguments + case.defendant_arguments 
        if arg["type"] == "counter"
    ]
    
    case.verdict = await generate_verdict(user_args, counter_args)
    case.status = CaseStatus.RESOLVED
    await case.save()
    
    return {
        "verdict": case.verdict,
        "ai_closing_statement": ai_closing
    }
