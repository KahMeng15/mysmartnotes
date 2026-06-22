from app.utils.db import SessionLocal
from app.models.db import Task
from datetime import datetime

db = SessionLocal()
try:
    tasks = db.query(Task).filter(Task.status.in_(["pending", "processing", "running"])).all()
    print(f"Found {len(tasks)} running/pending tasks")
    for t in tasks:
        t.status = "failed"
        t.error_message = "Cancelled by admin"
        t.updated_at = datetime.utcnow()
    db.commit()
    print("All tasks cancelled!")
finally:
    db.close()
