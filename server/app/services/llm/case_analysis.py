import re
from typing import List, Dict, Optional, Union
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import llm
from app.logging_config import get_logger, log_execution_time

logger = get_logger(__name__)

class CaseAnalysisService:
    @staticmethod
    @log_execution_time(logger, "case_analysis_llm")
    def analyze_case(defendant_args: List[str], plaintiff_args: List[str] = None, case_details: str = None, title: Optional[str] = None, judges_verdict: str = None, user_role: str = None, ai_role: str = None) -> Dict[str, Union[List[str], str]]:
        """Uses LLM to analyze the user's arguments and provides suggestions for improvement.
        :param defendant_args: List of arguments presented by the user.
        :param plaintiff_args: List of arguments from the opponent.
        :param case_details: Details of the case.
        :param title: Title of the case.
        :param judges_verdict: The verdict given by the judge.
        :return: Dictionary with 'mistakes', 'suggestions', 'outcome', and 'reasoning'.
        """
        logger.debug(f"Case analysis started", extra={"title": title, "defendant_args_count": len(defendant_args) if defendant_args else 0, "plaintiff_args_count": len(plaintiff_args) if plaintiff_args else 0})
            
        # Handle empty arguments list
        if not (defendant_args or plaintiff_args):
            logger.warning("No arguments provided for analysis")
            return "No analysis generated."

        prompt = """
            You are a legal expert AI tasked with analyzing a legal case. Your role is to evaluate the arguments presented and provide constructive feedback.

            CASE TITLE: {title}
            CASE DETAILS: {case_details}

            USER'S ROLE: {user_role}
            AI'S ROLE: {ai_role}
            
            DEFENDANT'S ARGUMENTS:
            {defendant_args}

            PLAINTIFF'S ARGUMENTS:
            {plaintiff_args} 

            JUDGE'S VERDICT: {judges_verdict}

            IMPORTANT VERDICT ANALYSIS INSTRUCTIONS:
            1. First, carefully analyze who the verdict favors by examining:
               - The outcome of petitions/applications
               - Which party's requests were granted or denied
               - Any orders for/against specific parties
               - The implications for each party
            
            2. Then determine if the user won or lost:
               - If user is PLAINTIFF:
                 * A verdict favoring the plaintiff means the user WON
                 * A verdict favoring the defendant means the user LOST
               
               - If user is DEFENDANT:
                 * A verdict favoring the plaintiff means the user LOST
                 * A verdict favoring the defendant means the user WON
            
            3. Base your analysis STRICTLY on:
               - The specific language and orders in the verdict
               - Legal implications of those orders
               - Which party benefits from the outcome

            Required sections for your analysis:

            Return your response as a well-structured Markdown document with the following sections:
            
            ### Outcome
            Clearly state whether the user has won or lost the case.

            ### Reasoning
            Provide detailed reasoning for the outcome based on the arguments and verdict.

            ### Mistakes
            Analyze each and every argument made by the user. Identify mistakes or weaknesses in each of the user's arguments as a bulleted list.

            ### Suggestions
            Provide actionable suggestions for improvement in each argument as a bulleted list.
        """
        analysis_prompt = ChatPromptTemplate.from_messages([
            ("human", prompt)
        ])

        try:
            chain = analysis_prompt | llm | StrOutputParser()
            logger.debug("Invoking LLM for case analysis")
            response = chain.invoke({
                "title": title,
                "case_details": case_details,
                "user_role": user_role.upper(),
                "ai_role": ai_role.upper(),
                "defendant_args": chr(10).join(defendant_args),
                "plaintiff_args": chr(10).join(plaintiff_args),
                "judges_verdict": judges_verdict,
            })

            response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
            
            logger.info("Case analysis completed successfully", extra={"response_length": len(response)})
            return response

        except Exception as e:
            logger.error(f"Error during LLM analysis", extra={"error": str(e)})
            raise Exception(f"Internal error during analysis: {e}")
