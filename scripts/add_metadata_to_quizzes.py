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
        ("model", "VARCHAR(100)"),
        ("processing_time_ms", "INTEGER")
    ]
    
    try:
        for col_name, col_type in new_columns:
            print(f"Adding {col_name} column to quizzes table...")
            try:
                cursor.execute(f"ALTER TABLE quizzes ADD COLUMN {col_name} {col_type}")
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
