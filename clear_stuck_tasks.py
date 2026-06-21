import asyncio
from app.utils.db import SessionLocal
from app.models.db import Task

db = SessionLocal()
stuck_tasks = db.query(Task).filter(Task.status == "running").all()
for t in stuck_tasks:
    t.status = "failed"
    t.error = "Stuck task cleared by system."
db.commit()
print(f"Cleared {len(stuck_tasks)} stuck tasks.")
db.close()
