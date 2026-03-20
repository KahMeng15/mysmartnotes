#!/usr/bin/env python3
"""
Migration script to add quickread column to generated_documents table
Run this once to update the database schema
"""
import sys
import sqlite3
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings

def add_quickread_column():
    """Add quickread column to generated_documents table if it doesn't exist"""
    
    settings = get_settings()
    # Extract database path from SQLAlchemy URL
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    
    print(f"Connecting to database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column exists
        cursor.execute("PRAGMA table_info(generated_documents)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if "quickread" in columns:
            print("✓ quickread column already exists")
            return True
        
        # Add the column
        print("Adding quickread column...")
        cursor.execute("""
            ALTER TABLE generated_documents 
            ADD COLUMN quickread TEXT NULL
        """)
        
        conn.commit()
        print("✓ quickread column added successfully")
        
        # Verify it was added
        cursor.execute("PRAGMA table_info(generated_documents)")
        columns = [col[1] for col in cursor.fetchall()]
        if "quickread" in columns:
            print("✓ Verification successful: quickread column is now in the table")
            return True
        else:
            print("✗ Verification failed: quickread column not found after migration")
            return False
            
    except sqlite3.OperationalError as e:
        print(f"✗ Database error: {e}")
        return False
    except Exception as e:
        print(f"✗ Error: {e}")
        return False
    finally:
        try:
            conn.close()
        except:
            pass

if __name__ == "__main__":
    success = add_quickread_column()
    sys.exit(0 if success else 1)
