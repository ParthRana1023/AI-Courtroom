# app/routes/arguments.py
from fastapi import APIRouter, Body, Depends, HTTPException
from app.models.case import Case, CaseStatus
from app.dependencies import get_current_user
from app.services.llm.lawyer import generate_counter_argument, opening_statement, closing_statement
from app.services.llm.judge import generate_verdict
from app.models.user import User
from app.utils.rate_limiter import argument_rate_limiter as rate_limiter
from app.utils.datetime import get_current_datetime
from app.models.case import ArgumentItem, Roles

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
    # Log the user's profile role for debugging

    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Validate the role
    try:
        role_enum = Roles(role)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role specified. Must be 'plaintiff' or 'defendant'")
        
    # Check if the user's role in the case matches the requested role
    if case.user_role and case.user_role != Roles.NOT_STARTED and case.user_role.value != role:
        print(f"[DEBUG] Role mismatch: User role in case is {case.user_role.value}, but requested {role}")
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}"
        )
        
    print(f"[DEBUG] submit_argument called for case {case_cnr}, role {role}, argument length {len(argument)}")
    print(f"[DEBUG] Current arguments: Plaintiff={len(case.plaintiff_arguments)}, Defendant={len(case.defendant_arguments)}")

    # Check if this is the first argument submission
    if not case.plaintiff_arguments and not case.defendant_arguments:
        print("[DEBUG] Case has no arguments yet.")
        # First argument must be from plaintiff (either user or AI)
        if role != "plaintiff":
            print("[DEBUG] User is defendant, submitting first argument.")
            # If user is defendant, AI must generate plaintiff's opening statement first
            print("[DEBUG] Calling opening_statement for plaintiff...")
            plaintiff_opening_statement = await opening_statement("plaintiff", case.details, "defendant")
            print(f"[DEBUG] opening_statement returned: {plaintiff_opening_statement[:100]}...") # Log first 100 chars
            case.plaintiff_arguments.append(ArgumentItem(
                type="opening",
                content=plaintiff_opening_statement,
                user_id=None,  # LLM-generated
                role=Roles.PLAINTIFF,  # AI is explicitly plaintiff here
                timestamp=get_current_datetime()
            ))

            # 2. User's submitted argument is recorded as the defendant's opening statement
            defendant_opening_statement_content = argument
            case.defendant_arguments.append(ArgumentItem(
                type="opening",  # Defendant's first statement is an opening statement
                content=defendant_opening_statement_content,
                user_id=current_user.id,
                role=Roles.DEFENDANT,  # User is explicitly defendant
                timestamp=get_current_datetime()
            ))

            # Prepare history for counter-argument
            history = f"Defendant: {defendant_opening_statement_content}\n"
            
            # 3. AI (as plaintiff) generates a counter-argument to the defendant's opening statement
            print("[DEBUG] Calling generate_counter_argument for plaintiff...")
            ai_plaintiff_counter_to_defendant_opening = await generate_counter_argument(history, defendant_opening_statement_content, "plaintiff", case.user_role.value, case.details)
            print(f"[DEBUG] generate_counter_argument returned: {ai_plaintiff_counter_to_defendant_opening[:100]}...") # Log first 100 chars
            case.plaintiff_arguments.append(ArgumentItem(
                type="counter",
                content=ai_plaintiff_counter_to_defendant_opening,
            user_id=None, # LLM-generated
            role=Roles.PLAINTIFF,
            timestamp=get_current_datetime()
        ))

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
                type="opening",
                content=argument,
            user_id=current_user.id,
            role=role_enum,
            timestamp=get_current_datetime()
        ))
            print("[DEBUG] Plaintiff opening statement appended.")
            
            # Generate defendant's opening statement
            print("[DEBUG] Calling opening_statement for defendant...")
            defendant_opening_statement = await opening_statement("defendant", case.details, "plaintiff")
            print(f"[DEBUG] opening_statement returned: {defendant_opening_statement[:100]}...") # Log first 100 chars
            case.defendant_arguments.append(ArgumentItem(
                type="opening",
                content=defendant_opening_statement,
                user_id=None,  # LLM-generated
                role=Roles.DEFENDANT,  # AI is explicitly defendant
                timestamp=get_current_datetime()
            ))
            print("[DEBUG] Defendant opening statement appended.")
            
            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE
                print(f"[DEBUG] Case status updated to {case.status}")
                
            # Save the case
            await case.save()
            
            # Return the AI's opening statement
            return {
                "ai_opening_statement": defendant_opening_statement,
                "ai_opening_role": "defendant"
            }
    # This block should never be reached now, but keeping it as a safeguard
    elif not case.plaintiff_arguments and role == "defendant":
        print("[DEBUG] Defendant submitting before plaintiff - this should not happen.")
        # Defendant cannot submit before plaintiff
        raise HTTPException(
            status_code=400,
            detail="The plaintiff must go first in the case. The system will automatically generate a plaintiff opening statement when you submit as defendant."
        )
    else:
        print("[DEBUG] Case already has arguments.")
        # Check if the user's role in the case matches the requested role
    if case.user_role and case.user_role != Roles.NOT_STARTED and case.user_role.value != role:
        print(f"[DEBUG] Role mismatch: User role in case is {case.user_role.value}, but requested {role}")
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}"
        )
        
    # For backward compatibility, also check previous participation
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
                role=Roles.PLAINTIFF,  # User is explicitly plaintiff
                timestamp=get_current_datetime()
            ))
            print("[DEBUG] Plaintiff argument appended.")
        else:
            case.defendant_arguments.append(ArgumentItem(
                type="user",
                content=argument,
                user_id=user_id,
                role=Roles.DEFENDANT,  # User is explicitly defendant
                timestamp=get_current_datetime()
            ))
            print("[DEBUG] Defendant arg]ument appended.")

    # Prepare history for counter-argument generation
    history = ""
    print(f"[DEBUG] Building history for counter-argument generation, role={role}")
    print(f"[DEBUG] Plaintiff arguments count: {len(case.plaintiff_arguments)}")
    print(f"[DEBUG] Defendant arguments count: {len(case.defendant_arguments)}")
    
    # Log all arguments for debugging
    for i, arg in enumerate(case.plaintiff_arguments):
        arg_type = arg.type if isinstance(arg, ArgumentItem) else arg.get('type')
        arg_content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
        print(f"[DEBUG] Plaintiff arg {i}: type={arg_type}, content={arg_content[:50] if arg_content else 'None'}...")
    
    for i, arg in enumerate(case.defendant_arguments):
        arg_type = arg.type if isinstance(arg, ArgumentItem) else arg.get('type')
        arg_content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
        print(f"[DEBUG] Defendant arg {i}: type={arg_type}, content={arg_content[:50] if arg_content else 'None'}...")
    
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
                print(f"[DEBUG] Added plaintiff argument to history: {content[:50]}...")
        for arg in case.defendant_arguments:
            # Handle both dictionary and ArgumentItem types for backward compatibility
            content = None
            if isinstance(arg, dict):
                content = arg.get('content')
            elif isinstance(arg, ArgumentItem):
                content = arg.content

            if content is not None:
                history += f"Defendant: {content}\n"
                print(f"[DEBUG] Added defendant argument to history: {content[:50]}...")
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
                print(f"[DEBUG] Added defendant argument to history: {content[:50]}...")
        for arg in case.plaintiff_arguments:
            # Handle both dictionary and ArgumentItem types for backward compatibility
            content = None
            if isinstance(arg, dict):
                content = arg.get('content')
            elif isinstance(arg, ArgumentItem):
                content = arg.content

            if content is not None:
                history += f"Plaintiff: {content}\n"
                print(f"[DEBUG] Added plaintiff argument to history: {content[:50]}...")
    
    print(f"[DEBUG] Final history length: {len(history)} characters")
    
    # Determine AI role based on user's role
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"
    print(f"[DEBUG] AI role for counter-argument: {ai_role}")
    
    # Check if this is a closing statement
    if is_closing:
        print("[DEBUG] Handling closing statement.")
        # Record user's closing statement
        if role == "plaintiff":
            case.plaintiff_arguments.append(ArgumentItem(
                type="closing",
                content=argument,
                user_id=current_user.id,
                role=Roles.PLAINTIFF,  # User is explicitly plaintiff
                timestamp=get_current_datetime()
            ))
        else:
            case.defendant_arguments.append(ArgumentItem(
                type="closing",
                content=argument,
                user_id=current_user.id,
                role=Roles.DEFENDANT,  # User is explicitly defendant
                timestamp=get_current_datetime()
            ))
        
        # Generate AI's closing statement
        counter = await closing_statement(history, ai_role, case.user_role.value)
        
        # Record AI's closing statement with proper role
        if role == "plaintiff":
            case.defendant_arguments.append(ArgumentItem(
                type="closing",
                content=counter,
                user_id=None,  # LLM-generated
                role=Roles.DEFENDANT,  # AI is defendant when user is plaintiff
                timestamp=get_current_datetime()
            ))
        else:
            case.plaintiff_arguments.append(ArgumentItem(
                type="closing",
                content=counter,
                user_id=None,  # LLM-generated
                role=Roles.PLAINTIFF,  # AI is plaintiff when user is defendant
                timestamp=get_current_datetime()
            ))
        
        # Update case status to CLOSED
        case.status = CaseStatus.CLOSED
    else:
        # Generate counter-argument for opposing side
        try:
            print(f"[DEBUG] Generating counter-argument for {ai_role} in response to {role}'s argument")
            print(f"[DEBUG] History length: {len(history)} characters")
            print(f"[DEBUG] Argument: {argument[:100]}...")
            counter = await generate_counter_argument(history, argument, ai_role, case.user_role.value, case.details)
            print(f"[DEBUG] Counter-argument generated: {counter[:100]}...")
            # Check if the response is the error message from the LLM service
            if counter.startswith("I apologize, but I'm unable to generate a counter argument"):
                print(f"[DEBUG] Error in counter-argument generation: {counter[:100]}...")
                # Return the error message without storing it as an argument
                return {"error": counter}
        except Exception as e:
            # Handle any exceptions during counter argument generation
            error_message = f"Error generating counter argument: {str(e)}"
            print(f"[DEBUG] Exception in counter-argument generation: {error_message}")
            return {"error": "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."}

    if case.status == CaseStatus.NOT_STARTED:
        case.status = CaseStatus.ACTIVE
    
    # If this is the first plaintiff argument (from user), generate defendant opening
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 0 and role == "plaintiff":
        print(f"[DEBUG] First plaintiff argument - adding AI defendant opening statement")
        case.defendant_arguments.append(ArgumentItem(
            type="opening",
            content=counter,
            user_id=None,  # LLM-generated
            role=Roles.DEFENDANT,  # AI is defendant
            timestamp=get_current_datetime()
        ))
    # Otherwise add counter argument to appropriate side based on who made the argument
    else:
        # If user is plaintiff, AI response should be saved in defendant arguments
        if role == "plaintiff":
            print(f"[DEBUG] Adding AI's (defendant) counter-argument to defendant arguments")
            counter_arg = ArgumentItem(
                type="counter",
                content=counter,
                user_id=None,  # LLM-generated
                role=Roles.DEFENDANT,  # AI is defendant
                timestamp=get_current_datetime()
            )
            case.defendant_arguments.append(counter_arg)
            print(f"[DEBUG] Defendant arguments count after adding counter: {len(case.defendant_arguments)}")
            for i, arg in enumerate(case.defendant_arguments):
                print(f"[DEBUG] Defendant arg {i}: type={getattr(arg, 'type', 'unknown')}, role={getattr(arg, 'role', 'unknown')}, user_id={getattr(arg, 'user_id', 'unknown')}, content={getattr(arg, 'content', 'unknown')[:50] if hasattr(arg, 'content') and arg.content else 'None'}...")
        # If user is defendant, AI response should be saved in plaintiff arguments
        else:
            print(f"[DEBUG] Adding AI's (plaintiff) counter-argument to plaintiff arguments")
            counter_arg = ArgumentItem(
                type="counter",
                content=counter,
                user_id=None,  # LLM-generated
                role=Roles.PLAINTIFF,  # AI is plaintiff
                timestamp=get_current_datetime()
            )
            case.plaintiff_arguments.append(counter_arg)
            print(f"[DEBUG] Plaintiff arguments count after adding counter: {len(case.plaintiff_arguments)}")
            for i, arg in enumerate(case.plaintiff_arguments):
                print(f"[DEBUG] Plaintiff arg {i}: type={getattr(arg, 'type', 'unknown')}, role={getattr(arg, 'role', 'unknown')}, user_id={getattr(arg, 'user_id', 'unknown')}, content={getattr(arg, 'content', 'unknown')[:50] if hasattr(arg, 'content') and arg.content else 'None'}...")


    await case.save()

    # Standardize response for AI-generated arguments
    response_data = {}
    
    print(f"[DEBUG] Preparing response data: plaintiff_args={len(case.plaintiff_arguments)}, defendant_args={len(case.defendant_arguments)}, role={role}")
    
    # Check if this is the first submission from plaintiff
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 1 and role == "plaintiff" and case.defendant_arguments[0].type == "opening" and case.defendant_arguments[0].user_id is None:
        print(f"[DEBUG] First plaintiff submission - returning AI defendant opening")
        # This was the AI defendant's opening statement generated because plaintiff submitted first
        response_data["ai_opening_statement"] = case.defendant_arguments[0].content if isinstance(case.defendant_arguments[0], ArgumentItem) else case.defendant_arguments[0]["content"]
        response_data["ai_opening_role"] = "defendant"
    # Check if this is the first submission from defendant
    elif len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 1 and role == "defendant" and case.plaintiff_arguments[0].type == "opening" and case.plaintiff_arguments[0].user_id is None:
        print(f"[DEBUG] First defendant submission - returning AI plaintiff opening and counter")
        # This was the AI plaintiff's opening statement generated because defendant submitted first
        response_data["ai_opening_statement"] = case.plaintiff_arguments[0].content if isinstance(case.plaintiff_arguments[0], ArgumentItem) else case.plaintiff_arguments[0]["content"]
        response_data["ai_opening_role"] = "plaintiff"
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role
    else:
        # This is a regular counter-argument
        print(f"[DEBUG] Regular submission - returning counter-argument: role={ai_role}, counter={counter[:50]}...")
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role # ai_role is 'defendant' if user is 'plaintiff', and vice-versa
        
    # Always ensure counter-argument is included for defendant's second submission
    if role == "defendant" and len(case.defendant_arguments) > 1:
        print(f"[DEBUG] Defendant's subsequent submission - ensuring counter-argument is included")
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = "plaintiff"

    print(f"[DEBUG] Final response data keys: {response_data.keys()}")
    if "ai_counter_argument" in response_data:
        print(f"[DEBUG] Counter-argument in response: {response_data['ai_counter_argument'][:50]}...")
    
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
    
    # Validate the role
    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
    
    # Check if the user's role in the case matches the requested role
    if case.user_role and case.user_role != Roles.NOT_STARTED and case.user_role.value != role:
        print(f"[DEBUG] Role mismatch: User role in case is {case.user_role.value}, but requested {role}")
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}"
        )
        
    # For backward compatibility, also check previous participation
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

    if existing_roles and role not in existing_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}"
        )
    
    # Add closing statement to the appropriate side
    # Check if current_user.id is not None before adding it
    user_id = current_user.id if current_user.id is not None else ""
    
    if role == "plaintiff":
        case.plaintiff_arguments.append(ArgumentItem(
            type="closing",
            content=statement,
            user_id=user_id,
            role=Roles.PLAINTIFF,  # User is explicitly plaintiff
            timestamp=get_current_datetime()
        ))
    else:
        case.defendant_arguments.append(ArgumentItem(
            type="closing",
            content=statement,
            user_id=user_id,
            role=Roles.DEFENDANT,  # User is explicitly defendant
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
    ai_closing = await closing_statement(history, ai_role, case.user_role.value)
    
    # Add AI's closing statement to the appropriate side with proper role
    if role == "plaintiff":
        case.defendant_arguments.append(ArgumentItem(
            type="closing",
            content=ai_closing,
            user_id=None,  # LLM-generated
            role=Roles.DEFENDANT,  # AI is defendant when user is plaintiff
            timestamp=get_current_datetime()
        ))
    else:
        case.plaintiff_arguments.append(ArgumentItem(
            type="closing",
            content=ai_closing,
            user_id=None,  # LLM-generated
            role=Roles.PLAINTIFF,  # AI is plaintiff when user is defendant
            timestamp=get_current_datetime()
        ))
    
    # Generate verdict using all arguments from both sides
    # Collect plaintiff and defendant arguments separately based on role
    plaintiff_side_args = []
    defendant_side_args = []

    # Process plaintiff arguments
    for arg in case.plaintiff_arguments:
        if isinstance(arg, ArgumentItem):
            if arg.type in ["user", "opening", "counter", "closing"]:
                if arg.role == Roles.PLAINTIFF:
                    plaintiff_side_args.append(str(arg.content))
                elif arg.role == Roles.DEFENDANT:
                    defendant_side_args.append(str(arg.content))
        elif isinstance(arg, dict):  # For backward compatibility
            if arg.get("type") in ["user", "opening", "counter", "closing"]:
                if arg.get("role") == Roles.PLAINTIFF.value:
                    plaintiff_side_args.append(str(arg["content"]))
                elif arg.get("role") == Roles.DEFENDANT.value:
                    defendant_side_args.append(str(arg["content"]))

    # Process defendant arguments
    for arg in case.defendant_arguments:
        if isinstance(arg, ArgumentItem):
            if arg.type in ["user", "opening", "counter", "closing"]:
                if arg.role == Roles.PLAINTIFF:
                    plaintiff_side_args.append(str(arg.content))
                elif arg.role == Roles.DEFENDANT:
                    defendant_side_args.append(str(arg.content))
        elif isinstance(arg, dict):  # For backward compatibility
            if arg.get("type") in ["user", "opening", "counter", "closing"]:
                if arg.get("role") == Roles.PLAINTIFF.value:
                    plaintiff_side_args.append(str(arg["content"]))
                elif arg.get("role") == Roles.DEFENDANT.value:
                    defendant_side_args.append(str(arg["content"]))

    # Pass the case description and properly organized arguments to the verdict generator
    case.verdict = await generate_verdict(
        plaintiff_arguments=plaintiff_side_args,
        defendant_arguments=defendant_side_args,
        case_details=case.details,
        title=case.title
    )
    case.status = CaseStatus.RESOLVED
    await case.save()
    
    response_data = {
        "verdict": case.verdict,
        "ai_closing_statement": ai_closing,
        "ai_closing_role": ai_role
    }

    return response_data
