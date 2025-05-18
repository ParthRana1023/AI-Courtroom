from langchain_groq import ChatGroq
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize LLM before functions that use it
groq_api_key = os.getenv("GROQ_API_KEY")

# Initialize LLM
llm = ChatGroq(
    streaming=True,
    model="llama-3.3-70b-versatile",
    temperature=0.1,
    api_key=groq_api_key,
    max_tokens=2048
)