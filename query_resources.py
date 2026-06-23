from app.utils.db import SessionLocal
from app.models.db import Resource

db = SessionLocal()
resources = db.query(Resource).filter(Resource.subject_id == "sj_55ec7944").all()
for r in resources:
    print(f"ID: {r.id}, Title: {r.title}, Path: {r.file_path}")
