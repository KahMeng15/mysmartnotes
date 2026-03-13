import sqlite3
import os

def migrate():
    db_path = "data/app.db"
    if not os.path.exists(db_path):
        print("Database file not found at data/app.db. Skipping migration.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Starting database migration...")

    # 1. Update 'users' table
    try:
        print("Adding Pomodoro preference columns to 'users' table...")
        cursor.execute("ALTER TABLE users ADD COLUMN pomo_study_mins INTEGER DEFAULT 25")
        cursor.execute("ALTER TABLE users ADD COLUMN pomo_break_mins INTEGER DEFAULT 5")
        cursor.execute("ALTER TABLE users ADD COLUMN pomo_long_break_mins INTEGER DEFAULT 15")
    except sqlite3.OperationalError as e:
        print(f"Note: {e} (Columns might already exist)")

    # 2. Update 'study_sessions' table
    try:
        print("Adding enhanced tracking columns to 'study_sessions' table...")
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN lecture_id INTEGER REFERENCES lectures(id)")
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN start_time DATETIME")
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN end_time DATETIME")
        cursor.execute("ALTER TABLE study_sessions ADD COLUMN status VARCHAR(50) DEFAULT 'completed'")
    except sqlite3.OperationalError as e:
        print(f"Note: {e} (Columns might already exist)")

    conn.commit()
    conn.close()
    print("Migration completed successfully.")

if __name__ == "__main__":
    migrate()
