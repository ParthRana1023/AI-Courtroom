# app/services/llm/lawyer.py
import time
import re
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import llm
from app.logging_config import get_logger

logger = get_logger(__name__)

async def generate_counter_argument(history: str, user_input: str, ai_role: str = None, user_role: str = None, case_details: str = None) -> str:
    try:
        logger.info(f"Generating counter argument for {ai_role}")
        logger.debug(f"History length: {len(history)} chars, user_input length: {len(user_input)} chars")
        
        template = """

            You are an experienced and assertive Indian trial lawyer representing the {ai_role} in a court of law. 
            The user is acting as the lawyer for the {user_role}. 
            The case details are: {case_details}
            Below is the case history so far: {history} 
            Refer to the Judge as "My Lord" or "Your Honour".
            Present your next arguments in a consise manner, and by not using all the facts available to you in a single argument.
            If the user attempts to introduce arguments or information beyond the established facts, you must promptly and firmly correct them, maintaining a professional and direct tone but still keep fighting your side of the case. 
            Do not be overly polite—your priority is to defend your client's interests within the boundaries of the case facts.
            Don't use Applicant and Not Applicant. Use the name of the parties in the case.
            Don't add the words "Counter Argument" or something similar as the heading of the prompt.
            Do not ask any questions in the end of the response to anyone.
            
        """
        
        prompt = ChatPromptTemplate.from_messages([
            ("human", template + "\n\nUser's argument to respond to: {user_input}")
        ]) 

        chain = prompt | llm | StrOutputParser()

        start_time = time.perf_counter()
        response = chain.invoke({
            "ai_role": ai_role,
            "history": history,
            "case_details": case_details,
            "user_role": user_role,
            "user_input": user_input
        })
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
        
        logger.info(f"Counter argument generated in {duration_ms:.2f}ms, response length: {len(response)} chars")
        return response
    except Exception as e:
        logger.error(f"Error generating counter argument: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."


async def opening_statement(ai_role: str, case_details: str, user_role: str) -> str: 
    try:
        logger.info(f"Generating opening statement for {ai_role}")
        
        template = """
            You are an Indian lawyer from the {ai_role}'s side. 
            Just give a brief opening statement in less than 250 words, regarding the case using this information: {case_details} 
            The user is the {user_role}'s lawyer, make sure they dont go beyond the facts of the case and if they do you have to correct them, do not be too polite.
            Refer to the Judge as "My Lord" or "Your Honour".
            Don't add the words "Opening Statement" or something similar as the heading of the prompt.
            Do not ask any questions in the end of the response to anyone."""
        
        prompt = ChatPromptTemplate.from_messages([
            ("human", template)
        ])

        chain = prompt | llm | StrOutputParser()

        start_time = time.perf_counter()
        response = chain.invoke({
            'ai_role' : ai_role,
            'case_details' : case_details,
            'user_role': user_role
        })
        duration_ms = (time.perf_counter() - start_time) * 1000

        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        logger.info(f"Opening statement generated in {duration_ms:.2f}ms, response length: {len(response)} chars")
        return response
    except Exception as e:
        logger.error(f"Error generating opening statement: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate an opening statement at this time. Please try again later."


async def closing_statement(history: str, ai_role: str, user_role: str) -> str:
    try:
        logger.info(f"Generating closing statement for {ai_role}")
        
        template = """
            You are an Indian lawyer from the {ai_role}'s side, and the user is the {user_role}'s lawyer. 
            You require to give a brief closing statement regarding the case using this information: {history} 
            The closing statement should be around 250 words. Use the words "I rest my case here" at the end. 
            Remember to reiterate key points from your side of the argument, try to include a highlight the evidence supporting your client's position. 
            Do not be too polite, the user is the {user_role}'s lawyer, make sure they dont go beyond the facts of the case and if they do you have to correct them.
            Refer to the Judge as "My Lord" or "Your Honour".
            Don't add the words "Closing Statement" or something similar as the heading of the prompt.
        """
        
        prompt = ChatPromptTemplate.from_messages([
            ("human", template)
        ])

        chain = prompt | llm | StrOutputParser()

        start_time = time.perf_counter()
        response = chain.invoke({
            'ai_role' : ai_role,
            'history' : history,
            'user_role' : user_role
        })
        duration_ms = (time.perf_counter() - start_time) * 1000

        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()

        logger.info(f"Closing statement generated in {duration_ms:.2f}ms, response length: {len(response)} chars")
        return response
    except Exception as e:
        logger.error(f"Error generating closing statement: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate a closing statement at this time. Please try again later."
