#!/usr/bin/env python3
"""
Migration script to add summary metadata columns to summaries table
Run this once to update the database schema
"""
import sys
import sqlite3
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings

def add_summary_metadata_columns():
    """Add mode, output_format, and processing_method columns to summaries table if they don't exist"""
    
    settings = get_settings()
    # Extract database path from SQLAlchemy URL
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    
    print(f"Connecting to database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check which columns exist
        cursor.execute("PRAGMA table_info(summaries)")
        columns = {col[1]: col for col in cursor.fetchall()}
        
        columns_to_add = {
            'mode': 'VARCHAR(50)',
            'output_format': 'VARCHAR(50)',
            'processing_method': 'VARCHAR(50)'
        }
        
        added = []
        for col_name, col_type in columns_to_add.items():
            if col_name in columns:
                print(f"✓ {col_name} column already exists")
            else:
                print(f"Adding {col_name} column...")
                cursor.execute(f"""
                    ALTER TABLE summaries 
                    ADD COLUMN {col_name} {col_type} NULL
                """)
                added.append(col_name)
        
        if added:
            conn.commit()
            print(f"✓ Successfully added {len(added)} column(s): {', '.join(added)}")
        else:
            print("✓ All columns already exist")
        
        # Verify all columns were added
        cursor.execute("PRAGMA table_info(summaries)")
        all_columns = {col[1] for col in cursor.fetchall()}
        
        missing = set(columns_to_add.keys()) - all_columns
        if missing:
            print(f"✗ Verification failed: missing columns {missing}")
            return False
        else:
            print("✓ Verification successful: all required columns are present")
            return True
            
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
    success = add_summary_metadata_columns()
    sys.exit(0 if success else 1)
