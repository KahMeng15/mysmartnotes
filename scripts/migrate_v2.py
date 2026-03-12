import sqlite3
import os
from pathlib import Path

def migrate():
    db_path = "data/app.db"
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Running migrations...")

    # Add domain_url to system_settings
    try:
        cursor.execute("ALTER TABLE system_settings ADD COLUMN domain_url VARCHAR(255)")
        print("✅ Added domain_url column to system_settings")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("ℹ️ domain_url column already exists in system_settings")
        else:
            print(f"❌ Error adding domain_url: {e}")

    # The user_invitations table was likely created correctly by init_db 
    # since it didn't exist before, but we check if it has invited_by
    # just in case.

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
