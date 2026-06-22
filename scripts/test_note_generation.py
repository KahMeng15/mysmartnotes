import asyncio
import logging
from app.models.db import User
from app.utils.db import SessionLocal
from app.processing.summary_pipeline import SummaryPipeline
from app.processing.ai_client import AIClient

logging.basicConfig(level=logging.INFO)

async def test_generation():
    db = SessionLocal()
    user = db.query(User).first()
    ai = AIClient(user=user, db=db)
    
    # Simulate single mode (frontend sends mode='none', output_format='none', custom_prompt='Generate 3 math equations')
    print("\n--- Test 1: Single Mode (mode='none', output_format='none', custom_prompt='Generate 3 math equations') ---")
    res1 = await ai.generate_summary(
        content="Mathematics is the study of numbers and shapes.",
        mode="none", 
        output_format="none",
        custom_prompt="Generate 3 math equations"
    )
    print("Result 1:", res1)
    
    # Simulate multi-mode with custom prompt
    print("\n--- Test 2: Multi-mode (user selects 'quick' + 'pointform' but adds custom prompt) ---")
    res2 = await ai.generate_summary(
        content="The mitochondria is the powerhouse of the cell. It generates ATP.",
        mode="quick",
        output_format="pointform",
        custom_prompt="Translate this to French"
    )
    print("Result 2:", res2)

    db.close()

if __name__ == "__main__":
    asyncio.run(test_generation())
