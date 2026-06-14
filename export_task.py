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

task = db.query(Task).filter(Task.id == "chat_1_1781458724").first()
if task:
    with open("task_result.txt", "w") as f:
        f.write(task.result)
