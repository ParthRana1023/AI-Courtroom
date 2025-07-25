# app/services/llm/case_generation.py
import random
import string
from app.utils.llm import llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

async def random_names():
    """
    Generate a list of random Indian names.
    """
    names = []
    template1 = "Generate 15 random names of Indian people"

    prompt = ChatPromptTemplate.from_messages([
        ('system', template1)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        # Use await for async chain invocation as llm is ChatOpenAI and the function is async
        llm_response = await chain.ainvoke({})

        # Split the response into lines and remove empty lines
        names = [name.strip() for name in llm_response.split('\n') if name.strip()]
        return random.sample(names, 5) if len(names) >= 5 else names

    except Exception as e:
        # Log the error or handle it as appropriate for a backend service
        print(f"Error generating names with LLM: {str(e)}")

async def random_cities():
    """
    Generate a list of random Indian cities.
    """
    names = []
    template1 = "Generate 15 random names of Indian cities"

    prompt = ChatPromptTemplate.from_messages([
        ('system', template1)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        # Use await for async chain invocation as llm is ChatOpenAI and the function is async
        llm_response = await chain.ainvoke({})

        # Split the response into lines and remove empty lines
        names = [name.strip() for name in llm_response.split('\n') if name.strip()]
        return random.sample(names, 5) if len(names) >= 5 else names

    except Exception as e:
        # Log the error or handle it as appropriate for a backend service
        print(f"Error generating names with LLM: {str(e)}")

async def generate_case(sections: int, numbers: list[int]) -> dict:
    """
    Generates a hypothetical legal case file using an LLM.

    Args:
        sections (int): The number of IPC sections involved.
        numbers (list[int]): A list of IPC section numbers provided by the user.

    Returns:
        dict: A dictionary containing the case details:
              - cnr (str): Case Number Registry.
              - details (str): The raw text generated by the LLM.
              - title (str): Extracted title from the case details.
              - status (str): Initial status "not started".
    Raises:
        Exception: If any error occurs during LLM invocation or processing.
    """
    
    ipc_section_numbers_str = ", ".join(map(str, numbers)) if numbers else "XXX"  # Default if no numbers provided
    number_of_ipc_sections = sections

    # Generate random names and cities
    names = await random_names()
    cities = await random_cities()

    # Select a few random names and a random city
    selected_names = random.sample(names, min(len(names), 3)) if names else ["Parth Rana", "Pranav Nagvekar", "Prasiddhi Agarwal", "Yashvi Savla"]
    selected_city = random.choice(cities) if cities else "Mumbai"

    template = f""" 
        Draft a hypothetical case file for a legal proceeding involving the Indian Penal Code (IPC). 
        
        The case should primarily focus on sections {ipc_section_numbers_str}, but you should also identify and incorporate 2-3 additional related IPC sections that would naturally be involved in such a case based on legal context and typical offense groupings.
        
        IMPORTANT CREATIVITY REQUIREMENTS:
        - Create a UNIQUE and CREATIVE case scenario that differs significantly from previous cases involving these same sections
        - Generate diverse and culturally appropriate Indian names for all parties involved (never reuse the same names across different cases). Use these names: {', '.join(selected_names)}
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
        - Start with: `**IN THE [Specify Court Name and Jurisdiction, e.g., HIGH COURT OF DELHI AT NEW DELHI]**`
        - Follow with: `**CASE NO.: [Invent a standardized case number, e.g., W.P.(Crl.) 1234/2024]**`
        - Optionally include: `**CNR Number: [Invent a CNR Number, e.g., DLCT010012342024]**`
        - Note: Use real-world Indian locations.

        **IN THE MATTER OF:**
        - `**[Title of the Case, e.g., State vs. Accused Name(s) OR Petitioner Name vs. Respondent Name(s)]**`
        - This section should clearly state the nature of the case.

        **BETWEEN:**

        **[Full Name of Petitioner/Applicant]**
        [Age], [Occupation],
        Residing at: [Full Address of Petitioner/Applicant]
        ... **PETITIONER** / **APPLICANT**

        **AND**

        1. **[Full Name of Respondent 1/Accused 1]**
           [Age], [Occupation],
           Residing at: [Full Address of Respondent 1/Accused 1]
        2. **[Full Name of Respondent 2/Accused 2]** (if applicable)
           [Age], [Occupation],
           Residing at: [Full Address of Respondent 2/Accused 2]
        ... **RESPONDENTS** / **ACCUSED**
        - Note: Add more respondants if needed for the case.

        **PETITION UNDER SECTION [Relevant Act, e.g., 482 of Cr.P.C. or Article 226 of the Constitution] READ WITH IPC SECTIONS:**
        - Clearly title the petition, incorporating BOTH the provided IPC sections {ipc_section_numbers_str} AND the additional related IPC sections you've identified.
        - Example: `**PETITION UNDER SECTION 482 OF THE CODE OF CRIMINAL PROCEDURE, 1973 READ WITH IPC SECTIONS {ipc_section_numbers_str} AND RELATED SECTIONS [list additional sections] FOR QUASHING OF FIR NO. [XYZ/YYYY]**`
        
        **RELATED IPC SECTIONS:**
        - After introducing the petition, include this dedicated section explaining the additional related IPC sections you've incorporated
        - For each related section, provide its number, title, and a brief explanation of how it connects to the primary sections and its relevance to this specific case
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

        **EVIDENCE (IF APPLICABLE):**
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
        ('system', template)
    ])

    chain = prompt | llm | StrOutputParser()

    try:
        # Use await for async chain invocation as llm is ChatOpenAI and the function is async
        llm_response_details = await chain.ainvoke({})
        
        # Generate a CNR (Case Number Registry)
        cnr = ''.join(random.choices(string.ascii_uppercase + string.digits, k=16))
        
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
        
        return {
            "cnr": cnr,
            "details": llm_response_details,  # Raw LLM output
            "title": title,  # Store title directly in the Case model
            "status": "not started"
        }

    except Exception as e:
        # Log the error or handle it as appropriate for a backend service
        print(f"Error generating case with LLM: {str(e)}")
        # Re-raise the exception or return an error structure if the calling code expects it
        raise