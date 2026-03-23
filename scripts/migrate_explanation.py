import sqlite3
import os

db_path = "data/app.db"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("Checking if 'explanation' column exists in 'quiz_questions'...")
    cursor.execute("PRAGMA table_info(quiz_questions)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "explanation" not in columns:
        print("Adding 'explanation' column to 'quiz_questions' table...")
        cursor.execute("ALTER TABLE quiz_questions ADD COLUMN explanation TEXT")
        conn.commit()
        print("Column added successfully.")
    else:
        print("Column 'explanation' already exists.")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
