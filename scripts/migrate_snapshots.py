import sqlite3
import os

DB_PATH = "./data/app.db"

def migrate():
    if not os.path.exists("./data"):
        os.makedirs("./data", exist_ok=True)
        
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create note_snapshots table
    print("Creating note_snapshots table...")
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS note_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lecture_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            name VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lecture_id) REFERENCES lectures (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
        """)
        print("note_snapshots table created successfully.")
    except Exception as e:
        print(f"Error creating table: {e}")

    # Create index for faster lookups
    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_lecture ON note_snapshots(lecture_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_user ON note_snapshots(user_id);")
        print("Indexes created.")
    except Exception as e:
        print(f"Error creating indexes: {e}")

    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
