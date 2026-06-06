import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.utils.db import SessionLocal
from app.models.db import Lecture
from app.utils.storage import StorageManager
from app.processing.embeddings import compute_and_store_embeddings

db = SessionLocal()
lecture_id = "nt_01ff5107"
text = StorageManager.get_lecture_text(lecture_id)
if not text:
    print("No text for lecture")
else:
    count = compute_and_store_embeddings(lecture_id, text, db)
    print(f"Stored {count} embeddings")
db.close()
