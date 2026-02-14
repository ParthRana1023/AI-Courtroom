# app/services/llm/case_generation.py
import random
import string
import re
import time
import uuid
from typing import Optional
from app.utils.llm import llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.models.party import PartyRole, PartyInvolved
from app.services.llm.parties_service import extract_and_assign_parties
from app.services.high_court_mapping import get_random_high_court, INDIAN_HIGH_COURTS
from datetime import datetime
from app.logging_config import get_logger

logger = get_logger(__name__)

async def random_names():
    names = []
    template = "Generate 15 random names of Indian people"

    prompt = ChatPromptTemplate.from_messages([
        ('human', template)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        start_time = time.perf_counter()
        llm_response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.debug(f"Random names generated in {duration_ms:.2f}ms")

        # Split the response into lines and remove empty lines
        names = [name.strip() for name in llm_response.split('\n') if name.strip()]
        return random.sample(names, 5) if len(names) >= 5 else names

    except Exception as e:
        logger.error(f"Error generating names with LLM: {str(e)}", exc_info=True)
        return []

async def random_cities():
    """
    Generate a list of random Indian cities.
    """
    names = []
    template = "Generate 10 random names of Indian cities"

    prompt = ChatPromptTemplate.from_messages([
        ('human', template)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        start_time = time.perf_counter()
        llm_response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.debug(f"Random cities generated in {duration_ms:.2f}ms")

        # Split the response into lines and remove empty lines
        names = [name.strip() for name in llm_response.split('\n') if name.strip()]
        return random.sample(names, 5) if len(names) >= 5 else names

    except Exception as e:
        logger.error(f"Error generating cities with LLM: {str(e)}", exc_info=True)
        return []


async def random_organizations():
    """
    Generate a list of random Indian company/organization names.
    """
    organizations = []
    template = """Generate 10 random realistic Indian company or organization names.
                    Include a mix of:
                    - Private companies (e.g., Reliance Industries Pvt Ltd, Tata Motors Ltd)
                    - Public sector organizations (e.g., State Bank of India, ONGC)
                    - Local businesses (e.g., Mumbai Trading Co., Delhi Textiles)
                    - NGOs and foundations (e.g., Akshaya Patra Foundation)

                    Return only the names, one per line.
                """

    prompt = ChatPromptTemplate.from_messages([
        ('human', template)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        start_time = time.perf_counter()
        llm_response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.debug(f"Random organizations generated in {duration_ms:.2f}ms")
        
        # Split the response into lines and clean up
        organizations = [org.strip() for org in llm_response.split('\n') if org.strip()]
        # Remove numbering if present (e.g., "1. Company Name" -> "Company Name")
        organizations = [re.sub(r'^\d+\.\s*', '', org) for org in organizations]
        return random.sample(organizations, min(5, len(organizations))) if organizations else [
            "Mumbai Trading Co. Pvt Ltd",
            "Delhi Textiles Ltd",
            "Bangalore Tech Solutions",
            "Chennai Industries Corp",
            "Kolkata Exports Ltd"
        ]

    except Exception as e:
        logger.error(f"Error generating organization names with LLM: {str(e)}", exc_info=True)
        return [
            "Mumbai Trading Co. Pvt Ltd",
            "Delhi Textiles Ltd",
            "Bangalore Tech Solutions",
            "Chennai Industries Corp",
            "Kolkata Exports Ltd"
        ]

def generate_realistic_cnr(high_court: str, city: str) -> str:
    """
    Generates a realistic CNR number based on the High Court (State) and City.
    Format: [State Code 2][District Code 2][Establishment Code 2][Case Number 6][Year 4]
    Total length: 16 characters
    """
    # 1. State Code (2 chars)
    # Create reverse mapping: High Court Name -> State ISO2
    high_court_to_state = {v: k for k, v in INDIAN_HIGH_COURTS.items()}
    
    # Handle bench names that might be slightly different or missing
    # Default to DL (Delhi) if not found, or try to find partial match
    state_code = "DL"
    if high_court in high_court_to_state:
        state_code = high_court_to_state[high_court]
    else:
        # Try finding by substring (e.g. "Bombay High Court" in "Bombay High Court (Goa Bench)")
        for hc_name, code in high_court_to_state.items():
            if high_court in hc_name or hc_name in high_court:
                state_code = code
                break
    
    # 2. District Code (2 chars)
    # Use first two letters of city, or random keys if city is too short
    if city and len(city) >= 2:
        district_code = city[:2].upper()
    else:
        district_code = ''.join(random.choices(string.ascii_uppercase, k=2))
        
    # Ensure district code is alpha only
    district_code = ''.join(c for c in district_code if c.isalpha())
    if len(district_code) < 2:
        district_code = (district_code + "X")[:2]
        
    # 3. Establishment Code (2 chars)
    # Random 2 digits
    establishment_code = f"{random.randint(1, 99):02d}"
    
    # 4. Case Number (6 chars)
    # Random 6 digits
    case_number = f"{random.randint(1, 999999):06d}"
    
    # 5. Year (4 chars)
    year = str(datetime.now().year)
    
    cnr = f"{state_code}{district_code}{establishment_code}{case_number}{year}"
    
    # Ensure strictly 16 chars just in case
    if len(cnr) != 16:
        # Fallback to random if something goes wrong with length
        logger.warning(f"Generated CNR {cnr} length {len(cnr)} != 16. Falling back to structured random.")
        cnr = f"{state_code}{district_code}{establishment_code}{case_number[:6]}{year}"
        if len(cnr) < 16:
             cnr = cnr.ljust(16, '0')
        elif len(cnr) > 16:
             cnr = cnr[:16]
             
    return cnr

async def generate_case(sections: int, numbers: list[int], high_court: Optional[str] = None, city: Optional[str] = None) -> dict:
    """
    Generates a hypothetical legal case file using an LLM.

    Args:
        sections (int): The number of IPC sections involved.
        numbers (list[int]): A list of IPC section numbers provided by the user.
        high_court (Optional[str]): The specific high court to use. If None, random is used.
        city (Optional[str]): The specific city to use. If None, random city is generated.

    Returns:
        dict: A dictionary containing the case details:
              - cnr (str): Case Number Registry.
              - details (str): The raw text generated by the LLM.
              - title (str): Extracted title from the case details.
              - status (str): Initial status "not started".
    Raises:
        Exception: If any error occurs during LLM invocation or processing.
    """
    
    logger.info(f"Generating case with {sections} IPC sections: {numbers}")
    overall_start_time = time.perf_counter()
    
    ipc_section_numbers_str = ", ".join(map(str, numbers)) if numbers else "XXX"  # Default if no numbers provided
    number_of_ipc_sections = sections

    # Generate random names and organizations
    names = await random_names()
    organizations = await random_organizations()

    # Only generate random cities if no city is provided
    if city:
        selected_city = city
    else:
        cities = await random_cities()
        selected_city = random.choice(cities) if cities else "Mumbai"

    # Select a few random names, organizations
    parties_involved_names = random.sample(names, min(len(names), 3)) if names else ["Parth Rana", "Pranav Nagvekar", "Prasiddhi Agarwal", "Yashvi Savla"]
    orgs_involved = random.sample(organizations, min(len(organizations), 2)) if organizations else ["Mumbai Trading Co. Pvt Ltd", "Delhi Textiles Ltd"]
    
    # Use provided high court or fallback to random
    selected_high_court = high_court if high_court else get_random_high_court()
    logger.info(f"Case generation parameters: High Court={selected_high_court}, City={selected_city}")

    template = f""" 
        Draft a hypothetical case file for a legal proceeding involving the Indian Penal Code (IPC). 
        
        The case should primarily focus on sections {ipc_section_numbers_str}, but you should also identify and incorporate 2-3 additional related IPC sections that would naturally be involved in such a case based on legal context and typical offense groupings.
        
        IMPORTANT CREATIVITY REQUIREMENTS:
        - Create a UNIQUE and CREATIVE case scenario that differs significantly from previous cases involving these same sections
        - Generate diverse and culturally appropriate Indian names for all parties involved (never reuse the same names across different cases). Use these names: {', '.join(parties_involved_names)}
        - You may also use these organizations/companies as parties if appropriate for the case: {', '.join(orgs_involved)}
        - Vary the locations, circumstances, timelines, and specific details to ensure each case feels distinct. Use this city: {selected_city}
        - Consider different socioeconomic backgrounds, occupations, and contexts for the parties involved
        - Ensure each generated case has a different fact pattern even when the same IPC sections are requested
        
        RELATED IPC SECTIONS REQUIREMENT:
        - In the petition, include a specific subsection titled "**RELATED IPC SECTIONS:**" after the main petition section
        - List each additional related IPC section you've incorporated beyond those explicitly requested
        - For each related section, provide a brief explanation of how it connects to the primary sections and its relevance to this specific case
        The final document MUST strictly follow official court petition format, using precise legal language, markdown for emphasis, and comprehensive details.
        Pay close attention to the formatting requirements, especially the use of markdown bolding (`**Header:**`) for all section titles and keywords as specified.

        **FORMATTING REQUIREMENTS:**
        - All main section headers (e.g., "COURT DETAILS & CASE NUMBER", "PARTIES INVOLVED") MUST be in uppercase and bolded (e.g., `**COURT DETAILS & CASE NUMBER:**`).
        - Sub-headers or key terms within sections (e.g., "Petitioner:", "Respondents:", "IPC Sections:") MUST be bolded.
        - Lists should use numbered or bulleted points as appropriate.
        - Ensure all text adheres to the structure outlined below.

        **STRUCTURE AND CONTENT GUIDELINES:**

        **COURT DETAILS & CASE NUMBER:**
        - Start with: `**IN THE {selected_high_court}**`
        - Follow with: `**CASE NO.: [Invent a standardized case number, e.g., W.P.(Crl.) 1234/2024]**`
        - Optionally include: `**CNR Number: [Invent a CNR Number, e.g., DLCT010012342024]**`
        - Note: The court is already specified, use appropriate jurisdiction for addresses.

        **IN THE MATTER OF:**
        - `**[Title of the Case, e.g., State vs. Accused Name(s) OR Petitioner Name vs. Respondent Name(s)]**`
        - This section should clearly state the nature of the case.

        1. **[Full Name of Applicant (Person/Organization)]**
        [Age], [Occupation],
        Residing at: [Full Address of Applicant located in {selected_city} or within the jurisdiction of {selected_high_court}]
        ... **APPLICANT**
        - Note: Add more APPLICANTS if needed for the case. APPLICANT can be an individual or an organization/company depending on the case generated

        **AND**

        1. **[Full Name of NON-APPLICANT (Person/Organization)]**
           [Age], [Occupation],
           Residing at: [Full Address of NON-APPLICANT located in {selected_city} or within the jurisdiction of {selected_high_court}]
        ... **NON-APPLICANT**
        - Note: Add more NON-APPLICANTS if needed for the case. NON-APPLICANT can be an individual or an organization/company depending on the case generated

        **PETITION UNDER SECTION [Relevant Act, e.g., 482 of Cr.P.C. or Article 226 of the Constitution] READ WITH IPC SECTIONS:**
        - Clearly title the petition, incorporating BOTH the provided IPC sections {ipc_section_numbers_str} AND the additional related IPC sections you've identified.
        - Example: `**PETITION UNDER SECTION 482 OF THE CODE OF CRIMINAL PROCEDURE, 1973 READ WITH IPC SECTIONS {ipc_section_numbers_str} AND RELATED SECTIONS [list additional sections] FOR QUASHING OF FIR NO. [XYZ/YYYY]**`
        
        **IPC SECTIONS:**
        - After introducing the petition, include this dedicated section explaining the IPC sections you've incorporated
        - For each section, provide its number, title, and a brief explanation of how it connects to this case and its relevance to this specific case
        - Format as: `- **Section [Number] - [Title]:** [Brief explanation of relevance to this case]`

        **MOST RESPECTFULLY SHEWETH (FORMAL PETITION):**
        1. That the present petition is being filed by the Petitioner/Applicant seeking [Specific Relief, e.g., quashing of FIR, grant of bail, etc.] in connection with IPC Sections {ipc_section_numbers_str}.
        2. [Further points summarizing the purpose of the application, legal heirs, claims, etc., incorporating the {number_of_ipc_sections} IPC sections involved.]
        ---

        **BACKGROUND AND CHRONOLOGY OF EVENTS:**
        - Provide a structured timeline of key events. Use the format: `- **[Date in DD/MM/YYYY or Month Day, YYYY format]:** [Description of event]`
        - Example: `- **15/07/2023:** FIR No. [XYZ/YYYY] was registered at Police Station [Name] under IPC Sections {ipc_section_numbers_str}.`
        - Highlight any events involving alleged breaches or issues related to the applicable IPC sections {ipc_section_numbers_str}.
        ---

        **GROUNDS:**
        - List the specific legal grounds for the petition. Use the format: `1. **[Ground Title, e.g., Lack of Prima Facie Case]:** [Detailed explanation of the ground, explicitly referencing BOTH the primary IPC sections and the related sections you've identified.]`
        - Example: `1. **Violation of Fundamental Rights (Article 21):** The investigation conducted by the police was unfair and biased, violating the petitioner's right to life and personal liberty, particularly in the context of the allegations under IPC Section {numbers[0] if numbers else 'XXX'} and related Section [additional section].`
        - Detail allegations such as fraud, suppression of facts, procedural defects, citing discrepancies, medical conditions, or suspicious circumstances.
        - IMPORTANT: Ensure you reference BOTH the primary IPC sections ({ipc_section_numbers_str}) AND your identified related sections throughout the grounds, showing how they interconnect in this specific case scenario.
        ---

        **EVIDENCE:**
        - Provide a detailed presentation of evidence that supports allegations related to BOTH primary and related IPC sections.
        - **Eyewitness Testimonies:**
          - `- **Witness Name:** [Full Name], Age: [Age], Address: [Full Address]`
          - `  **Testimony:** [Detailed summary of testimony, including date, time, location of event, and how it supports the case. Reference BOTH the primary IPC sections {ipc_section_numbers_str} AND the related sections you've identified. Ensure the testimony is a narrative, not just bullet points.]`
        - **Physical/Digital Evidence:**
          - `- **[Evidence Title/Type, e.g., Medical Report]:** (Reference No: [Ref No]) [Detailed description and its relevance to both primary IPC Sections {ipc_section_numbers_str} and the related sections you've identified.]`
        - Note: Create fictitious witness names and use real-world Indian locations.
        - IMPORTANT: Ensure different pieces of evidence connect to different IPC sections (both primary and related) to show how all sections are relevant to the case.
        ---

        **PRAYER (RELIEFS SOUGHT):**
        The Petitioner/Applicant therefore most humbly prays that this Hon'ble Court may be pleased to:
        1. [Specific prayer, e.g., Quash FIR No. [XYZ/YYYY] registered under IPC Sections {ipc_section_numbers_str} and related sections you've identified.]  
        2. [Another specific prayer, e.g., Grant interim stay on further proceedings.]
        3. Pass any other order(s) as this Hon'ble Court may deem fit and proper in the facts and circumstances of the case.
        ---

        **VERIFICATION:**
        Verified at [Place] on this [Day] day of [Month], [Year] that the contents of the above petition are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.

        **[Signature]**
        **PETITIONER/APPLICANT**

        Through:

        **[Signature]**
        **[Advocate's Name]**
        Advocate
        Enrollment No: [Number]
        Address: [Advocate's Office Address]
        Date: [DD/MM/YYYY]
        Place: [Place]

        Ensure the final output strictly mimics an official court petition. Use markdown bolding for all specified headers and keywords.
    """

    prompt = ChatPromptTemplate.from_messages([
        ('human', template)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        # Use await for async chain invocation as llm is ChatOpenAI and the function is async
        start_time = time.perf_counter()
        llm_response_details = await chain.ainvoke({})
        llm_duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Case LLM generation completed in {llm_duration_ms:.2f}ms")

        llm_response_details = re.sub(r"<think>.*?</think>", "", llm_response_details, flags=re.DOTALL).strip()
        
        # Generate a realistic CNR
        cnr = generate_realistic_cnr(selected_high_court, selected_city)
        
        def extract_title(case_text: str) -> str:
            """Extract just the title from case text for display purposes"""
            # Simple regex to extract title from case text
            import re
            title_match = re.search(r'\*\*IN THE MATTER OF:\*\*\s*\n\*\*(.*?)\*\*', case_text, re.DOTALL)
            if title_match:
                return title_match.group(1).strip()
            # Alternative title pattern
            title_match = re.search(r'\*\*(Under Section.*?)\*\*', case_text)
            if title_match:
                return title_match.group(1).strip()
            return ""
            
        # Extract title from the raw LLM response
        title = extract_title(llm_response_details)
        
        # Use LLM-based extraction to get parties and assign roles accurately
        logger.debug("Extracting parties from case using LLM...")
        start_time = time.perf_counter()
        try:
            extracted_parties = await extract_and_assign_parties(llm_response_details)
            parties_duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Extracted {len(extracted_parties)} parties in {parties_duration_ms:.2f}ms")
        except Exception as llm_err:
            logger.error(f"LLM extraction failed: {str(llm_err)}", exc_info=True)
            extracted_parties = []
        
        overall_duration_ms = (time.perf_counter() - overall_start_time) * 1000
        logger.info(f"Case generation completed - CNR: {cnr}, title: {title[:50] if title else 'N/A'}..., total time: {overall_duration_ms:.2f}ms")
        
        return {
            "cnr": cnr,
            "details": llm_response_details,  # Raw LLM output
            "title": title,  # Store title directly in the Case model
            "status": "not started",
            "parties_involved": [p.model_dump() for p in extracted_parties]  # Party data
        }

    except Exception as e:
        logger.error(f"Error generating case with LLM: {str(e)}", exc_info=True)
        # Re-raise the exception or return an error structure if the calling code expects it
        raise