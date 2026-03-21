import sqlite3
import os

db_path = "./data/app.db"

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Adding group_id column to quizzes table...")
        cursor.execute("ALTER TABLE quizzes ADD COLUMN group_id VARCHAR(8) REFERENCES subject_groups(id)")
        conn.commit()
        print("Successfully added group_id column.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column group_id already exists.")
        else:
            print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
