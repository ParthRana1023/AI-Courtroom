# app/services/llm/parties_service.py
"""
Combined LLM service for parties involved in cases.
Handles: extraction, role assignment, bio generation, and chat.
"""

import time
import re
from typing import List, Optional
from app.utils.llm import llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.models.party import PartyRole, PartyInvolved
from app.logging_config import get_logger

logger = get_logger(__name__)


async def extract_names_from_case(case_text: str) -> List[str]:
    """
    Extract all parties/organization names from case text.
    
    Args:
        case_text: The full case text
        
    Returns:
        List of names (parties and organizations)
    """
    template = """Extract all people and organizations who are PARTIES to this legal case.

CASE TEXT:
{case_text}

RULES:
- Extract only the names of parties (applicants, non-applicants, petitioners, respondents, accused, victims)
- Do NOT include judges, lawyers, court officials, or witnesses
- Include both individuals AND organizations/companies
- Return ONLY names, one per line
- Do not add any descriptions or roles

Example output:
Rahul Sharma
Priya Patel
Mumbai Trading Co. Pvt Ltd
"""

    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({"case_text": case_text[:8000]})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        
        # Extract names from response
        names = [name.strip() for name in response.split('\n') if name.strip()]
        # Remove numbering if present (e.g., "1. Name" -> "Name")
        names = [re.sub(r'^\d+\.\s*', '', name) for name in names]
        # Remove duplicates while preserving order
        seen = set()
        unique_names = []
        for name in names:
            if name.lower() not in seen:
                seen.add(name.lower())
                unique_names.append(name)
        
        logger.info(f"Extracted {len(unique_names)} party names in {duration_ms:.2f}ms")
        return unique_names
        
    except Exception as e:
        logger.error(f"Error extracting names from case: {str(e)}", exc_info=True)
        return []


async def generate_party_details(
    party_name: str, 
    case_text: str
) -> PartyInvolved:
    """
    Generate complete details for a party using LLM.
    Returns the raw markdown response stored in the bio field.
    
    Args:
        party_name: Name of the party/organization
        case_text: The full case text for context
        
    Returns:
        PartyInvolved with role and markdown bio (raw LLM response)
    """
    logger.debug(f"Generating details for party: {party_name}")
    
    template = """Analyze this legal case and provide details about **{party_name}**.

CASE TEXT:
{case_text}

Provide the following information about {party_name} in markdown format:

## Role
State whether they are an **APPLICANT** (petitioner, complainant, plaintiff, victim who filed the case) or **NON-APPLICANT** (respondent, accused, defendant against whom the case is filed).

## Basic Details
- **Occupation**: (if mentioned in case, otherwise make a reasonable inference)
- **Age**: (if mentioned, otherwise estimate based on context)
- **Address**: (if mentioned in case)

## Background
Write 2-3 paragraphs about this party's background, their involvement in the case, and their perspective. Make it feel like a real person's/organization's story, not legal language.

---
Important: Base everything on the case text. For the role, look for keywords like "applicant", "petitioner", "complainant" for APPLICANT, and "non-applicant", "respondent", "accused", "defendant" for NON-APPLICANT.
"""

    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({
            "party_name": party_name,
            "case_text": case_text[:6000]
        })
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        
        # Determine role from response
        role = PartyRole.NON_APPLICANT  # Default
        response_lower = response.lower()
        
        # Check for role in the response
        if "## role" in response_lower:
            role_section = response_lower.split("## role")[1].split("##")[0] if "##" in response_lower.split("## role")[1] else response_lower.split("## role")[1]
            if "applicant" in role_section and "non" not in role_section.split("applicant")[0][-5:]:
                role = PartyRole.APPLICANT
        
        # Also check for explicit mentions
        if "**applicant**" in response_lower and "non-applicant" not in response_lower:
            role = PartyRole.APPLICANT
        elif "non-applicant" in response_lower or "non_applicant" in response_lower:
            role = PartyRole.NON_APPLICANT
        
        # Try to extract basic info from response for the model fields
        occupation = None
        age = None
        address = None
        
        # Simple extraction (optional - main data is in bio)
        occ_match = re.search(r'\*\*Occupation\*\*:\s*(.+?)(?:\n|$)', response)
        if occ_match:
            occupation = occ_match.group(1).strip()
            if occupation.lower() in ['unknown', 'n/a', 'not mentioned']:
                occupation = None
        
        age_match = re.search(r'\*\*Age\*\*:\s*(\d+)', response)
        if age_match:
            age = int(age_match.group(1))
        
        addr_match = re.search(r'\*\*Address\*\*:\s*(.+?)(?:\n|$)', response)
        if addr_match:
            address = addr_match.group(1).strip()
            if address.lower() in ['unknown', 'n/a', 'not mentioned']:
                address = None
        
        logger.info(f"Party details generated for {party_name} (role={role.value}) in {duration_ms:.2f}ms")
        
        return PartyInvolved(
            name=party_name,
            role=role,
            occupation=occupation,
            age=age,
            address=address,
            bio=response  # Store raw markdown response
        )
        
    except Exception as e:
        logger.error(f"Error generating details for {party_name}: {str(e)}", exc_info=True)
        return PartyInvolved(
            name=party_name,
            role=PartyRole.NON_APPLICANT,
            bio=f"Details for {party_name} could not be generated."
        )


async def extract_and_assign_parties(case_text: str) -> List[PartyInvolved]:
    """
    Extract all parties from case and generate their details.
    Makes N LLM calls (one per party) to get rich markdown details.
    
    Args:
        case_text: The full case text
        
    Returns:
        List of PartyInvolved with roles and markdown bios
    """
    logger.info("Starting party extraction and assignment")
    start_time = time.perf_counter()
    
    # Step 1: Extract names
    names = await extract_names_from_case(case_text)
    
    if not names:
        logger.warning("No party names extracted from case")
        return []
    
    # Step 2: Generate details for each party
    parties = []
    for name in names:
        logger.debug(f"Processing party: {name}")
        party = await generate_party_details(name, case_text)
        parties.append(party)
    
    duration_ms = (time.perf_counter() - start_time) * 1000
    logger.info(f"Extracted and processed {len(parties)} parties in {duration_ms:.2f}ms")
    return parties


async def chat_with_party(
    party_name: str,
    party_role: str,
    party_bio: str,
    case_details: str,
    chat_history: list,
    user_message: str
) -> str:
    """
    Generate a response from a party involved in the case to a chat message.
    
    Args:
        party_name: Name of the party
        party_role: Role of the party (applicant or non_applicant)
        party_bio: The party's biography/background (markdown)
        case_details: The case document text for context
        chat_history: Previous chat messages [{"sender": "user"|"party", "content": "..."}]
        user_message: The new message from the user
    
    Returns:
        The party's response to the message
    """
    logger.info(f"Generating chat response for party: {party_name}")
    
    role_description = "applicant/petitioner" if party_role == "applicant" else "non-applicant/respondent"
    
    # Format chat history
    history_text = ""
    if chat_history:
        for msg in chat_history[-10:]:
            sender = "User (Lawyer)" if msg.get("sender") == "user" else party_name
            history_text += f"{sender}: {msg.get('content', '')}\n"
    
    template = f"""You are role-playing as {party_name}, a {role_description} in a legal case.
You are being interviewed by a lawyer to gather context about the case.

Your Background:
{party_bio}

Case Context (for reference only, do not quote directly):
{case_details[:3000]}

Important Guidelines:
- Stay in character as {party_name} at all times
- Respond naturally and conversationally, like a real person would
- Answer questions based on your perspective as the {role_description}
- If asked about legal strategy or what you should do, defer to your lawyer
- Be helpful but don't volunteer information not asked for
- Keep responses concise (2-4 sentences typically)
- Show appropriate emotions based on your role in the case
- Do NOT use formal legal language - speak like a regular person

Previous Conversation:
{history_text if history_text else "(No previous conversation)"}

User (Lawyer): {user_message}

Respond as {party_name}:
"""
    
    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()
    
    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        # Remove any prefix like "Name:" that the LLM might add
        response = re.sub(rf"^{re.escape(party_name)}:\s*", "", response).strip()
        
        logger.info(f"Chat response generated for {party_name} in {duration_ms:.2f}ms")
        return response
    except Exception as e:
        logger.error(f"Error in chat with {party_name}: {str(e)}", exc_info=True)
        return "I'm sorry, I'm having trouble responding right now. Could you please repeat that?"
