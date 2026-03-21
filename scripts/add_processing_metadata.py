#!/usr/bin/env python3
"""Migration script to add processing_time and split_level columns to summaries table"""

import sqlite3
import sys

def migrate():
    db_path = "data/app.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(summaries)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'processing_time' not in columns:
            print("Adding processing_time column...")
            cursor.execute("ALTER TABLE summaries ADD COLUMN processing_time REAL")
            print("✓ processing_time column added")
        
        if 'split_level' not in columns:
            print("Adding split_level column...")
            cursor.execute("ALTER TABLE summaries ADD COLUMN split_level VARCHAR(10)")
            print("✓ split_level column added")
        
        conn.commit()
        print("\n✅ Migration complete!")
        
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("⚠️ Columns already exist, skipping migration")
            return
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
