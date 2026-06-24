import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

engine = create_engine(os.environ.get("DATABASE_URL"))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

from app.models.db import Task

tasks = db.query(Task).filter(Task.task_id.like('%ex_e8965501%')).all()
for t in tasks:
    print(f"Task ID: {t.task_id}")
    print(f"Status: {t.status}")
    print(f"Progress: {t.progress}")
    print(f"Error: {t.error}")

