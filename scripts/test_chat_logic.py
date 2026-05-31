import asyncio
import sys
import os

# Add the base directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.db import SessionLocal
from app.models.db import Lecture, User
from app.routers.chat import ask_question_logic

async def main():
    db = SessionLocal()
    
    lecture_id = "nt_01ff5107"
    lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
    
    if not lecture:
        print(f"Error: Lecture {lecture_id} not found in DB!")
        db.close()
        return
        
    user = db.query(User).filter(User.id == lecture.user_id).first()
    if not user:
        print(f"Error: User {lecture.user_id} not found in DB!")
        db.close()
        return
        
    db.close()
    
    print(f"Testing for User {user.id} on Lecture {lecture_id} ('{lecture.title}')")
    
    success_count = 0
    failures = []
    
    for i in range(10):
        print(f"\n--- Test iteration {i+1} ---")
        try:
            result = await ask_question_logic(
                user_id=user.id,
                message="What is OOP",
                lecture_id=lecture_id,
                ai_mode="normal",
                output_format="sentence",
                auto_detect_conversation=False
            )
            
            response_text = result["response"]
            sources = result.get("detailed_sources", [])
            
            print(f"Response: {response_text[:100]}...")
            print(f"Sources: {len(sources)}")
            
            has_think_tag = "<think>" in response_text or "</think>" in response_text
            is_web = any(s.get("is_web", False) for s in sources)
            
            if has_think_tag:
                print("FAILURE: <think> tag leaked into output.")
                failures.append(f"Iteration {i+1}: leaked <think> tag")
            elif is_web:
                print("FAILURE: Used web search instead of local knowledge base.")
                failures.append(f"Iteration {i+1}: used web search")
            else:
                print("SUCCESS.")
                success_count += 1
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Error: {e}")
            failures.append(f"Iteration {i+1}: Error {e}")
            
    print("\n==============================")
    print(f"Test complete. Success: {success_count}/10")
    if failures:
        print("Failures:")
        for f in failures:
            print(f" - {f}")

if __name__ == "__main__":
    asyncio.run(main())
