import sqlite3
import os
import sys

def migrate():
    # Detect the database path based on the current script directory
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base_dir, 'data', 'app.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    print(f"Migrating database at {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Define all migrations needed based on existing scripts and models
    migrations = [
        ("system_settings", [
            ("session_length", "INTEGER DEFAULT 24"),
            ("session_unit", "TEXT DEFAULT 'hours'"),
            ("session_reset_on_activity", "BOOLEAN DEFAULT 1"),
            ("max_quiz_questions", "INTEGER DEFAULT 500"),
            ("unnecessary_logins_enabled", "BOOLEAN DEFAULT 0"),
            ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
        ]),
        ("summaries", [
            ("processing_time", "REAL"),
            ("processing_time_ms", "INTEGER"),
            ("split_level", "VARCHAR(10)"),
            ("quickread", "TEXT"),
            ("mode", "VARCHAR(50)"),
            ("output_format", "VARCHAR(50)"),
            ("processing_method", "VARCHAR(50)"),
            ("model", "VARCHAR(100)"),
            ("is_user_edited", "BOOLEAN DEFAULT 0")
        ]),
        ("lectures", [
            ("processing_time_ms", "INTEGER"),
            ("page_count", "INTEGER DEFAULT 0"),
            ("output_pdf_path", "VARCHAR(512)")
        ]),
        ("quizzes", [
            ("group_id", "VARCHAR(16)"),
            ("quiz_group_id", "VARCHAR(16)"),
            ("model", "VARCHAR(100)"),
            ("processing_time_ms", "INTEGER")
        ]),
        ("quiz_questions", [
            ("explanation", "TEXT"),
            ("explanation_mode", "VARCHAR(50)"),
            ("explanation_output", "VARCHAR(50)")
        ]),
        ("quiz_progress", [
            ("last_reviewed_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ("interval_days", "INTEGER DEFAULT 0"),
            ("ease_factor", "REAL DEFAULT 2.5"),
            ("consecutive_correct", "INTEGER DEFAULT 0")
        ])
    ]

    for table_name, columns_to_add in migrations:
        # Check if table exists
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}';")
        if not cursor.fetchone():
            print(f"Skipping table {table_name} - does not exist yet.")
            continue

        print(f"Checking table {table_name} for missing columns...")
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_cols = [row[1] for row in cursor.fetchall()]

        table_updated = False
        for col_name, col_def in columns_to_add:
            if col_name not in existing_cols:
                print(f"  Adding column {col_name} to {table_name}...")
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}")
                    table_updated = True
                except sqlite3.OperationalError as e:
                    print(f"  Error adding {col_name} to {table_name}: {e}")
            else:
                # print(f"  Column {col_name} already exists in {table_name}.")
                pass
        
        if table_updated:
            conn.commit()
            print(f"✅ Table {table_name} updated.")

    conn.close()
    print("\n✅ All migrations checked and applied!")

if __name__ == "__main__":
    migrate()
