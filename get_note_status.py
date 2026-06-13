import asyncio
from app.models.db import Note, Task
from app.utils.db import SessionLocal

db = SessionLocal()
note = db.query(Note).filter(Note.id == 'nt_841a1944').first()
if note:
    print(f"Note id: {note.id}")
    print(f"processing_time_ms: {note.processing_time_ms}")
    print(f"extracted_text length: {len(note.extracted_text) if hasattr(note, 'extracted_text') and note.extracted_text else 'N/A or None'}")
else:
    print("Note not found")

task = db.query(Task).filter(Task.input_data.like('%nt_841a1944%')).first()
if task:
    print(f"Task status: {task.status}")
    print(f"Task progress: {task.progress}")
    print(f"Task error: {task.error_message}")
