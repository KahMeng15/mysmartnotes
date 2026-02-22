"""
Migration script to add use_global_ai_config column to users table
Run this once to update existing databases
"""

import sqlite3
import os
from pathlib import Path

def migrate():
    """Add use_global_ai_config column to users table"""
    db_path = Path(__file__).parent.parent / "data" / "app.db"
    
    if not db_path.exists():
        print(f"Database not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'use_global_ai_config' in columns:
            print("✅ Column 'use_global_ai_config' already exists")
            return True
        
        # Add the new column
        cursor.execute("""
            ALTER TABLE users 
            ADD COLUMN use_global_ai_config BOOLEAN DEFAULT 0
        """)
        
        conn.commit()
        conn.close()
        
        print("✅ Successfully added 'use_global_ai_config' column to users table")
        return True
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    migrate()
