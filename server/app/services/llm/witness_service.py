# app/services/llm/witness_service.py
"""
LLM service for witness examination during courtroom sessions.
Handles witness responses, cross-examination, and judge moderation.
"""

import time
import re
from typing import List, Optional, Dict
from app.utils.llm import llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.logging_config import get_logger

logger = get_logger(__name__)


async def examine_witness(
    witness_name: str,
    witness_role: str,
    witness_bio: str,
    examiner_role: str,
    question: str,
    case_details: str,
    examination_history: List[Dict] = None
) -> str:
    """
    Generate a witness response to an examination question.
    
    Args:
        witness_name: Name of the witness
        witness_role: Role of the witness (applicant or non_applicant)
        witness_bio: The witness's biography/background
        examiner_role: Who is asking ('plaintiff', 'defendant', or 'judge')
        question: The question being asked
        case_details: The case document for context
        examination_history: Previous Q&A in this examination session
    
    Returns:
        The witness's response to the question
    """
    logger.info(f"Generating witness response for {witness_name}, examiner: {examiner_role}")
    
    role_description = "applicant/petitioner" if witness_role == "applicant" else "non-applicant/respondent"
    examiner_description = {
        "plaintiff": "the plaintiff's lawyer",
        "defendant": "the defendant's lawyer", 
        "judge": "the Honorable Judge"
    }.get(examiner_role, "a lawyer")
    
    # Format examination history
    history_text = ""
    if examination_history:
        for item in examination_history[-8:]:  # Last 8 exchanges
            history_text += f"Q ({item.get('examiner', 'Lawyer')}): {item.get('question', '')}\n"
            history_text += f"A ({witness_name}): {item.get('answer', '')}\n\n"
    
    template = f"""You are role-playing as {witness_name}, a {role_description} in a legal case.
You are on the witness stand being examined by {examiner_description}.

Your Background:
{witness_bio}

Case Context (for reference, do not quote directly):
{case_details[:3000]}

Previous Examination (if any):
{history_text if history_text else "(This is the first question)"}

CRITICAL GUIDELINES FOR WITNESS TESTIMONY:
1. You are under oath - your responses must be truthful based on your character's knowledge
2. Stay in character as {witness_name} - respond with appropriate emotions and personality
3. If you don't know something, say so truthfully
4. Keep responses concise and direct - typically 2-4 sentences
5. If the question is unclear, politely ask for clarification
6. Address the Judge as "My Lord" or "Your Honour" when appropriate
7. Be respectful but respond based on your character's perspective
8. If the question is leading or objectionable, still answer but show discomfort if appropriate
9. Do NOT use formal legal language - speak like a real person testifying
10. Your demeanor should reflect your role - if you're the accused, show appropriate anxiety

Now respond to this question from {examiner_description}:
"{question}"

Respond as {witness_name} (witness):
"""
    
    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()
    
    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        # Remove any prefix like "Name:" that the LLM might add
        response = re.sub(rf"^{re.escape(witness_name)}:\s*", "", response).strip()
        response = re.sub(r"^(Witness|Answer|A):\s*", "", response, flags=re.IGNORECASE).strip()
        
        logger.info(f"Witness response generated for {witness_name} in {duration_ms:.2f}ms")
        return response
    except Exception as e:
        logger.error(f"Error in witness examination for {witness_name}: {str(e)}", exc_info=True)
        return "I'm sorry, My Lord, I'm feeling unwell and need a moment to compose myself."


async def generate_cross_examination_questions(
    witness_name: str,
    witness_role: str,
    ai_lawyer_role: str,
    case_details: str,
    testimony_so_far: List[Dict],
    case_arguments: str = ""
) -> str:
    """
    Generate a cross-examination question for the AI lawyer.
    
    Args:
        witness_name: Name of the witness
        witness_role: Role of the witness (applicant or non_applicant)
        ai_lawyer_role: The AI lawyer's role ('plaintiff' or 'defendant')
        case_details: The case document for context
        testimony_so_far: Previous Q&A exchanges in this examination
        case_arguments: Summary of arguments made so far in the case
    
    Returns:
        A cross-examination question
    """
    logger.info(f"Generating cross-examination question for {witness_name} by {ai_lawyer_role}")
    
    # Format testimony
    testimony_text = ""
    for item in testimony_so_far[-6:]:
        testimony_text += f"Q: {item.get('question', '')}\n"
        testimony_text += f"A: {item.get('answer', '')}\n\n"
    
    is_hostile = (witness_role == "applicant" and ai_lawyer_role == "defendant") or \
                 (witness_role == "non_applicant" and ai_lawyer_role == "plaintiff")
    
    witness_stance = "hostile witness (opposing party)" if is_hostile else "friendly witness (your client's side)"
    
    template = f"""You are an experienced Indian trial lawyer representing the {ai_lawyer_role}.
You are cross-examining {witness_name}, who is a {witness_stance}.

Case Details:
{case_details[:2500]}

Arguments made in this case so far:
{case_arguments[:1500] if case_arguments else "(Case just started)"}

Testimony from this witness so far:
{testimony_text if testimony_text else "(No testimony yet - this is the first question)"}

Generate ONE strategic cross-examination question. Your goals:
- {"Challenge the witness's credibility or find inconsistencies" if is_hostile else "Elicit testimony favorable to your client"}
- {"Look for gaps in their story or contradictions" if is_hostile else "Strengthen your case through their testimony"}
- Be professional but assertive
- Ask pointed, specific questions (not vague or open-ended)
- Refer to the Judge as "My Lord" or "Your Honour" if addressing the court

Respond with ONLY the question, no preamble or explanation. Start directly with the question.
"""
    
    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()
    
    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        # Clean up any prefixes
        response = re.sub(r"^(Question|Q|Cross-examination question):\s*", "", response, flags=re.IGNORECASE).strip()
        
        logger.info(f"Cross-examination question generated in {duration_ms:.2f}ms")
        return response
    except Exception as e:
        logger.error(f"Error generating cross-examination question: {str(e)}", exc_info=True)
        return f"{witness_name}, could you please clarify your earlier statement for the court?"


async def should_ai_call_witness(
    ai_role: str,
    case_details: str,
    arguments_history: str,
    available_witnesses: List[Dict],
    testimonies_given: List[str]
) -> Optional[str]:
    """
    Determine if the AI lawyer should call a witness, and which one.
    
    Args:
        ai_role: The AI lawyer's role
        case_details: The case details
        arguments_history: History of arguments so far
        available_witnesses: List of available witnesses with their info
        testimonies_given: List of witness IDs who have already testified
    
    Returns:
        witness_id if AI decides to call a witness, None otherwise
    """
    logger.info(f"Evaluating whether AI ({ai_role}) should call a witness")
    
    # Filter out witnesses who already testified
    untestified = [w for w in available_witnesses if w.get('id') not in testimonies_given]
    
    if not untestified:
        logger.debug("No untestified witnesses available")
        return None
    
    # Use numbered list for unambiguous selection
    witness_list = "\n".join([
        f"{i+1}. {w.get('name')} ({w.get('role')}): {w.get('bio', '')[:200]}..."
        for i, w in enumerate(untestified[:5])
    ])
    
    template = f"""You are an experienced Indian trial lawyer representing the {ai_role}.

Case Details:
{case_details[:2000]}

Arguments so far:
{arguments_history[:1500]}

Available witnesses who have NOT yet testified:
{witness_list}

Based on the case progress, should you call a witness now? Consider:
1. Would witness testimony strengthen your current argument?
2. Is there a strategic advantage to calling a witness at this point?
3. Would it be better to continue with arguments instead?

You should call a witness if their testimony could support your case. Do NOT always refuse.

Respond with ONLY one of these exact formats (no extra text):
- CALL: [number] (e.g. CALL: 1) if you want to call a witness
- NO_WITNESS if you should continue with arguments

Your response:
"""
    
    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()
    
    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        
        logger.info(f"AI witness decision raw response: '{response}' (took {duration_ms:.2f}ms)")
        
        if "CALL" in response.upper():
            # Try index-based matching first (e.g., "CALL: 1" or "CALL: 2")
            index_match = re.search(r'CALL\s*:\s*(\d+)', response, re.IGNORECASE)
            if index_match:
                witness_index = int(index_match.group(1)) - 1  # Convert to 0-based
                if 0 <= witness_index < len(untestified):
                    selected = untestified[witness_index]
                    logger.info(f"AI decided to call witness by index: {selected.get('name')} (index {witness_index + 1})")
                    return selected.get('id')
                else:
                    logger.warning(f"AI returned invalid witness index: {index_match.group(1)}, available: {len(untestified)}")
            
            # Fallback: try name-based matching (fuzzy)
            call_match = re.search(r'CALL\s*:\s*(.+)', response, re.IGNORECASE)
            if call_match:
                witness_name = call_match.group(1).strip().strip('"').strip("'").strip()
                logger.debug(f"Trying name-based matching for: '{witness_name}'")
                
                # Try exact match first
                for w in untestified:
                    if w.get('name', '').lower().strip() == witness_name.lower().strip():
                        logger.info(f"AI decided to call witness (exact name match): {w.get('name')}")
                        return w.get('id')
                
                # Try substring/partial match
                for w in untestified:
                    w_name = w.get('name', '').lower().strip()
                    if w_name in witness_name.lower() or witness_name.lower() in w_name:
                        logger.info(f"AI decided to call witness (partial name match): {w.get('name')} matched '{witness_name}'")
                        return w.get('id')
                
                logger.warning(f"AI wanted to call witness '{witness_name}' but no match found. Available: {[w.get('name') for w in untestified]}")
        
        logger.info("AI decided not to call a witness at this time")
        return None
    except Exception as e:
        logger.error(f"Error in AI witness decision: {str(e)}", exc_info=True)
        return None


async def should_continue_cross_examination(
    witness_name: str,
    witness_role: str,
    ai_lawyer_role: str,
    case_details: str,
    testimony_so_far: List[Dict],
    questions_asked: int,
    max_questions: int = 5
) -> bool:
    """
    Determine if the AI lawyer should continue cross-examination.
    
    Args:
        witness_name: Name of the witness
        witness_role: Role of the witness (applicant or non_applicant)
        ai_lawyer_role: The AI lawyer's role
        case_details: The case document for context
        testimony_so_far: Previous Q&A exchanges
        questions_asked: Number of questions already asked by AI
        max_questions: Maximum allowed questions (default 5)
    
    Returns:
        True if AI should ask another question, False to stop
    """
    logger.info(f"Evaluating if AI should continue cross-examination (questions asked: {questions_asked}/{max_questions})")
    
    # Hard cap
    if questions_asked >= max_questions:
        logger.info("Max questions reached, stopping cross-examination")
        return False
    
    # First question always asked
    if questions_asked == 0:
        return True
    
    # Format recent testimony
    testimony_text = ""
    for item in testimony_so_far[-4:]:
        testimony_text += f"Q: {item.get('question', '')}\n"
        testimony_text += f"A: {item.get('answer', '')}\n\n"
    
    is_hostile = (witness_role == "applicant" and ai_lawyer_role == "defendant") or \
                 (witness_role == "non_applicant" and ai_lawyer_role == "plaintiff")
    
    template = f"""You are an experienced trial lawyer representing the {ai_lawyer_role}.
You are cross-examining {witness_name}, {'a hostile witness' if is_hostile else 'a friendly witness'}.
You have asked {questions_asked} question(s) so far (maximum {max_questions}).

Recent testimony:
{testimony_text}

Evaluate whether you should ask another question. Consider:
1. Have you achieved your strategic goals with this witness?
2. Is there more valuable information to extract? (If NO, say STOP)
3. Would further questioning risk damaging your case?
4. Have you exposed sufficient contradictions/weaknesses?

IMPORTANT: DO NOT feel obligated to reach the maximum question limit.
If you have made your point or the witness is not yielding new info, choose STOP.
Quality over quantity.

Respond with ONLY one word:
- "CONTINUE" if you should ask another question
- "STOP" if you have achieved your objectives

Your decision:
"""
    
    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()
    
    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip().upper()
        
        should_continue = "CONTINUE" in response
        logger.info(f"AI cross-examination decision: {'continue' if should_continue else 'stop'} (took {duration_ms:.2f}ms)")
        
        return should_continue
    except Exception as e:
        logger.error(f"Error in cross-examination decision: {str(e)}", exc_info=True)
        # Default to stopping if error
        return False
