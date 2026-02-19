import sqlite3
import os

DB_PATH = "data/app.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. It will be created by the app.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "nickname" not in columns:
            print("Adding nickname column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN nickname VARCHAR(100)")
            conn.commit()
            print("Migration successful.")
        else:
            print("Nickname column already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
