# app/services/llm/case_generation.py
import random
import re
import time

from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.logging_config import get_logger
from app.services.case_seed_data import (
    random_city,
    random_names,
    random_organizations,
)
from app.services.cnr import generate_cnr
from app.services.high_court_mapping import INDIAN_HIGH_COURTS
from app.utils.llm import get_llm, strip_thinking

logger = get_logger(__name__)


async def generate_case_shell(
    sections: int,
    numbers: list[int],
    state_code: str | None = None,
    city: str | None = None,
) -> dict:
    """
    Stage A: Generates the raw case markdown text and CNR number.
    """
    logger.info(f"Generating case shell with {sections} BNS sections: {numbers}")
    overall_start_time = time.perf_counter()

    bns_section_numbers_str = ", ".join(map(str, numbers)) if numbers else "XXX"
    number_of_bns_sections = sections

    # The state drives the High Court, the city and the CNR, so they all agree.
    if state_code not in INDIAN_HIGH_COURTS:
        state_code = random.choice(list(INDIAN_HIGH_COURTS))
    selected_high_court = INDIAN_HIGH_COURTS[state_code]
    selected_city = city or random_city(state_code)
    parties_involved_names = random_names(3)
    orgs_involved = random_organizations(2)
    logger.info(
        f"Case generation parameters: High Court={selected_high_court}, City={selected_city}"
    )

    template = f""" 
        Draft a hypothetical case file for a legal proceeding involving the Bharatiya Nyaya Sanhita (BNS). 
        
        The case should primarily focus on sections {bns_section_numbers_str}, but you should also identify and incorporate 2-3 additional related BNS sections that would naturally be involved in such a case based on legal context and typical offense groupings.
        
        IMPORTANT CREATIVITY REQUIREMENTS:
        - Create a UNIQUE and CREATIVE case scenario that differs significantly from previous cases involving these same sections
        - Generate diverse and culturally appropriate Indian names for all parties involved (never reuse the same names across different cases). Use these names: {', '.join(parties_involved_names)}
        - You may also use these organizations/companies as parties if appropriate for the case: {', '.join(orgs_involved)}
        - Vary the locations, circumstances, timelines, and specific details to ensure each case feels distinct. Use this city: {selected_city}
        - Consider different socioeconomic backgrounds, occupations, and contexts for the parties involved
        - Ensure each generated case has a different fact pattern even when the same BNS sections are requested
        
        RELATED BNS SECTIONS REQUIREMENT:
        - In the petition, include a specific subsection titled "**RELATED BNS SECTIONS:**" after the main petition section
        - List each additional related BNS section you've incorporated beyond those explicitly requested
        - For each related section, provide a brief explanation of how it connects to the primary sections and its relevance to this specific case
        The final document MUST strictly follow official court petition format, using precise legal language, markdown for emphasis, and comprehensive details.
        Pay close attention to the formatting requirements, especially the use of markdown bolding (`**Header:**`) for all section titles and keywords as specified.

        **FORMATTING REQUIREMENTS:**
        - All main section headers (e.g., "COURT DETAILS & CASE NUMBER", "PARTIES INVOLVED") MUST be in uppercase and bolded (e.g., `**COURT DETAILS & CASE NUMBER:**`).
        - Sub-headers or key terms within sections (e.g., "Petitioner:", "Respondents:", "BNS Sections:") MUST be bolded.
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

        **PETITION UNDER SECTION [Relevant Act, e.g., 482 of Cr.P.C. or Article 226 of the Constitution] READ WITH BNS SECTIONS:**
        - Clearly title the petition, incorporating BOTH the provided BNS sections {bns_section_numbers_str} AND the additional related BNS sections you've identified.
        - Example: `**PETITION UNDER SECTION 482 OF THE CODE OF CRIMINAL PROCEDURE, 1973 READ WITH BNS SECTIONS {bns_section_numbers_str} AND RELATED SECTIONS [list additional sections] FOR QUASHING OF FIR NO. [XYZ/YYYY]**`
        
        **BNS SECTIONS:**
        - After introducing the petition, include this dedicated section explaining the BNS sections you've incorporated
        - For each section, provide its number, title, and a brief explanation of how it connects to this case
        - Format as: `- **Section [Number] - [Title]:** [Brief explanation of how it connects to this case]`

        **MOST RESPECTFULLY SHEWETH (FORMAL PETITION):**
        1. That the present petition is being filed by the Petitioner/Applicant seeking [Specific Relief, e.g., quashing of FIR, grant of bail, etc.] in connection with BNS Sections {bns_section_numbers_str}.
        2. [Further points summarizing the purpose of the application, legal heirs, claims, etc., incorporating the {number_of_bns_sections} BNS sections involved.]
        ---

        **BACKGROUND AND CHRONOLOGY OF EVENTS:**
        - Provide a structured timeline of key events. Use the format: `- **[Date in DD/MM/YYYY or Month Day, YYYY format]:** [Description of event]`
        - Example: `- **15/07/2023:** FIR No. [XYZ/YYYY] was registered at Police Station [Name] under BNS Sections {bns_section_numbers_str}.`
        - Highlight any events involving alleged breaches or issues related to the applicable BNS sections {bns_section_numbers_str}.
        ---

        **GROUNDS:**
        - List the specific legal grounds for the petition. Use the format: `1. **[Ground Title, e.g., Lack of Prima Facie Case]:** [Detailed explanation of the ground, explicitly referencing BOTH the primary BNS sections and the related sections you've identified.]`
        - Example: `1. **Violation of Fundamental Rights (Article 21):** The investigation conducted by the police was unfair and biased, violating the petitioner's right to life and personal liberty, particularly in the context of the allegations under BNS Section {numbers[0] if numbers else 'XXX'} and related Section [additional section].`
        - Detail allegations such as fraud, suppression of facts, procedural defects, citing discrepancies, medical conditions, or suspicious circumstances.
        - IMPORTANT: Ensure you reference BOTH the primary BNS sections ({bns_section_numbers_str}) AND your identified related sections throughout the grounds, showing how they interconnect in this specific case scenario.
        ---

        **EVIDENCE:**
        - Provide a detailed presentation of evidence that supports allegations related to BOTH primary and related BNS sections.
        - **Eyewitness Testimonies:**
          - `- **Witness Name:** [Full Name], Age: [Age], Address: [Full Address]`
          - `  **Testimony:** [Detailed summary of testimony, including date, time, location of event, and how it supports the case. Reference BOTH the primary BNS sections {bns_section_numbers_str} AND the related sections you've identified. Ensure the testimony is a narrative, not just bullet points.]`
        - **Physical/Digital Evidence:**
          - `- **[Evidence Title/Type, e.g., Medical Report]:** (Reference No: [Ref No]) [Detailed description and how it connects to both primary BNS Sections {bns_section_numbers_str} and the related sections you've identified.]`
        - Note: Create fictitious witness names and use real-world Indian locations.
        - IMPORTANT: Ensure different pieces of evidence connect to different BNS sections (both primary and related) to show how all sections are relevant to the case.
        ---

        **PRAYER (RELIEFS SOUGHT):**
        The Petitioner/Applicant therefore most humbly prays that this Hon'ble Court may be pleased to:
        1. [Specific prayer, e.g., Quash FIR No. [XYZ/YYYY] registered under BNS Sections {bns_section_numbers_str} and related sections you've identified.]  
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

    prompt = ChatPromptTemplate.from_messages([HumanMessage(content=template)])

    chain = prompt | get_llm("drafter") | StrOutputParser()

    try:
        start_time = time.perf_counter()
        llm_response_details = await chain.ainvoke({})
        llm_duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Case LLM generation completed in {llm_duration_ms:.2f}ms")

        llm_response_details = strip_thinking(llm_response_details)

        if not llm_response_details:
            raise ValueError(
                "LLM generated an empty response or spent all tokens on reasoning."
            )

        cnr = await generate_cnr(state_code, selected_city)

        def extract_title(case_text: str) -> str:
            title_match = re.search(
                r"\*\*IN THE MATTER OF:\*\*\s*\n\*\*(.*?)\*\*", case_text, re.DOTALL
            )
            if title_match:
                return title_match.group(1).strip()
            title_match = re.search(r"\*\*(Under Section.*?)\*\*", case_text)
            if title_match:
                return title_match.group(1).strip()
            return ""

        title = extract_title(llm_response_details)

        overall_duration_ms = (time.perf_counter() - overall_start_time) * 1000
        logger.info(
            f"Case shell generated - CNR: {cnr}, title: {title[:50] if title else 'N/A'}..., total time: {overall_duration_ms:.2f}ms"
        )

        return {
            "cnr": cnr,
            "details": llm_response_details,
            "title": title,
            "status": "not started",
        }

    except Exception:
        logger.exception("Error generating case shell with LLM")
        raise
