import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.db import SessionLocal
from app.models.db import ChatMessage

def run():
    db = SessionLocal()
    msgs = db.query(ChatMessage).filter(ChatMessage.conversation_id == 'cv_ff3cfbff').order_by(ChatMessage.created_at).all()
    for msg in msgs:
        print(f"Message: {msg.message}")
        print(f"Mode: {msg.ai_mode}, Format: {msg.output_format}")
        print(f"Response:\n{msg.response}\n")
        print("-" * 50)
    db.close()

if __name__ == "__main__":
    run()
