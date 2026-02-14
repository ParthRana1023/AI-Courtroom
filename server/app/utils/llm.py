from langchain_groq import ChatGroq
# from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings

# Gemini LLM
# llm = ChatGoogleGenerativeAI(
#     model="gemini-2.5-pro",
#     temperature=0.1,
#     google_api_key=gemini_api_key,
#     max_output_tokens=2048
# )

llm = ChatGroq(
    streaming=True,
    model=settings.llm_model,
    temperature=0.1,
    api_key=settings.groq_api_key,
    max_tokens=2048
)
