import os
import sys

# Add the project root to the python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.db import SessionLocal
from app.models.db import ChatMessage

def check_db():
    db = SessionLocal()
    try:
        messages = db.query(ChatMessage).filter(ChatMessage.conversation_id == "cv_480516fb").order_by(ChatMessage.created_at.desc()).limit(5).all()
        for msg in reversed(messages):
            print(f"Message ID: {msg.id}")
            print(f"User Request: {msg.message}")
            print(f"AI Mode: {msg.ai_mode} | Output Format: {msg.output_format}")
            print(f"Response:\n{msg.response}")
            print("-" * 50)
    finally:
        db.close()

if __name__ == "__main__":
    check_db()
