from app.models.db import Note
from app.schemas.schemas import NoteResponse
from app.utils.db import SessionLocal

db = SessionLocal()
note = db.query(Note).filter(Note.id == 'nt_841a1944').first()
if note:
    resp = NoteResponse.from_orm(note)
    print(resp.dict())
