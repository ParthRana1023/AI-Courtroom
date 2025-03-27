# app/services/llm/lawyer.py
async def generate_counter_argument(argument: str) -> str:
    return f"Counter argument to: {argument}"