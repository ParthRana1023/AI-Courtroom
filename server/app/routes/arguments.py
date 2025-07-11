# app/routes/arguments.py
from fastapi import APIRouter, Body, Depends, HTTPException
from app.models.case import Case, CaseStatus
from app.dependencies import get_current_user
from app.services.llm.lawyer import generate_counter_argument, opening_statement, closing_statement
from app.services.llm.judge import generate_verdict
from app.models.user import User
from app.utils.rate_limiter import rate_limiter
from app.utils.datetime import get_current_datetime
from app.models.case import ArgumentItem

router = APIRouter(tags=["arguments"])

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

    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    print(f"[DEBUG] submit_argument called for case {case_cnr}, role {role}, argument length {len(argument)}")
    print(f"[DEBUG] Current arguments: Plaintiff={len(case.plaintiff_arguments)}, Defendant={len(case.defendant_arguments)}")

    # Check if this is the first argument submission
    if not case.plaintiff_arguments and not case.defendant_arguments:
        print("[DEBUG] Case has no arguments yet.")
        # First argument must be from plaintiff
        if role != "plaintiff":
            print("[DEBUG] User is defendant, submitting first argument.")
            # If user (defendant) submits the first argument:
            # 1. AI generates plaintiff's opening statement
            print("[DEBUG] Calling opening_statement for plaintiff...")
            plaintiff_opening_statement = await opening_statement("plaintiff", case.details, role)
            print(f"[DEBUG] opening_statement returned: {plaintiff_opening_statement[:100]}...") # Log first 100 chars
            case.plaintiff_arguments.append({
                "type": "opening",
                "content": plaintiff_opening_statement,
                "user_id": None,  # LLM-generated
                "timestamp": get_current_datetime()
            })

            # 2. User's submitted argument is recorded as the defendant's opening statement
            defendant_opening_statement_content = argument
            case.defendant_arguments.append({
                "type": "opening", # Defendant's first statement is an opening statement
                "content": defendant_opening_statement_content,
                "user_id": current_user.id,
                "timestamp": get_current_datetime()
            })

            # Prepare history for counter-argument
            history = f"Defendant: {defendant_opening_statement_content}\n"
            
            # 3. AI (as plaintiff) generates a counter-argument to the defendant's opening statement
            print("[DEBUG] Calling generate_counter_argument for plaintiff...")
            ai_plaintiff_counter_to_defendant_opening = await generate_counter_argument(history, defendant_opening_statement_content, "plaintiff", case.details)
            print(f"[DEBUG] generate_counter_argument returned: {ai_plaintiff_counter_to_defendant_opening[:100]}...") # Log first 100 chars
            case.plaintiff_arguments.append({
                "type": "counter",
                "content": ai_plaintiff_counter_to_defendant_opening,
                "user_id": None, # LLM-generated
                "timestamp": get_current_datetime()
            })

            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE
                print(f"[DEBUG] Case status updated to {case.status}")

            print("[DEBUG] Saving case...")
            await case.save()
            print("[DEBUG] Case saved.")

            # Return both AI plaintiff opening and AI plaintiff counter
            print("[DEBUG] Returning response with AI arguments.")
            return {
                "ai_opening_statement": plaintiff_opening_statement,
                "ai_opening_role": "plaintiff",
                "ai_counter_argument": ai_plaintiff_counter_to_defendant_opening,
                "ai_counter_role": "plaintiff"
            }
        else:
            print("[DEBUG] User is plaintiff, submitting first argument.")
            # User is plaintiff, proceed normally with first argument
            case.plaintiff_arguments.append(ArgumentItem(
                type="user",
                content=argument,
                user_id=current_user.id,
                timestamp=get_current_datetime()
            ))
            print("[DEBUG] Plaintiff argument appended.")
    elif not case.plaintiff_arguments and role == "defendant":
        print("[DEBUG] Defendant submitting before plaintiff.")
        # Defendant cannot submit before plaintiff
        raise HTTPException(
            status_code=400,
            detail="The plaintiff must submit the first argument"
        )
    else:
        print("[DEBUG] Case already has arguments.")
        # Check if user has participated in this case with the specified role
        existing_roles = set()
        for arg in case.plaintiff_arguments:
            if arg.user_id is not None and str(arg.user_id) == str(current_user.id):
                existing_roles.add("plaintiff")
        for arg in case.defendant_arguments:
            if arg.user_id is not None and str(arg.user_id) == str(current_user.id):
                existing_roles.add("defendant")

        if existing_roles and role not in existing_roles:
            print(f"[DEBUG] Role conflict: User previously participated as {', '.join(existing_roles)}, attempting to submit as {role}.")
            raise HTTPException(
                status_code=403,
                detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}"
            )
        else:
            print(f"[DEBUG] User submitting as {role} in an ongoing case.")
            # Not first submission - track user ID with role
            # Check if current_user.id is not None before adding it
            user_id = current_user.id if current_user.id is not None else ""
            
            if role == "plaintiff":
                case.plaintiff_arguments.append(ArgumentItem(
                    type="user",
                    content=argument,
                    user_id=user_id,
                    timestamp=get_current_datetime()
                ))
                print("[DEBUG] Plaintiff argument appended.")
            else:
                case.defendant_arguments.append(ArgumentItem(
                    type="user",
                    content=argument,
                    user_id=user_id,
                    timestamp=get_current_datetime()
                ))
                print("[DEBUG] Defendant argument appended.")

    # Prepare history for counter-argument generation
    history = ""
    if role == "plaintiff":
        # If user is plaintiff, include all previous arguments as history
        for arg in case.plaintiff_arguments:
            # Handle both dictionary and ArgumentItem types for backward compatibility
            content = None
            if isinstance(arg, dict):
                content = arg.get('content')
            elif isinstance(arg, ArgumentItem):
                content = arg.content

            if content is not None:
                history += f"Plaintiff: {content}\n"
        for arg in case.defendant_arguments:
            # Handle both dictionary and ArgumentItem types for backward compatibility
            content = None
            if isinstance(arg, dict):
                content = arg.get('content')
            elif isinstance(arg, ArgumentItem):
                content = arg.content

            if content is not None:
                history += f"Defendant: {content}\n"
    else:
        # If user is defendant, include all previous arguments as history
        for arg in case.defendant_arguments:
            # Handle both dictionary and ArgumentItem types for backward compatibility
            content = None
            if isinstance(arg, dict):
                content = arg.get('content')
            elif isinstance(arg, ArgumentItem):
                content = arg.content

            if content is not None:
                history += f"Defendant: {content}\n"
        for arg in case.plaintiff_arguments:
            # Handle both dictionary and ArgumentItem types for backward compatibility
            content = None
            if isinstance(arg, dict):
                content = arg.get('content')
            elif isinstance(arg, ArgumentItem):
                content = arg.content

            if content is not None:
                history += f"Plaintiff: {content}\n"
    
    # Determine AI role based on user's role
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"
    
    # Check if this is a closing statement
    if is_closing:
        print("[DEBUG] Handling closing statement.")
        # Record user's closing statement
        if role == "plaintiff":
            case.plaintiff_arguments.append(ArgumentItem(
                type="closing",
                content=argument,
                user_id=current_user.id,
                timestamp=get_current_datetime()
            ))
        else:
            case.defendant_arguments.append(ArgumentItem(
                type="closing",
                content=argument,
                user_id=current_user.id,
                timestamp=get_current_datetime()
            ))
        
        # Generate AI's closing statement
        counter = await closing_statement(history, ai_role)
        
        # Record AI's closing statement
        if role == "plaintiff":
            case.defendant_arguments.append({
                "type": "closing",
                "content": counter,
                "user_id": None,  # LLM-generated
                "timestamp": get_current_datetime()
            })
        else:
            case.plaintiff_arguments.append({
                "type": "closing",
                "content": counter,
                "user_id": None,  # LLM-generated
                "timestamp": get_current_datetime()
            })
        
        # Update case status to CLOSED
        case.status = CaseStatus.CLOSED
    else:
        # Generate counter-argument for opposing side
        try:
            counter = await generate_counter_argument(history, argument, ai_role, case.details)
            # Check if the response is the error message from the LLM service
            if counter.startswith("I apologize, but I'm unable to generate a counter argument"):
                # Return the error message without storing it as an argument
                return {"error": counter}
        except Exception as e:
            # Handle any exceptions during counter argument generation
            error_message = f"Error generating counter argument: {str(e)}"
            return {"error": "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."}

    if case.status == CaseStatus.NOT_STARTED:
        case.status = CaseStatus.ACTIVE
    
    # If this is the first plaintiff argument (from user), generate defendant opening
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 0 and role == "plaintiff":
        case.defendant_arguments.append({
            "type": "opening",
            "content": counter,
            "user_id": None,  # LLM-generated
            "timestamp": get_current_datetime()
        })
    # Otherwise add counter argument to appropriate side
    elif role == "plaintiff":
        case.defendant_arguments.append({
            "type": "counter",
            "content": counter,
            "timestamp": get_current_datetime()
        })
    else:
        case.plaintiff_arguments.append({
            "type": "counter",
            "content": counter,
            "timestamp": get_current_datetime()
        })

    await case.save()

    # Standardize response for AI-generated arguments
    response_data = {}
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 1 and role == "plaintiff" and case.defendant_arguments[0].type == "opening" and case.defendant_arguments[0].user_id is None:
        # This was the AI defendant's opening statement generated because plaintiff submitted first
        response_data["ai_opening_statement"] = counter
        response_data["ai_opening_role"] = "defendant"
    else:
        # This is a regular counter-argument
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role # ai_role is 'defendant' if user is 'plaintiff', and vice-versa

    return response_data


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
        # Handle both dictionary and ArgumentItem types for backward compatibility
        arg_user_id = arg.get('user_id') if isinstance(arg, dict) else getattr(arg, 'user_id', None)
        if arg_user_id is not None and str(arg_user_id) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        # Handle both dictionary and ArgumentItem types for backward compatibility
        arg_user_id = arg.get('user_id') if isinstance(arg, dict) else getattr(arg, 'user_id', None)
        if arg_user_id is not None and str(arg_user_id) == str(current_user.id):
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
        case.plaintiff_arguments.append(ArgumentItem(
            type="closing",
            content=statement,
            user_id=user_id,
            timestamp=get_current_datetime()
        ))
    else:
        case.defendant_arguments.append(ArgumentItem(
            type="closing",
            content=statement,
            user_id=user_id,
            timestamp=get_current_datetime()
        ))
    
    await case.save()
    
    # Prepare history for AI closing statement
    history = ""
    for arg in case.plaintiff_arguments:
        # Handle both dictionary and ArgumentItem types for backward compatibility
        content = None
        if isinstance(arg, ArgumentItem):
            content = arg.content
            arg_type = arg.type
        elif isinstance(arg, dict):
            content = arg.get('content')
            arg_type = arg.get('type')

        if content is not None:
            if arg_type == 'plaintiff':
                history += f"Plaintiff: {content}\n"
            elif arg_type == 'defendant':
                history += f"Defendant: {content}\n"
    for arg in case.defendant_arguments:
        # Handle both dictionary and ArgumentItem types for backward compatibility
        content = None
        if isinstance(arg, ArgumentItem):
            content = arg.content
            arg_type = arg.type
        elif isinstance(arg, dict):
            content = arg.get('content')
            arg_type = arg.get('type')

        if content is not None:
            if arg_type == 'plaintiff':
                history += f"Plaintiff: {content}\n"
            elif arg_type == 'defendant':
                history += f"Defendant: {content}\n"
    
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
            "timestamp": get_current_datetime()
        })
    else:
        case.plaintiff_arguments.append({
            "type": "closing",
            "content": ai_closing,
            "user_id": None,  # LLM-generated
            "timestamp": get_current_datetime()
        })
    
    # Generate verdict using all arguments from both sides
    # Ensure we're only extracting string content for the verdict generation
    user_args = [
        str(arg.content) if isinstance(arg, ArgumentItem) else str(arg["content"])
        for arg in case.plaintiff_arguments + case.defendant_arguments 
        if (isinstance(arg, ArgumentItem) and arg.type in ["user", "closing"]) or (isinstance(arg, dict) and arg.get("type") in ["user", "closing"])
    ]
    counter_args = [
        str(arg.content) if isinstance(arg, ArgumentItem) else str(arg["content"])
        for arg in case.plaintiff_arguments + case.defendant_arguments 
        if (isinstance(arg, ArgumentItem) and arg.type == "counter") or (isinstance(arg, dict) and arg.get("type") == "counter")
    ]
    
    # Pass the case description to the verdict generator
    case.verdict = await generate_verdict(user_args, counter_args, case.details, case.title)
    case.status = CaseStatus.RESOLVED
    await case.save()

    ai_opening_statement_content = None
    ai_counter_argument_content = None
    
    response_data = {
        "verdict": case.verdict,
        "ai_closing_statement": ai_closing
    }

    # Include AI opening statement and counter-argument if they were generated
    if ai_opening_statement_content:
        response_data["ai_opening_statement"] = ai_opening_statement_content
        response_data["ai_opening_role"] = "plaintiff" # Assuming AI opening is always for plaintiff
    if ai_counter_argument_content:
        response_data["ai_counter_argument"] = ai_counter_argument_content
        response_data["ai_counter_role"] = "plaintiff" # Assuming AI counter is always for plaintiff

    return response_data
