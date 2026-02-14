import sys
import os

# Add server directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'server'))

try:
    from app.utils.llm import llm
    from app.config import settings
    
    print(f"LLM Initialized successfully.")
    print(f"Model: {llm.model_name}")
    print(f"Config Model: {settings.llm_model}")
    
    if llm.model_name == settings.llm_model:
        print("Verification SUCCESS: Model names match.")
    else:
        print("Verification FAILED: Model names do not match.")
        
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Verification FAILED with error: {e}")
