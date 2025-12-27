# app/services/llm/people_service.py
"""
Combined LLM service for people involved in cases.
Handles: extraction, role assignment, bio generation, and chat.
"""

import re
from typing import List, Optional
from app.utils.llm import llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.models.person import PersonRole, PersonInvolved


async def extract_names_from_case(case_text: str) -> List[str]:
    """
    Extract all people/organization names from case text.
    
    Args:
        case_text: The full case text
        
    Returns:
        List of names (people and organizations)
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
        response = await chain.ainvoke({"case_text": case_text[:8000]})
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
        
        print(f"Extracted {len(unique_names)} names from case text")
        return unique_names
        
    except Exception as e:
        print(f"Error extracting names: {str(e)}")
        return []


async def generate_person_details(
    person_name: str, 
    case_text: str
) -> PersonInvolved:
    """
    Generate complete details for a person using LLM.
    Returns the raw markdown response stored in the bio field.
    
    Args:
        person_name: Name of the person/organization
        case_text: The full case text for context
        
    Returns:
        PersonInvolved with role and markdown bio (raw LLM response)
    """
    template = """Analyze this legal case and provide details about **{person_name}**.

CASE TEXT:
{case_text}

Provide the following information about {person_name} in markdown format:

## Role
State whether they are an **APPLICANT** (petitioner, complainant, plaintiff, victim who filed the case) or **NON-APPLICANT** (respondent, accused, defendant against whom the case is filed).

## Basic Details
- **Occupation**: (if mentioned in case, otherwise make a reasonable inference)
- **Age**: (if mentioned, otherwise estimate based on context)
- **Address**: (if mentioned in case)

## Background
Write 2-3 paragraphs about this person's background, their involvement in the case, and their perspective. Make it feel like a real person's story, not legal language.

---
Important: Base everything on the case text. For the role, look for keywords like "applicant", "petitioner", "complainant" for APPLICANT, and "non-applicant", "respondent", "accused", "defendant" for NON-APPLICANT.
"""

    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()

    try:
        response = await chain.ainvoke({
            "person_name": person_name,
            "case_text": case_text[:6000]
        })
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        
        # Determine role from response
        role = PersonRole.NON_APPLICANT  # Default
        response_lower = response.lower()
        
        # Check for role in the response
        if "## role" in response_lower:
            role_section = response_lower.split("## role")[1].split("##")[0] if "##" in response_lower.split("## role")[1] else response_lower.split("## role")[1]
            if "applicant" in role_section and "non" not in role_section.split("applicant")[0][-5:]:
                role = PersonRole.APPLICANT
        
        # Also check for explicit mentions
        if "**applicant**" in response_lower and "non-applicant" not in response_lower:
            role = PersonRole.APPLICANT
        elif "non-applicant" in response_lower or "non_applicant" in response_lower:
            role = PersonRole.NON_APPLICANT
        
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
        
        return PersonInvolved(
            name=person_name,
            role=role,
            occupation=occupation,
            age=age,
            address=address,
            bio=response  # Store raw markdown response
        )
        
    except Exception as e:
        print(f"Error generating details for {person_name}: {str(e)}")
        return PersonInvolved(
            name=person_name,
            role=PersonRole.NON_APPLICANT,
            bio=f"Details for {person_name} could not be generated."
        )


async def extract_and_assign_people(case_text: str) -> List[PersonInvolved]:
    """
    Extract all people from case and generate their details.
    Makes N LLM calls (one per person) to get rich markdown details.
    
    Args:
        case_text: The full case text
        
    Returns:
        List of PersonInvolved with roles and markdown bios
    """
    # Step 1: Extract names
    names = await extract_names_from_case(case_text)
    
    if not names:
        print("No names extracted from case")
        return []
    
    # Step 2: Generate details for each person
    people = []
    for name in names:
        print(f"Generating details for: {name}")
        person = await generate_person_details(name, case_text)
        people.append(person)
    
    print(f"Generated details for {len(people)} people")
    return people


async def chat_with_person(
    person_name: str,
    person_role: str,
    person_bio: str,
    case_details: str,
    chat_history: list,
    user_message: str
) -> str:
    """
    Generate a response from a person involved in the case to a chat message.
    
    Args:
        person_name: Name of the person
        person_role: Role of the person (applicant or non_applicant)
        person_bio: The person's biography/background (markdown)
        case_details: The case document text for context
        chat_history: Previous chat messages [{"sender": "user"|"person", "content": "..."}]
        user_message: The new message from the user
    
    Returns:
        The person's response to the message
    """
    role_description = "applicant/petitioner" if person_role == "applicant" else "non-applicant/respondent"
    
    # Format chat history
    history_text = ""
    if chat_history:
        for msg in chat_history[-10:]:
            sender = "User (Lawyer)" if msg.get("sender") == "user" else person_name
            history_text += f"{sender}: {msg.get('content', '')}\n"
    
    template = f"""You are role-playing as {person_name}, a {role_description} in a legal case.
You are being interviewed by a lawyer to gather context about the case.

Your Background:
{person_bio}

Case Context (for reference only, do not quote directly):
{case_details[:3000]}

Important Guidelines:
- Stay in character as {person_name} at all times
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

Respond as {person_name}:
"""
    
    prompt = ChatPromptTemplate.from_messages([('human', template)])
    chain = prompt | llm | StrOutputParser()
    
    try:
        response = await chain.ainvoke({})
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        # Remove any prefix like "Name:" that the LLM might add
        response = re.sub(rf"^{re.escape(person_name)}:\s*", "", response).strip()
        return response
    except Exception as e:
        print(f"Error in chat with {person_name}: {str(e)}")
        return "I'm sorry, I'm having trouble responding right now. Could you please repeat that?"
