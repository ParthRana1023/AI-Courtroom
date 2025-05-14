from langchain_openai import ChatOpenAI    
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize LLM before functions that use it
api_key = os.getenv("OPENAI_API_KEY")

# Initialize LLM
llm = ChatOpenAI(
    streaming=True,
    model="gpt-4o-mini",
    temperature=0.1,
    api_key=api_key,
    max_tokens=2048
)