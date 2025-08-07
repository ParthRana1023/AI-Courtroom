from typing import List, Dict, Optional, Union
from langchain_core.prompts import ChatPromptTemplate
from app.utils.llm import llm
from app.models.case import CaseAnalysis

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

            Return your response as a well-structured Markdown document with the following sections:
            
            ### Outcome
            - 'outcome' (string): Whether the user won or lost the case (e.g., 'win', 'lose', 'unknown')

            ### Reasoning
            - Detailed reasoning for the outcome based on the arguments and verdict.

            ### Mistakes
            - Identify mistakes or weaknesses in each of the user's arguments as a bulleted list.

            ### Suggestions
            - Provide actionable suggestions for improvement in each argument as a bulleted list.
        """
        analysis_prompt = ChatPromptTemplate.from_messages([
            ("system", prompt)
        ])

        try:
            chain = analysis_prompt | llm
            response = chain.invoke({})
            
            # Parse the markdown response to extract sections
            content = response.content
            sections = {}
            current_section = None
            current_content = []
            
            for line in content.split('\n'):
                if line.startswith('### '):
                    if current_section and current_content:
                        sections[current_section.lower()] = current_content
                    current_section = line.replace('### ', '').strip()
                    current_content = []
                elif line.strip().startswith('- ') and current_section:
                    item = line.strip().replace('- ', '').strip()
                    # For outcome, extract just the value without quotes
                    if current_section == 'Outcome':
                        item = item.replace("'", "").replace('"', '').split(':')[-1].strip()
                    current_content.append(item)
            
            # Add the last section
            if current_section and current_content:
                sections[current_section.lower()] = current_content

            # Create analysis data
            analysis_data = CaseAnalysis(
                mistakes=sections.get('mistakes', ["No mistakes identified."]),
                suggestions=sections.get('suggestions', ["No suggestions provided."]),
                outcome=sections.get('outcome', ['unknown'])[0] if sections.get('outcome') else 'unknown',
                reasoning=f"""
                ### Outcome
                - {sections.get('outcome', ['unknown'])[0] if sections.get('outcome') else 'unknown'}

                ### Reasoning
                {sections.get('reasoning', ['No reasoning provided.'])[0] if sections.get('reasoning') else 'No reasoning provided.'}

                ### Mistakes
                {chr(10).join('- ' + mistake for mistake in sections.get('mistakes', ["No mistakes identified."]))}

                ### Suggestions
                {chr(10).join('- ' + suggestion for suggestion in sections.get('suggestions', ["No suggestions provided."]))}"""
            )
            
            return analysis_data.model_dump()
        except Exception as e:
            print(f"Error during LLM analysis: {e}")
            return {
                "mistakes": ["Could not analyze arguments due to an internal error."],
                "suggestions": ["Please try again later or check your input."],
                "outcome": "unknown",
                "reasoning": f"Internal error during analysis: {e}"
            }
