import sqlite3
import os

DB_PATH = "./data/app.db"

def migrate():
    # Ensure directory exists
    if not os.path.exists("./data"):
        os.makedirs("./data", exist_ok=True)
        
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Create subject_groups table
    print("Creating subject_groups table...")
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS subject_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
        """)
    except Exception as e:
        print(f"Error creating table: {e}")

    # 2. Add group_id to subjects table
    print("Checking subjects table schema...")
    cursor.execute("PRAGMA table_info(subjects);")
    columns = [info[1] for info in cursor.fetchall()]
    
    if 'group_id' not in columns:
        print("Adding group_id column to subjects table...")
        try:
            # Try with FK constraint
            cursor.execute("ALTER TABLE subjects ADD COLUMN group_id INTEGER REFERENCES subject_groups(id);")
            print("Added group_id with FK constraint.")
        except Exception as e:
            print(f"Failed to add with FK constraint: {e}")
            try:
                # Fallback without explicit FK constraint
                cursor.execute("ALTER TABLE subjects ADD COLUMN group_id INTEGER;")
                print("Added group_id column (no explicit FK constraint in DDL).")
            except Exception as e2:
                print(f"Failed to add column: {e2}")
    else:
        print("group_id column already exists.")

    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
