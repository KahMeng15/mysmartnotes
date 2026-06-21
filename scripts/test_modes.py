import asyncio
import os
import sys

# Add the project root to the python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.db import SessionLocal
from app.models.db import User
from app.processing.ai_client import AIClient
from app.routers.chat import build_mode_prompt

async def run_tests():
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("No user found in database. Using default AIClient.")
        client = AIClient(user=user, db=db)
        
        context = "[Source 1]: Object-oriented programming (OOP) is a programming paradigm based on the concept of \"objects\", which can contain data and code: data in the form of fields (often known as attributes or properties), and code, in the form of procedures (often known as methods). A common feature of objects is that procedures (or methods) are attached to them and can access and modify the object's data fields. In this brand of OOP, there is usually a special name such as this or self used to refer to the current object. In OOP, computer programs are designed by making them out of objects that interact with one another."
        question = "What is OOP?"
        
        modes = ["quick", "simple", "normal", "elaborate", "eli5"]
        formats = ["sentence", "pointform", "numbered_list", "table"]
        
        print("========== TESTING MODES (with Sentence format) ==========")
        for m in modes:
            print(f"\n---> MODE: {m.upper()}")
            prompt = build_mode_prompt(context, question, mode=m, output_format="sentence")
            res = await client.answer_question(context=context, question=question, system_prompt=prompt)
            print(res)
            
        print("\n========== TESTING FORMATS (with Normal mode) ==========")
        for f in formats:
            print(f"\n---> FORMAT: {f.upper()}")
            prompt = build_mode_prompt(context, question, mode="normal", output_format=f)
            res = await client.answer_question(context=context, question=question, system_prompt=prompt)
            print(res)
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_tests())
