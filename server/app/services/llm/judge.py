# app/services/llm/judge.py
import logging
from typing import List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import llm

logger = logging.getLogger(__name__)

async def generate_verdict(user_args: List[str], counter_args: List[str], case_details: str = None, title: str = None) -> str:
    try:
        # Combine all arguments to create a history
        history = "\n".join(user_args + counter_args)
        
        # Extract closing statements (assuming they are the last arguments from each side)
        plaintiff_closing = None
        defendant_closing = None
        
        for arg in reversed(user_args):
            if "plaintiff" in arg.lower() or "closing" in arg.lower():
                plaintiff_closing = arg
                break
                
        for arg in reversed(user_args):
            if "defendant" in arg.lower() or "closing" in arg.lower():
                defendant_closing = arg
                break

        # If we couldn't identify closing statements, use the last arguments
        if not plaintiff_closing and user_args:
            plaintiff_closing = user_args[-1]
        if not defendant_closing and counter_args:
            defendant_closing = counter_args[-1]
            
        # Default values if still not found
        plaintiff_closing = plaintiff_closing or "No closing statement provided"
        defendant_closing = defendant_closing or "No closing statement provided"

        judge_template = f"""
        
        You are an impartial judge presiding over a courtroom in India. You have received a legal case and closing statements from both the Plaintiff and the Defendant Lawyers.

        Draft a clear, professional judgment using the standard legal structure commonly seen in Indian judgments. Strictly use markdown formatting for all section headers and keywords, as in official court documents. Follow the format below:

        ---
        **CASE TITLE:** {title or 'A vs B - Matrimonial Dispute'}  
        **COURT:** [e.g., "Delhi High Court"]  
        **DATE OF HEARING:** [DD Month YYYY]
        ---

        **1. FACTS**  
        Summarize essential facts concisely: parties involved, background events, relief sought, procedural history.  
        **Case Description:**  
        {case_details or 'No case details provided'}
        
        **Case Argument History:**  
        {history or 'No case argument history provided'}

        **2. ISSUES**  
        Number and list legal questions to be decided (e.g., validity of contract, standard of proof).

        **3. ARGUMENTS BY APPELLANT/PLAINTIFF**  
        - Appellant's legal points  
        - Evidence relied upon  
        - Precedents cited  
        **Closing statement from the Plaintiff:**  
        {plaintiff_closing}

        **4. ARGUMENTS BY RESPONDENT/DEFENDANT**  
        - Respondent's legal contentions  
        - Counter-evidence  
        - Precedents cited  
        **Closing statement from the Defendant:**  
        {defendant_closing}

        **5. RELEVANT PRECEDENTS**  
        List key case laws from both sides. Summarize holdings and relevance to current issues.

        **6. LEGAL ANALYSIS**  
        - Evaluate each issue  
        - Weigh arguments and evidence  
        - Apply legal principles and precedents

        **7. COURT'S REASONING**  
        - How evidence and law support findings  
        - Address factual findings (credibility, corroboration)

        **8. CONCLUSION & ORDER**  
        - For each issue, state the decision (allowed/dismissed)  
        - Grant or deny relief, specify costs or directions  
        - Sign-off with Judge's name, designation, and date.

        ---
        **Tone & Style Guidelines:**  
        - Neutral, formal, judicial  
        - Numbered/headed sections  
        - Short, legally precise sentences
        """

        judge_prompt = ChatPromptTemplate.from_messages([
            ("system", judge_template)
        ])
        judge_chain = judge_prompt | llm | StrOutputParser()

        verdict = judge_chain.invoke({})
        return verdict
    except Exception as e:
        logger.error(f"Error generating verdict: {str(e)}")
        return "I apologize, but I'm unable to generate a verdict at this time. Please try again later."