# app/services/llm/lawyer.py
import logging
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import llm

logger = logging.getLogger(__name__)

async def generate_counter_argument(history: str, user_input: str, ai_role: str = None, case_details: str = None) -> str:
    try:
        template = '''

        You are an experienced and assertive Indian trial lawyer representing the {ai_role} in a court of law. Below is the case history so far:
        {history}

        Present your next arguments, strictly based on the facts of the case: {case}

        The user is acting as the lawyer for the {user_role}. If the user attempts to introduce arguments or information beyond the established facts, you must promptly and firmly correct them, maintaining a professional but direct tone. Do not be overly polite—your priority is to defend your client's interests within the boundaries of the case facts.
        
        '''
        
        prompt = ChatPromptTemplate.from_messages([
            ("system",template),
            ("user",user_input)
        ]) 

        chain = prompt | llm | StrOutputParser()

        response = chain.invoke({
            "ai_role": ai_role,
            "history": history,
            "case": case_details,
            "user_role": "plaintiff" if ai_role == "defendant" else "defendant"
        })
        
        return response
    except Exception as e:
        logger.error(f"Error generating counter argument: {str(e)}")
        return "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."

async def opening_statement(ai_role: str, case_details: str, user_input: str,) -> str:
    try:
        template = '''You are an Indian lawyer from the {ai_role}'s side, 
        Give an opening statement in brief regarding the case using this information: {case}
        The user is the {user_role}'s lawyer, make sure they dont go beyond the facts of the case and if they do you have to correct them, do not be too polite.
        '''
        
        prompt = ChatPromptTemplate.from_messages([
            ("system",template)
        ])

        chain = prompt | llm | StrOutputParser()

        response = chain.invoke({
            'ai_role' : ai_role,
            'case' : case_details,
            'user_role': user_input
        })
        return response
    except Exception as e:
        logger.error(f"Error generating opening statement: {str(e)}")
        return "I apologize, but I'm unable to generate an opening statement at this time. Please try again later."

async def closing_statement(history: str, ai_role: str) -> str:
    try:
        template = '''You are an Indian lawyer from the {ai_role}'s side, and you require to give a closing statement of 100 words regarding the case using this information: {history}

        Remember to reiterate key points from your side of the argument, try to include a highlight the evidence supporting your client's position
        '''
        
        prompt = ChatPromptTemplate.from_messages([
            ("system",template)
        ])

        chain = prompt | llm | StrOutputParser()

        response = chain.invoke({
            'ai_role' : ai_role,
            'history' : history
        })
        return response
    except Exception as e:
        logger.error(f"Error generating closing statement: {str(e)}")
        return "I apologize, but I'm unable to generate a closing statement at this time. Please try again later."