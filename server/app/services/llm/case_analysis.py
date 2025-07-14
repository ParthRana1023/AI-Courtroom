from typing import List, Dict, Optional, Union
import json
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from app.utils.llm import llm

class CaseAnalysisResponse(BaseModel):
    mistakes: List[str] = Field(description="Mistakes or weaknesses in the user's arguments")
    suggestions: List[str] = Field(description="Actionable suggestions for improvement")
    outcome: str = Field(description="Whether the user won or lost the case (e.g., 'win', 'lose', 'unknown')")
    reasoning: str = Field(description="Detailed reasoning for the outcome based on the arguments and verdict")

class CaseAnalysisService:
    @staticmethod
    def analyze_case(user_args: List[str], counter_args: List[str] = None, case_details: str = None, title: Optional[str] = None, judges_verdict: str = None) -> Dict[str, Union[List[str], str]]:
        """Uses LLM to analyze the user's arguments and provides suggestions for improvement.
        :param user_args: List of arguments presented by the user.
        :param counter_args: List of arguments from the opponent.
        :param case_details: Details of the case.
        :param title: Title of the case.
        :param judges_verdict: The verdict given by the judge.
        :return: Dictionary with 'mistakes', 'suggestions', 'outcome', and 'reasoning'.
        """
            
        # Handle empty arguments list
        if not user_args:
            return {
                "mistakes": ["No arguments provided."],
                "suggestions": ["Present at least one argument to support your case."],
                "outcome": "unknown",
                "reasoning": "No arguments were provided to evaluate."
            }

        prompt = f"""
            You are a legal expert AI. Analyze the following case and the arguments from both sides. Identify any mistakes or weaknesses in the user's arguments and provide actionable suggestions for improvement.

            CASE TITLE: {title or 'Untitled'}
            CASE DETAILS: {case_details or 'No details provided.'}

            USER ARGUMENTS:
            {chr(10).join(user_args) if user_args else 'None'}

            OPPONENT ARGUMENTS:
            {chr(10).join(counter_args) if counter_args else 'None'}

            JUDGE'S VERDICT: {judges_verdict or 'No verdict provided'}

            Analyze the case details, the user arguments, the opponent arguments, and the judge's verdict to determine the outcome.

            Return your response as a JSON object with four keys: 
            - 'outcome' (string): Whether the user won or lost the case (e.g., 'win', 'lose', 'unknown')
            - 'reasoning' (string): Detailed reasoning for the outcome based on the arguments and verdict
            - 'mistakes' (list of strings): Identify mistakes or weaknesses in each of the user's arguments
            - 'suggestions' (list of strings): Provide actionable suggestions for improvement in each argument
        """
        parser = PydanticOutputParser(pydantic_object=CaseAnalysisResponse)

        analysis_prompt = ChatPromptTemplate.from_messages([
            ("system", prompt + "\n{format_instructions}")
        ])

        try:
            chain = analysis_prompt | llm | parser
            response = chain.invoke({"format_instructions": parser.get_format_instructions()})
            return response.dict()
        except Exception as e:
            print(f"Error during LLM analysis: {e}")
            return {
                "mistakes": ["Could not analyze arguments due to an internal error."],
                "suggestions": ["Please try again later or check your input."],
                "outcome": "unknown",
                "reasoning": f"Internal error during analysis: {e}"
            }
