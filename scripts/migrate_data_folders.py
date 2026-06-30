import os
import shutil
import sys
from sqlalchemy.orm import Session

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.db import Resource, Note, Exercise, User
from app.utils.db import SessionLocal

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
USERS_DIR = os.path.join(DATA_DIR, "users")

def move_file(src, dest):
    if os.path.exists(src):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.move(src, dest)
        print(f"Moved {src} -> {dest}")

def migrate_data():
    if not os.path.exists(USERS_DIR):
        os.makedirs(USERS_DIR, exist_ok=True)

    with SessionLocal() as db:
        resources = db.query(Resource).all()
        notes = db.query(Note).all()
        exercises = db.query(Exercise).all()

        # Migrate Resources (files, JSONs, images)
        for r in resources:
            uid = str(r.user_id)
            user_res_dir = os.path.join(USERS_DIR, uid, "resources")
            
            # Text
            move_file(os.path.join(DATA_DIR, "resources", f"{r.id}.md"), os.path.join(user_res_dir, f"{r.id}.md"))
            # JSON (Structured & Images)
            move_file(os.path.join(DATA_DIR, "resources", f"{r.id}_structured.json"), os.path.join(user_res_dir, f"{r.id}_structured.json"))
            move_file(os.path.join(DATA_DIR, "resources", f"{r.id}_images.json"), os.path.join(user_res_dir, f"{r.id}_images.json"))
            
            # Extracted Images
            old_images_dir = os.path.join(DATA_DIR, "extracted_images", r.id)
            new_images_dir = os.path.join(USERS_DIR, uid, "extracted_images", r.id)
            if os.path.exists(old_images_dir):
                move_file(old_images_dir, new_images_dir)
            
            # User Uploads (images)
            old_user_uploads = os.path.join(DATA_DIR, "user_uploads", r.id)
            new_user_uploads = os.path.join(USERS_DIR, uid, "user_images", r.id)
            if os.path.exists(old_user_uploads):
                move_file(old_user_uploads, new_user_uploads)

            # Generated Files (OUTPUT.pdf, OUTPUT.docx)
            old_generated = os.path.join(DATA_DIR, "generated", r.id)
            new_generated = os.path.join(USERS_DIR, uid, "exports", r.id)
            if os.path.exists(old_generated):
                move_file(old_generated, new_generated)

            old_output = os.path.join(DATA_DIR, "output", r.id)
            new_output = os.path.join(USERS_DIR, uid, "exports", r.id)
            if os.path.exists(old_output):
                move_file(old_output, new_output)
                
            # Uploads
            # Assuming uploads were saved in data/uploads/r.id (if they were separated)
            # Actually uploads were in `data/uploads/user_{id}` in some places, or `data/uploads/resource_id`

        # Migrate Notes
        for n in notes:
            # We need to find the user_id. Note has resource_id.
            r = db.query(Resource).filter(Resource.id == n.resource_id).first()
            if not r: continue
            uid = str(r.user_id)
            user_notes_dir = os.path.join(USERS_DIR, uid, "notes")
            
            move_file(os.path.join(DATA_DIR, "notes", f"{n.id}.md"), os.path.join(user_notes_dir, f"{n.id}.md"))
            move_file(os.path.join(DATA_DIR, "notes", f"{n.id}_quickread.md"), os.path.join(user_notes_dir, f"{n.id}_quickread.md"))

            # Update database paths
            if n.output_pdf_path and "data/users" not in n.output_pdf_path:
                old_pdf = n.output_pdf_path
                new_pdf = old_pdf.replace("data/generated", f"data/users/{uid}/exports").replace("data/output", f"data/users/{uid}/exports")
                n.output_pdf_path = new_pdf
            if n.output_docx_path and "data/users" not in n.output_docx_path:
                old_docx = n.output_docx_path
                new_docx = old_docx.replace("data/generated", f"data/users/{uid}/exports").replace("data/output", f"data/users/{uid}/exports")
                n.output_docx_path = new_docx

        db.commit()

        # Migrate Exercises
        for e in exercises:
            r = db.query(Resource).filter(Resource.id == e.resource_id).first()
            if not r: continue
            uid = str(r.user_id)
            user_ex_dir = os.path.join(USERS_DIR, uid, "exercises")
            
            # There could be multiple JSON files for exercises
            old_ex_dir = os.path.join(DATA_DIR, "exercises")
            if os.path.exists(old_ex_dir):
                for f in os.listdir(old_ex_dir):
                    if f.startswith(e.id):
                        move_file(os.path.join(old_ex_dir, f), os.path.join(user_ex_dir, f))

        print("Data migration complete.")

if __name__ == "__main__":
    migrate_data()
