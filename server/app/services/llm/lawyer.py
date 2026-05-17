# app/services/llm/lawyer.py
import time
import re
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import get_llm
from app.logging_config import get_logger

logger = get_logger(__name__)


async def generate_counter_argument(
    user_input: str,
    ai_role: str | None = None,
    user_role: str | None = None,
    case_details: str | None = None,
    rag_context: str | None = None,
    history: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(f"Generating counter argument for {ai_role}")
        
        case_context = rag_context or (case_details[:6000] if case_details else "No case details provided")
        
        # Use provided history or fallback to RAG context if history is not provided
        effective_history = history or "(Relevant history retrieved via RAG context)"

        template = """

            You are an experienced and assertive Indian trial lawyer representing the {ai_role} in a court of law. 
            The user is acting as the lawyer for the {user_role}. 
            The relevant case context is: {case_context}
            Structured evidence available in this case:
            {evidence_context}
            Below is the case history (relevant parts): {history} 
            Refer to the Judge as "My Lord" or "Your Honour".
            Cite exhibit references when relying on evidence. Do not invent exhibits or evidence that is not listed.
            Present your next arguments in a consise manner, and by not using all the facts available to you in a single argument.
            If the user attempts to introduce arguments or information beyond the established facts, you must promptly and firmly correct them, maintaining a professional and direct tone but still keep fighting your side of the case. 
            Do not be overly polite—your priority is to defend your client's interests within the boundaries of the case facts.
            Don't use Applicant and Not Applicant. Use the name of the parties in the case.
            Don't add the words "Counter Argument" or something similar as the heading of the prompt.
            Do not ask any questions in the end of the response to anyone.
            
        """

        prompt = ChatPromptTemplate.from_messages(
            [("human", template + "\n\nUser's argument to respond to: {user_input}")]
        )

        chain = prompt | get_llm("lawyer") | StrOutputParser()

        start_time = time.perf_counter()
        response = chain.invoke(
            {
                "ai_role": ai_role,
                "history": effective_history,
                "case_context": case_context,
                "evidence_context": evidence_context or "No structured evidence has been submitted.",
                "user_role": user_role,
                "user_input": user_input,
            }
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        logger.info(
            f"Counter argument generated in {duration_ms:.2f}ms, response length: {len(response)} chars"
        )
        return response
    except Exception as e:
        logger.error(f"Error generating counter argument: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."


async def opening_statement(
    ai_role: str,
    case_details: str,
    user_role: str,
    rag_context: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(f"Generating opening statement for {ai_role}")

        case_context = rag_context or (case_details[:6000] if case_details else "No case details provided")

        template = """
            You are an Indian lawyer from the {ai_role}'s side. 
            Just give a brief opening statement in less than 250 words, regarding the case using this information: {case_context} 
            Structured evidence available in this case:
            {evidence_context}
            Cite exhibit references when relying on evidence. Do not invent exhibits or evidence that is not listed.
            The user is the {user_role}'s lawyer, make sure they dont go beyond the facts of the case and if they do you have to correct them, do not be too polite.
            Refer to the Judge as "My Lord" or "Your Honour".
            Don't add the words "Opening Statement" or something similar as the heading of the prompt.
            Do not ask any questions in the end of the response to anyone."""

        prompt = ChatPromptTemplate.from_messages([("human", template)])

        chain = prompt | get_llm("lawyer") | StrOutputParser()

        start_time = time.perf_counter()
        response = chain.invoke(
            {
                "ai_role": ai_role,
                "case_context": case_context,
                "evidence_context": evidence_context or "No structured evidence has been submitted.",
                "user_role": user_role,
            }
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        logger.info(
            f"Opening statement generated in {duration_ms:.2f}ms, response length: {len(response)} chars"
        )
        return response
    except Exception as e:
        logger.error(f"Error generating opening statement: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate an opening statement at this time. Please try again later."


async def closing_statement(
    ai_role: str,
    user_role: str,
    case_details: str | None = None,
    rag_context: str | None = None,
    history: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(f"Generating closing statement for {ai_role}")

        closing_context = rag_context or (case_details[:6000] if case_details else history or "No closing context provided")

        template = """
            You are an Indian lawyer from the {ai_role}'s side, and the user is the {user_role}'s lawyer. 
            You require to give a brief closing statement regarding the case using this information: {closing_context} 
            Structured evidence available in this case:
            {evidence_context}
            The closing statement should be around 250 words. Use the words "I rest my case here" at the end. 
            Remember to reiterate key points from your side of the argument, try to include a highlight the evidence supporting your client's position. 
            Cite exhibit references when relying on evidence. Do not invent exhibits or evidence that is not listed.
            Do not be too polite, the user is the {user_role}'s lawyer, make sure they dont go beyond the facts of the case and if they do you have to correct them.
            Refer to the Judge as "My Lord" or "Your Honour".
            Don't add the words "Closing Statement" or something similar as the heading of the prompt.
        """

        prompt = ChatPromptTemplate.from_messages([("human", template)])

        chain = prompt | get_llm("lawyer") | StrOutputParser()

        start_time = time.perf_counter()
        response = chain.invoke(
            {
                "ai_role": ai_role,
                "closing_context": closing_context,
                "evidence_context": evidence_context or "No structured evidence has been submitted.",
                "user_role": user_role,
            }
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        logger.info(
            f"Closing statement generated in {duration_ms:.2f}ms, response length: {len(response)} chars"
        )
        return response
    except Exception as e:
        logger.error(f"Error generating closing statement: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate a closing statement at this time. Please try again later."
