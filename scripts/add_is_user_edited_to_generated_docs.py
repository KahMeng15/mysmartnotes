#!/usr/bin/env python3
"""
Migration script to add is_user_edited column to generated_documents table
"""
import sys
import sqlite3
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings

def migrate():
    settings = get_settings()
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    
    print(f"Connecting to database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check which columns exist
        cursor.execute("PRAGMA table_info(generated_documents)")
        columns = {col[1]: col for col in cursor.fetchall()}
        
        col_name = 'is_user_edited'
        if col_name in columns:
            print(f"✓ {col_name} column already exists")
        else:
            print(f"Adding {col_name} column...")
            cursor.execute(f"""
                ALTER TABLE generated_documents 
                ADD COLUMN {col_name} BOOLEAN DEFAULT 0
            """)
            conn.commit()
            print(f"✓ Successfully added column: {col_name}")
            
        return True
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return False
    finally:
        try:
            conn.close()
        except:
            pass

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
