# app/services/llm/lawyer.py
import random

async def generate_counter_argument(argument: str) -> str:
    """
    Generate a counter argument based on the provided argument.
    In a real implementation, this would use an LLM API.
    """
    # Simple counter argument templates
    counter_templates = [
        f"We strongly disagree with the claim that '{argument}'. The facts clearly show otherwise.",
        f"The opposing counsel's argument that '{argument}' lacks legal merit for several reasons.",
        f"While the other side claims '{argument}', this is contradicted by established precedent.",
        f"The argument '{argument}' fails to consider key legal principles that apply in this case.",
        f"We reject the premise of '{argument}' as it misinterprets the relevant statutes."
    ]
    
    return random.choice(counter_templates)