import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app.config import get_settings
from sqlalchemy import create_engine, text

settings = get_settings()
engine = create_engine(settings.DATABASE_URL)
with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN last_chat_context VARCHAR(50) DEFAULT 'global'"))
        print("Added last_chat_context")
    except Exception as e:
        print(e)
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN last_chat_ai_mode VARCHAR(50) DEFAULT 'elaborate'"))
        print("Added last_chat_ai_mode")
    except Exception as e:
        print(e)
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN last_chat_output_format VARCHAR(50) DEFAULT 'sentence'"))
        print("Added last_chat_output_format")
    except Exception as e:
        print(e)

print("Migration complete")
