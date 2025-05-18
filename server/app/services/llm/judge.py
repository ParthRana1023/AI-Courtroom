# app/services/llm/judge.py
import logging
from typing import List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import llm

logger = logging.getLogger(__name__)

async def generate_verdict(user_args: List[str], counter_args: List[str], case_details: str = None) -> str:
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
            
        summarization_prompt = ChatPromptTemplate.from_messages([
            ("system", """
                You are a legal assistant. Your task is to summarize the key arguments made in this courtroom exchange.

                Summarize the back-and-forth conversation between the lawyers in a concise, neutral manner.
                Focus only on legal points made by both sides and counterarguments.
                        """),
            ("user", history)
        ])

        summarize_chain = summarization_prompt | llm | StrOutputParser()
        summary = summarize_chain.invoke({})

        judge_template = f"""
        You are a judge presiding over a courtroom in India. You have received a legal case and closing statements from both the Plaintiff and the Defendant.

        Your job is to carefully evaluate the closing statements and the key arguments raised by both sides during the case.

        Here is the case description:
        \"\"\"{case_details or 'No case details provided'}\"\"\"

        Here is the summarized courtroom argument history:
        \"\"\"{summary}\"\"\"

        Closing statement from the Plaintiff:
        \"\"\"{plaintiff_closing}\"\"\"

        Closing statement from the Defendant:
        \"\"\"{defendant_closing}\"\"\"

        Please now deliver a final verdict, clearly stating:
        1. Which side wins and why
        2. The reasoning based on law and argument
        3. A professional tone of authority and finality

        Use formal judicial language. Be balanced, clear, and precise.
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