import sqlite3
import os

db_path = "./data/app.db"

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    new_columns = [
        ("last_reviewed_at", "DATETIME"),
        ("interval_days", "INTEGER DEFAULT 0"),
        ("ease_factor", "FLOAT DEFAULT 2.5"),
        ("consecutive_correct", "INTEGER DEFAULT 0")
    ]
    
    try:
        for col_name, col_type in new_columns:
            print(f"Adding {col_name} column to quiz_progress table...")
            try:
                cursor.execute(f"ALTER TABLE quiz_progress ADD COLUMN {col_name} {col_type}")
                print(f"Successfully added {col_name} column.")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e).lower():
                    print(f"Column {col_name} already exists.")
                else:
                    raise e
        conn.commit()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
