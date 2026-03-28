#!/usr/bin/env python3
"""
Migration script to add reset period columns to tier_configs table.
Run this once to update the existing database schema.
"""
import sqlite3
import sys

def migrate():
    db_path = "data/app.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(tier_configs)")
        columns = [row[1] for row in cursor.fetchall()]
        
        # Add missing columns
        if 'conversations_reset_period' not in columns:
            print("Adding conversations_reset_period column...")
            cursor.execute("ALTER TABLE tier_configs ADD COLUMN conversations_reset_period VARCHAR(20)")
        else:
            print("conversations_reset_period already exists")
        
        if 'messages_reset_period' not in columns:
            print("Adding messages_reset_period column...")
            cursor.execute("ALTER TABLE tier_configs ADD COLUMN messages_reset_period VARCHAR(20)")
        else:
            print("messages_reset_period already exists")
        
        if 'summaries_reset_period' not in columns:
            print("Adding summaries_reset_period column...")
            cursor.execute("ALTER TABLE tier_configs ADD COLUMN summaries_reset_period VARCHAR(20)")
        else:
            print("summaries_reset_period already exists")
        
        conn.commit()
        print("✅ Migration completed successfully!")
        conn.close()
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
