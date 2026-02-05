from langchain_groq import ChatGroq
# from langchain_google_genai import ChatGoogleGenerativeAI
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize LLM before functions that use it
groq_api_key = os.getenv("GROQ_API_KEY")
# gemini_api_key = os.getenv("GEMINI_API_KEY")

# Gemini LLM
# llm = ChatGoogleGenerativeAI(
#     model="gemini-2.5-pro",
#     temperature=0.1,
#     google_api_key=gemini_api_key,
#     max_output_tokens=2048
# )

llm = ChatGroq(
    streaming=True,
    model="openai/gpt-oss-120b",
    temperature=0.1,
    api_key=groq_api_key,
    max_tokens=2048
)
