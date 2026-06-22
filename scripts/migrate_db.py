import os
import sys

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.db import SessionLocal
from sqlalchemy import text

def main():
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE system_settings RENAME COLUMN max_quiz_questions TO max_exercise_questions;'))
        db.execute(text('ALTER TABLE tier_configs RENAME COLUMN max_quizzes TO max_exercises;'))
        db.commit()
        print('Database columns renamed successfully!')
    except Exception as e:
        print('Error renaming columns:', str(e))
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
