import asyncio
import os
import sys
import re

# Add the project root to the python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.db import SessionLocal
from app.models.db import User
from app.processing.ai_client import AIClient
from app.routers.chat import classify_query, build_mode_prompt

async def run_tests():
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("No user found in database.")
            return
            
        client = AIClient(user=user, db=db)
        print(f"Using AI Provider: {client.provider}")
        
        # Test 1: Classify Query (Domain-aware)
        print("\n=== TEST 1: Classify Query ===")
        queries = [
            ("who is donald trump", "OFF_TOPIC"),
            ("hello how are you", "CONVERSATIONAL"),
            ("what are the advantages of python over java", "INFORMATIONAL_DOMAIN"),
            ("explain object oriented programming", "INFORMATIONAL_DOMAIN")
        ]
        
        for q, expected in queries:
            result = await classify_query(client, q)
            print(f"Query: '{q}'\nExpected: {expected} | Actual: {result}")
            if result != expected:
                print("  => FAILED ❌")
            else:
                print("  => PASSED ✅")
                
        # Test 2: Build Mode Prompt Output (Table format)
        print("\n=== TEST 2: Generate Table Format Output ===")
        context = "[Source 1]: Object-oriented programming (OOP) is a programming paradigm based on the concept of 'objects', which can contain data and code: data in the form of fields (often known as attributes or properties), and code, in the form of procedures (often known as methods)."
        question = "what is oop"
        prompt = build_mode_prompt(context, question, mode="elaborate", output_format="table")
        
        print("Sending prompt to AI...")
        raw_response = await client.answer_question(question=question, context=context, system_prompt=prompt)
        
        print("\n--- RAW XML RESPONSE ---")
        print(raw_response)
        
        # Test 3: XML Parsing
        print("\n=== TEST 3: XML Parsing ===")
        final_answer_match = re.search(r'<FINAL_ANSWER>(.*?)</FINAL_ANSWER>', raw_response, flags=re.DOTALL | re.IGNORECASE)
        if final_answer_match:
            parsed = final_answer_match.group(1).strip()
            print("Successfully extracted <FINAL_ANSWER>:")
            print(parsed)
            if "|" in parsed and "-" in parsed:
                print("\nOutput looks like a Markdown table! => PASSED ✅")
            else:
                print("\nOutput does NOT look like a Markdown table! => FAILED ❌")
        else:
            print("Failed to find <FINAL_ANSWER> tags! => FAILED ❌")
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_tests())
