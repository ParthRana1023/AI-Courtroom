# from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_groq import ChatGroq
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize LLM before functions that use it
groq_api_key = os.getenv("GROQ_API_KEY")
# huggingface_api_key = os.getenv("HUGGINGFACE_API_KEY")

# Initialize LLM
# chat_model = HuggingFaceEndpoint(
#     repo_id="openai/gpt-oss-120b",
#     task="text-generation",
#     max_new_tokens=512,
#     do_sample=False,
#     repetition_penalty=1.03,
#     provider="auto",  # let Hugging Face choose the best provider for you
# )

# llm = ChatHuggingFace(llm=chat_model)

judge_llm = ChatGroq(
    streaming=True,
    model="moonshotai/kimi-k2-instruct",
    temperature=0.1,
    api_key=groq_api_key,
    max_tokens=2048
)

llm = ChatGroq(
    streaming=True,
    model="meta-llama/llama-4-scout-17b-16e-instruct",
    temperature=0.1,
    api_key=groq_api_key,
    max_tokens=2048
)

# Models tested: llama-3.3-70b-versatile (best), llama-3.1-8b-instant (okay), moonshotai/kimi-k2-instruct, meta-llama/llama-4-scout-17b-16e-instruct, meta-llama/llama-4-maverick-17b-128e-instruct