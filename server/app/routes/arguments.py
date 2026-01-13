# app/routes/arguments.py
import time
from fastapi import APIRouter, Body, Depends, HTTPException
from app.models.case import Case, CaseStatus
from app.dependencies import get_current_user
from app.services.llm.lawyer import generate_counter_argument, opening_statement, closing_statement
from app.services.llm.judge import generate_verdict
from app.models.user import User
from app.utils.rate_limiter import argument_rate_limiter
from app.utils.datetime import get_current_datetime
from app.models.case import ArgumentItem, Roles
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["arguments"])

@router.post("/{case_cnr}/arguments")
async def submit_argument(
    case_cnr: str,
    role: str = Body(...),
    argument: str = Body(...),
    is_closing: bool = Body(False),
    current_user: User = Depends(get_current_user),
    _rate_check: User = Depends(argument_rate_limiter.check_only)
):
    logger.info(f"Argument submission for case {case_cnr}, role={role}, length={len(argument)}")

    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        logger.warning(f"Case not found: {case_cnr}")
        raise HTTPException(status_code=404, detail="Case not found")

    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized argument submission for case {case_cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Validate the role
    try:
        role_enum = Roles(role)
    except ValueError:
        logger.warning(f"Invalid role specified: {role}")
        raise HTTPException(status_code=400, detail="Invalid role specified. Must be 'plaintiff' or 'defendant'")
        
    # Check if the user's role in the case matches the requested role
    if case.user_role and case.user_role != Roles.NOT_STARTED and case.user_role.value != role:
        logger.warning(f"Role mismatch for case {case_cnr}: user_role={case.user_role.value}, requested={role}")
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}"
        )
        
    logger.debug(f"Current arguments: Plaintiff={len(case.plaintiff_arguments)}, Defendant={len(case.defendant_arguments)}")

    # Check if this is the first argument submission
    if not case.plaintiff_arguments and not case.defendant_arguments:
        logger.info(f"First argument for case {case_cnr}")
        # First argument must be from plaintiff (either user or AI)
        if role != "plaintiff":
            logger.info(f"User is defendant - generating AI plaintiff opening for case {case_cnr}")
            start_time = time.perf_counter()
            
            plaintiff_opening_statement = await opening_statement("plaintiff", case.details, "defendant")
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Plaintiff opening statement generated in {duration_ms:.2f}ms")
            
            case.plaintiff_arguments.append(ArgumentItem(
                type="opening",
                content=plaintiff_opening_statement,
                user_id=None,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime()
            ))

            # User's submitted argument is recorded as the defendant's opening statement
            case.defendant_arguments.append(ArgumentItem(
                type="opening",
                content=argument,
                user_id=current_user.id,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime()
            ))

            # Prepare history for counter-argument
            history = f"Defendant: {argument}\n"
            
            # AI (as plaintiff) generates a counter-argument
            start_time = time.perf_counter()
            ai_plaintiff_counter = await generate_counter_argument(history, argument, "plaintiff", case.user_role.value, case.details)
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Plaintiff counter-argument generated in {duration_ms:.2f}ms")
            
            case.plaintiff_arguments.append(ArgumentItem(
                type="counter",
                content=ai_plaintiff_counter,
                user_id=None,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime()
            ))

            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE
                logger.debug(f"Case {case_cnr} status updated to ACTIVE")

            try:
                await case.save()
                logger.debug(f"Case {case_cnr} saved successfully")
            except Exception as e:
                logger.error(f"Error saving case {case_cnr}: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail="Failed to save case. Please try again.")

            await argument_rate_limiter.register_usage(str(current_user.id))
            
            return {
                "ai_opening_statement": plaintiff_opening_statement,
                "ai_opening_role": "plaintiff",
                "ai_counter_argument": ai_plaintiff_counter,
                "ai_counter_role": "plaintiff"
            }
        else:
            logger.info(f"User is plaintiff - submitting first argument for case {case_cnr}")
            case.plaintiff_arguments.append(ArgumentItem(
                type="opening",
                content=argument,
                user_id=current_user.id,
                role=role_enum,
                timestamp=get_current_datetime()
            ))
            
            # Generate defendant's opening statement
            start_time = time.perf_counter()
            defendant_opening_statement = await opening_statement("defendant", case.details, "plaintiff")
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Defendant opening statement generated in {duration_ms:.2f}ms")
            
            case.defendant_arguments.append(ArgumentItem(
                type="opening",
                content=defendant_opening_statement,
                user_id=None,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime()
            ))
            
            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE
                logger.debug(f"Case {case_cnr} status updated to ACTIVE")
                
            try:
                await case.save()
            except Exception as e:
                logger.error(f"Error saving case {case_cnr}: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail="Failed to save case. Please try again.")
            
            await argument_rate_limiter.register_usage(str(current_user.id))
            
            return {
                "ai_opening_statement": defendant_opening_statement,
                "ai_opening_role": "defendant"
            }
    elif not case.plaintiff_arguments and role == "defendant":
        logger.warning(f"Defendant trying to submit before plaintiff for case {case_cnr}")
        raise HTTPException(
            status_code=400,
            detail="The plaintiff must go first in the case."
        )
    else:
        logger.debug(f"Case {case_cnr} already has arguments - processing regular submission")
        
    # For backward compatibility, check previous participation
    existing_roles = set()
    for arg in case.plaintiff_arguments:
        if arg.user_id is not None and str(arg.user_id) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        if arg.user_id is not None and str(arg.user_id) == str(current_user.id):
            existing_roles.add("defendant")

    if existing_roles and role not in existing_roles:
        logger.warning(f"Role switch attempt in case {case_cnr}: previous={existing_roles}, requested={role}")
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}"
        )
    else:
        user_id = current_user.id if current_user.id is not None else ""
        
        if role == "plaintiff":
            case.plaintiff_arguments.append(ArgumentItem(
                type="user",
                content=argument,
                user_id=user_id,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime()
            ))
        else:
            case.defendant_arguments.append(ArgumentItem(
                type="user",
                content=argument,
                user_id=user_id,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime()
            ))

    # Prepare history for counter-argument generation
    history = ""
    if role == "plaintiff":
        for arg in case.plaintiff_arguments:
            content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
            if content:
                history += f"Plaintiff: {content}\n"
        for arg in case.defendant_arguments:
            content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
            if content:
                history += f"Defendant: {content}\n"
    else:
        for arg in case.defendant_arguments:
            content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
            if content:
                history += f"Defendant: {content}\n"
        for arg in case.plaintiff_arguments:
            content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
            if content:
                history += f"Plaintiff: {content}\n"
    
    # Determine AI role based on user's role
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"
    
    # Check if this is a closing statement
    if is_closing:
        logger.info(f"Processing closing statement for case {case_cnr}")
        if role == "plaintiff":
            case.plaintiff_arguments.append(ArgumentItem(
                type="closing",
                content=argument,
                user_id=current_user.id,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime()
            ))
        else:
            case.defendant_arguments.append(ArgumentItem(
                type="closing",
                content=argument,
                user_id=current_user.id,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime()
            ))
        
        # Generate AI's closing statement
        start_time = time.perf_counter()
        counter = await closing_statement(history, ai_role, case.user_role.value)
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"AI closing statement generated in {duration_ms:.2f}ms")
        
        if role == "plaintiff":
            case.defendant_arguments.append(ArgumentItem(
                type="closing",
                content=counter,
                user_id=None,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime()
            ))
        else:
            case.plaintiff_arguments.append(ArgumentItem(
                type="closing",
                content=counter,
                user_id=None,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime()
            ))
        
        case.status = CaseStatus.CLOSED
    else:
        # Generate counter-argument
        start_time = time.perf_counter()
        try:
            counter = await generate_counter_argument(history, argument, ai_role, case.user_role.value, case.details)
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Counter-argument generated for case {case_cnr} in {duration_ms:.2f}ms")
            
            if counter.startswith("I apologize, but I'm unable to generate a counter argument"):
                logger.warning(f"LLM returned error response for case {case_cnr}")
                return {"error": counter}
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Counter-argument generation failed for case {case_cnr} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
            return {"error": "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."}

    if case.status == CaseStatus.NOT_STARTED:
        case.status = CaseStatus.ACTIVE
    
    # Add counter argument to appropriate side
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 0 and role == "plaintiff":
        case.defendant_arguments.append(ArgumentItem(
            type="opening",
            content=counter,
            user_id=None,
            role=Roles.DEFENDANT,
            timestamp=get_current_datetime()
        ))
    else:
        if role == "plaintiff":
            case.defendant_arguments.append(ArgumentItem(
                type="counter",
                content=counter,
                user_id=None,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime()
            ))
        else:
            case.plaintiff_arguments.append(ArgumentItem(
                type="counter",
                content=counter,
                user_id=None,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime()
            ))

    await argument_rate_limiter.register_usage(str(current_user.id))

    try:
        await case.save()
        logger.debug(f"Case {case_cnr} saved after argument submission")
    except Exception as e:
        logger.error(f"Error saving case {case_cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save case. Please try again.")

    # Prepare response
    response_data = {}
    
    if len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 1 and role == "plaintiff" and case.defendant_arguments[0].type == "opening" and case.defendant_arguments[0].user_id is None:
        response_data["ai_opening_statement"] = case.defendant_arguments[0].content if isinstance(case.defendant_arguments[0], ArgumentItem) else case.defendant_arguments[0]["content"]
        response_data["ai_opening_role"] = "defendant"
    elif len(case.plaintiff_arguments) == 1 and len(case.defendant_arguments) == 1 and role == "defendant" and case.plaintiff_arguments[0].type == "opening" and case.plaintiff_arguments[0].user_id is None:
        response_data["ai_opening_statement"] = case.plaintiff_arguments[0].content if isinstance(case.plaintiff_arguments[0], ArgumentItem) else case.plaintiff_arguments[0]["content"]
        response_data["ai_opening_role"] = "plaintiff"
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role
    else:
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role
        
    if role == "defendant" and len(case.defendant_arguments) > 1:
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = "plaintiff"

    logger.debug(f"Argument submission completed for case {case_cnr}")
    return response_data


@router.post("/{case_cnr}/closing-statement")
async def submit_closing_statement(
    case_cnr: str,
    role: str = Body(...),
    statement: str = Body(...),
    current_user: User = Depends(get_current_user),
    _rate_check: User = Depends(argument_rate_limiter.check_only)
):
    logger.info(f"Closing statement submission for case {case_cnr}, role={role}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        logger.warning(f"Case not found: {case_cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized closing statement for case {case_cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
    
    if case.user_role and case.user_role != Roles.NOT_STARTED and case.user_role.value != role:
        logger.warning(f"Role mismatch for closing statement: user_role={case.user_role.value}, requested={role}")
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}"
        )
        
    # Check previous participation
    existing_roles = set()
    for arg in case.plaintiff_arguments:
        arg_user_id = arg.get('user_id') if isinstance(arg, dict) else getattr(arg, 'user_id', None)
        if arg_user_id is not None and str(arg_user_id) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        arg_user_id = arg.get('user_id') if isinstance(arg, dict) else getattr(arg, 'user_id', None)
        if arg_user_id is not None and str(arg_user_id) == str(current_user.id):
            existing_roles.add("defendant")

    if existing_roles and role not in existing_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}"
        )
    
    user_id = current_user.id if current_user.id is not None else ""
    
    if role == "plaintiff":
        case.plaintiff_arguments.append(ArgumentItem(
            type="closing",
            content=statement,
            user_id=user_id,
            role=Roles.PLAINTIFF,
            timestamp=get_current_datetime()
        ))
    else:
        case.defendant_arguments.append(ArgumentItem(
            type="closing",
            content=statement,
            user_id=user_id,
            role=Roles.DEFENDANT,
            timestamp=get_current_datetime()
        ))
    
    try:
        await case.save()
    except Exception as e:
        logger.error(f"Error saving closing statement for case {case_cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save closing statement. Please try again.")
    
    # Prepare history for AI closing statement
    history = ""
    for arg in case.plaintiff_arguments:
        content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
        arg_type = arg.type if isinstance(arg, ArgumentItem) else arg.get('type')
        if content:
            if arg_type == 'plaintiff':
                history += f"Plaintiff: {content}\n"
            elif arg_type == 'defendant':
                history += f"Defendant: {content}\n"
    for arg in case.defendant_arguments:
        content = arg.content if isinstance(arg, ArgumentItem) else arg.get('content')
        arg_type = arg.type if isinstance(arg, ArgumentItem) else arg.get('type')
        if content:
            if arg_type == 'plaintiff':
                history += f"Plaintiff: {content}\n"
            elif arg_type == 'defendant':
                history += f"Defendant: {content}\n"
    
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"
    
    # Generate AI's closing statement
    start_time = time.perf_counter()
    try:
        ai_closing = await closing_statement(history, ai_role, case.user_role.value)
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"AI closing statement generated for case {case_cnr} in {duration_ms:.2f}ms")
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"AI closing statement generation failed for case {case_cnr} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate AI closing statement. Please try again.")
    
    if role == "plaintiff":
        case.defendant_arguments.append(ArgumentItem(
            type="closing",
            content=ai_closing,
            user_id=None,
            role=Roles.DEFENDANT,
            timestamp=get_current_datetime()
        ))
    else:
        case.plaintiff_arguments.append(ArgumentItem(
            type="closing",
            content=ai_closing,
            user_id=None,
            role=Roles.PLAINTIFF,
            timestamp=get_current_datetime()
        ))
    
    # Collect arguments for verdict generation
    plaintiff_side_args = []
    defendant_side_args = []

    for arg in case.plaintiff_arguments:
        if isinstance(arg, ArgumentItem):
            if arg.type in ["user", "opening", "counter", "closing"]:
                if arg.role == Roles.PLAINTIFF:
                    plaintiff_side_args.append(str(arg.content))
                elif arg.role == Roles.DEFENDANT:
                    defendant_side_args.append(str(arg.content))
        elif isinstance(arg, dict):
            if arg.get("type") in ["user", "opening", "counter", "closing"]:
                if arg.get("role") == Roles.PLAINTIFF.value:
                    plaintiff_side_args.append(str(arg["content"]))
                elif arg.get("role") == Roles.DEFENDANT.value:
                    defendant_side_args.append(str(arg["content"]))

    for arg in case.defendant_arguments:
        if isinstance(arg, ArgumentItem):
            if arg.type in ["user", "opening", "counter", "closing"]:
                if arg.role == Roles.PLAINTIFF:
                    plaintiff_side_args.append(str(arg.content))
                elif arg.role == Roles.DEFENDANT:
                    defendant_side_args.append(str(arg.content))
        elif isinstance(arg, dict):
            if arg.get("type") in ["user", "opening", "counter", "closing"]:
                if arg.get("role") == Roles.PLAINTIFF.value:
                    plaintiff_side_args.append(str(arg["content"]))
                elif arg.get("role") == Roles.DEFENDANT.value:
                    defendant_side_args.append(str(arg["content"]))

    # Generate verdict
    start_time = time.perf_counter()
    try:
        case.verdict = await generate_verdict(
            plaintiff_arguments=plaintiff_side_args,
            defendant_arguments=defendant_side_args,
            case_details=case.details,
            title=case.title
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Verdict generated for case {case_cnr} in {duration_ms:.2f}ms")
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"Verdict generation failed for case {case_cnr} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate verdict. Please try again.")
    
    await argument_rate_limiter.register_usage(str(current_user.id))
    
    case.status = CaseStatus.RESOLVED
    try:
        await case.save()
        logger.info(f"Case {case_cnr} resolved with verdict")
    except Exception as e:
        logger.error(f"Error saving verdict for case {case_cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save verdict. Please try again.")
    
    return {
        "verdict": case.verdict,
        "ai_closing_statement": ai_closing,
        "ai_closing_role": ai_role
    }
