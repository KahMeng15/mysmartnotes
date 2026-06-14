import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.getcwd())
from app.models.db import Task

DATABASE_URL = "postgresql://mysmartnotes:mysmartnotespassword@localhost:5432/mysmartnotes"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

task = db.query(Task).filter(Task.type == "chat_response", Task.status == "completed").order_by(Task.updated_at.desc()).first()
if task:
    print(task.result)
