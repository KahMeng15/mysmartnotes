from app.utils.db import SessionLocal
from app.models.db import Task, Note
import json

db = SessionLocal()
try:
    tasks = db.query(Task).filter(
        Task.status == "failed",
        Task.task_type == "note_generation"
    ).all()
    
    note_ids_to_delete = []
    task_ids_to_delete = []
    
    for t in tasks:
        task_ids_to_delete.append(t.task_id)
        if t.input_data:
            try:
                data = json.loads(t.input_data)
                if isinstance(data, dict) and "kwargs" in data and "note_id" in data["kwargs"]:
                    note_ids_to_delete.append(data["kwargs"]["note_id"])
            except Exception as e:
                print("Error parsing input data", e)

    if note_ids_to_delete:
        print(f"Deleting {len(note_ids_to_delete)} failed notes...")
        db.query(Note).filter(Note.id.in_(note_ids_to_delete)).delete(synchronize_session=False)
        
    if task_ids_to_delete:
        print(f"Deleting {len(task_ids_to_delete)} failed tasks...")
        db.query(Task).filter(Task.task_id.in_(task_ids_to_delete)).delete(synchronize_session=False)

    db.commit()
    print("Cleanup complete!")
finally:
    db.close()
