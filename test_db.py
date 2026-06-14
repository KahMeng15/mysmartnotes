import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Append backend directory
sys.path.append(os.getcwd())
from app.models.db import ChatMessage

DATABASE_URL = "postgresql://mysmartnotes:mysmartnotespassword@localhost:5432/mysmartnotes"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

msg = db.query(ChatMessage).filter(ChatMessage.conversation_id == "cv_22cc3fe6").order_by(ChatMessage.created_at.desc()).first()
if msg:
    print("----- MSG RESPONSE -----")
    print(repr(msg.response))
    print("----- MSG DETAILS -----")
    print("ai_mode:", msg.ai_mode)
    print("output_format:", msg.output_format)
    print("sources:", msg.sources)
    print("detailed_sources:", msg.detailed_sources_json)
    print("timings:", msg.timings_json)
else:
    print("Not found")
