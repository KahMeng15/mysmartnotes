import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_PROJECT_ROOT / ".env")

import secrets
from app.utils.db import SessionLocal
from app.models.db import Exercise, Resource
from app.processing.exercise_processor import generate_exercise_task

db = SessionLocal()
file_id = f"ex_{secrets.token_hex(4)}"
resource_id = "rs_bc0a2a6a"  # Topic 1 Introduction

# Create dummy exercise
exercise = Exercise(
    id=file_id,
    user_id=2,  # User ID based on the uploads path (/2/)
    subject_id="sj_55ec7944",
    title="Test Exercise Script",
    model="gemini-2.5-pro",
)
db.add(exercise)
db.commit()
print(f"Created dummy exercise: {file_id}")

req_data = {
    "resource_ids": [resource_id],
    "question_types": ["Objective", "Short answer"],
    "lengths": ["Short"],
    "difficulties": ["Easy"],
    "num_questions": 3
}

print(f"Triggering generation for exercise {file_id}...")
# Call the function directly
generate_exercise_task(
    exercise_id=file_id,
    user_id=2,
    req_data=req_data,
    task_id="test_task_123"
)
print("Finished!")
