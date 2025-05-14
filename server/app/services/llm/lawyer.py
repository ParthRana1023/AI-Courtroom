# app/services/llm/lawyer.py
import random

async def generate_counter_argument(argument: str) -> str:
    """
    Generate a counter argument based on the provided argument.
    In a real implementation, this would use an LLM API.
    
    If argument is 'Opening statement for the plaintiff', it will generate
    a plaintiff opening statement instead of a counter argument.
    """
    # Check if we need to generate a plaintiff opening statement
    if argument == "Opening statement for the plaintiff":
        # Plaintiff opening statement templates with more legal context
        plaintiff_templates = [
            "Your Honor, esteemed members of the court, I stand before you representing the plaintiff in this matter. The evidence will clearly demonstrate that my client's rights have been violated, and we seek appropriate remedies under the law. The facts of this case are clear and compelling, and we are confident that justice will prevail. Thank you for your attention to this important matter.",
            "May it please the court, I represent the plaintiff in this case. We will present evidence showing that the defendant's actions have caused significant harm to my client. The law is clear on this matter, and we will demonstrate that the defendant has failed to meet their legal obligations. We seek fair compensation and justice for the damages incurred.",
            "Your Honor and members of the court, as counsel for the plaintiff, I will demonstrate through evidence and testimony that the defendant has violated statutory provisions that protect my client's rights. The timeline of events and documentation we will present clearly establish liability, and we respectfully request appropriate relief as provided by law."
        ]
        return random.choice(plaintiff_templates)
    
    # Regular counter argument templates with more variety and generic legal context
    counter_templates = [
        "Your Honor, esteemed members of the court, I stand before you representing the defendant in this matter. The plaintiff's claims lack merit and supporting evidence. We will demonstrate that my client has acted in accordance with all legal obligations and responsibilities. The evidence will show that the allegations brought forth are unfounded, and we respectfully request the court to dismiss these claims.",
        "May it please the court, as counsel for the defendant, I must firmly refute the allegations presented by the plaintiff. The facts of this case, when properly examined, will show that my client has not violated any legal duty. We will present evidence that contradicts the plaintiff's narrative and establishes that no liability exists in this matter.",
        "Your Honor and members of the court, the defendant categorically denies the claims brought by the plaintiff. We will present evidence showing that the plaintiff's interpretation of events is flawed and that their legal arguments do not apply to the circumstances of this case. The burden of proof rests with the plaintiff, and they have failed to meet this burden."
    ]
    
    return random.choice(counter_templates)