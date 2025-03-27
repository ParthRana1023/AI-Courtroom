# app/services/llm/case_generation.py
import random
import string

async def generate_case(sections: int, numbers: list[int]) -> dict:
    cnr = ''.join(random.choices(string.ascii_uppercase + string.digits, k=16))
    details = f"Case involving {sections} sections: {', '.join(map(str, numbers))}"
    return {
        "cnr": cnr,
        "details": details,
        "status": "not started"  # Add initial status
    }