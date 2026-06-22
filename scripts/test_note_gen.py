import asyncio
import logging
from sqlalchemy.orm import Session
from app.models.db import User
from app.utils.db import SessionLocal
from app.processing.ai_client import AIClient
from app.utils.tasks import NoteTask

logging.basicConfig(level=logging.INFO)

async def run_test():
    db = SessionLocal()
    user = db.query(User).first()
    
    # Check AIClient directly
    ai = AIClient(user=user, db=db)
    print("Testing generate_summary via AIClient:")
    
    custom_res = await ai.generate_summary(
        content="The mitochondria is the powerhouse of the cell.",
        mode="elaborate",
        output_format="sentence",
        processing_method="whole",
        custom_prompt="Translate this to French",
    )
    print("Custom Prompt Result:", custom_res)

    db.close()

if __name__ == "__main__":
    asyncio.run(run_test())
