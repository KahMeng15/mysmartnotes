import sqlite3
import os

def migrate():
    # Correct path to the database
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base_dir, 'data', 'app.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Checking system_settings table for max_quiz_questions column...")
    
    # Get current columns
    cursor.execute("PRAGMA table_info(system_settings)")
    columns = [row[1] for row in cursor.fetchall()]

    new_cols = [
        ("max_quiz_questions", "INTEGER DEFAULT 500")
    ]

    added = False
    for col_name, col_def in new_cols:
        if col_name not in columns:
            print(f"Adding {col_name} column...")
            try:
                cursor.execute(f"ALTER TABLE system_settings ADD COLUMN {col_name} {col_def}")
                added = True
            except sqlite3.OperationalError as e:
                print(f"Error adding {col_name}: {e}")
        else:
            print(f"Column {col_name} already exists.")

    if added:
        conn.commit()
        print("Migration completed successfully.")
    else:
        print("No changes needed.")

    conn.close()

if __name__ == "__main__":
    migrate()
