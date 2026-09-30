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
from app.utils.datetime import get_current_datetime
from app.utils.llm import CURRENT_LAW_RULE, get_llm, strip_thinking

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

    # Numbered before drafting so the petition carries the real CNR.
    cnr = await generate_cnr(state_code, selected_city)
    today = get_current_datetime()
    today_str = today.strftime("%d/%m/%Y")

    template = f"""Draft a hypothetical case file: a criminal petition filed before the {selected_high_court}, written the way Indian advocates actually draft High Court petitions.

THE LAW (this matters):
- {CURRENT_LAW_RULE}
- All events take place between July 2024 and {today_str}, so the FIR, charge sheet and petition must cite the BNS, BNSS and BSA, never the IPC, CrPC or Evidence Act.
- Useful provisions: FIR under Section 173 BNSS; witness statements to police under Section 180 BNSS; statements before a Magistrate under Section 183 BNSS; police report (charge sheet) under Section 193 BNSS; anticipatory bail under Section 482 BNSS; regular bail under Section 483 BNSS; the High Court's inherent power to quash under Section 528 BNSS; criminal appeal against conviction under Section 415 BNSS; certificate for electronic records under Section 63 BSA.

THE CASE:
- The case centres on BNS sections {bns_section_numbers_str} ({number_of_bns_sections} requested). Add 2-3 related BNS sections that would naturally be invoked alongside them in a real FIR, and use each section's correct title and ingredients.
- Choose the kind of petition that best fits these offences: quashing of the FIR or proceedings under Section 528 BNSS, regular or anticipatory bail, or a criminal appeal against conviction. Use it consistently throughout.
- Make the dispute genuinely contestable. Record the prosecution's version from the FIR fairly and in detail, alongside the applicant's version, and give BOTH sides real material: evidence that supports the allegations and evidence that undermines them (delay, inconsistencies, gaps, a civil or personal motive). Do not make the outcome obvious.
- Use these names for the parties: {', '.join(parties_involved_names)}. You may also use these organisations if they fit: {', '.join(orgs_involved)}.
- Use this city: {selected_city}
- Give every party a believable occupation, age, background and motive. Invent separate names for witnesses, police officers and doctors; do not reuse the party names for them.
- The State is always a non-applicant. Also implead the complainant or victim (or the accused, if the complainant is the applicant) as a non-applicant, so each side has at least one real person or organisation.

FORMAT: Markdown. Every main header is bold UPPERCASE and ends with a colon, as below. Keep these headers exactly, in this order.

**IN THE {selected_high_court}**
**CASE NO.: [case number in the style this High Court uses for this kind of petition, e.g. CRL.M.C. No. 1234/{today.year}, Application U/S 528 BNSS No. 1234 of {today.year}, M.Cr.C. No. 1234 of {today.year}, CRLMC No. 1234 of {today.year}, Criminal Bail Application No. 1234 of {today.year}]**
**CNR No.: {cnr}**

**IN THE MATTER OF:**
**[Applicant name] v. State of [State] and Another**

1. **[Full name of applicant]**, [age], [occupation], resident of [full address in {selected_city}] ... **APPLICANT**

**VERSUS**

1. **State of [State]**, through Station House Officer, Police Station [name], {selected_city} ... **NON-APPLICANT NO. 1**
2. **[Full name]**, [age], [occupation], resident of [full address] ... **NON-APPLICANT NO. 2**
(Add further applicants or non-applicants only if the facts need them.)

**PETITION UNDER SECTION [provision] OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR [relief, e.g. QUASHING OF FIR NO. 123/{today.year} DATED [date] REGISTERED AT POLICE STATION [name], {selected_city.upper()}, UNDER SECTIONS [sections] OF THE BHARATIYA NYAYA SANHITA, 2023, AND ALL PROCEEDINGS ARISING THEREFROM]:**

**BNS SECTIONS INVOLVED:**
- **Section [number] BNS - [title]:** [its essential ingredients and how the allegations are said to meet them]
(List the requested BNS sections first, then the related sections you added.)

**RELATED BNS SECTIONS:**
- **Section [number] BNS - [title]:** [why the police invoked it alongside the primary sections]

**MOST RESPECTFULLY SHEWETH:**
1. That the applicant is filing the present petition seeking [relief] in connection with FIR No. [number] under BNS sections {bns_section_numbers_str} and the related sections.
2. That [the prosecution's case as recorded in the FIR, in fair and specific detail].
3. That [the applicant's version of events].
(Numbered "That ..." paragraphs, as in a real petition.)

**BACKGROUND AND CHRONOLOGY OF EVENTS:**
- **[DD/MM/YYYY]:** [event]
(From the start of the dispute through the incident, FIR, arrest or notice, investigation, charge sheet or trial court order, up to the filing of this petition shortly before {today_str}.)

**GROUNDS:**
A. **[Ground title]:** [the legal ground with reasons, tied to the ingredients of the specific BNS sections and to the facts]
(Lettered grounds A, B, C ... as advocates draft them. Argue only from the facts in this file; do not cite case law.)

**EVIDENCE:**
- **Eyewitness Testimonies:**
  - **Witness Name:** [full name], Age: [age], Address: [address]
    **Testimony:** [a narrative of what they told police under Section 180 BNSS: date, time, place, what they saw, and any weaknesses such as distance, lighting or relationship to a party]
- **Physical/Digital Evidence:**
  - **[Title, e.g. Medico-Legal Certificate, Seizure Memo, CCTV footage with Section 63 BSA certificate, FSL report, bank statement]:** (Annexure A-[n]) [what it shows, which side it helps, and any gap in it]

**PRAYER:**
It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:
(a) [main relief, naming the FIR or case number and the BNS sections];
(b) [interim relief, e.g. stay of further proceedings or no coercive action, if appropriate];
(c) pass any other order which this Hon'ble Court deems fit and proper in the facts and circumstances of the case.
AND FOR THIS ACT OF KINDNESS, THE APPLICANT SHALL, AS IN DUTY BOUND, EVER PRAY.

**VERIFICATION:**
I, [applicant], the applicant above named, do hereby verify that the contents of paragraphs 1 to [n] of this petition are true and correct to my knowledge and belief, that no part of it is false and that nothing material has been concealed. Verified at {selected_city} on [date].

**APPLICANT**
Through Counsel: **[Advocate name]**, Advocate, Enrolment No. [State code]/[number]/[year]
Place: {selected_city}
Date: [DD/MM/YYYY]

Write the complete petition with every placeholder filled in. Return only the petition."""

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
