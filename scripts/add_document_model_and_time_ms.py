#!/usr/bin/env python3
"""
Migration script to add model and processing_time_ms columns to generated_documents table
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
        
        columns_to_add = {
            'processing_time_ms': 'INTEGER',
            'model': 'VARCHAR(100)'
        }
        
        added = []
        for col_name, col_type in columns_to_add.items():
            if col_name in columns:
                print(f"✓ {col_name} column already exists")
            else:
                print(f"Adding {col_name} column...")
                cursor.execute(f"""
                    ALTER TABLE generated_documents 
                    ADD COLUMN {col_name} {col_type} NULL
                """)
                added.append(col_name)
        
        if added:
            conn.commit()
            print(f"✓ Successfully added columns: {', '.join(added)}")
            
            # Migrate data from processing_time (seconds) to processing_time_ms
            if 'processing_time' in columns and 'processing_time_ms' in columns_to_add:
                print("Migrating data from processing_time to processing_time_ms...")
                cursor.execute("""
                    UPDATE generated_documents 
                    SET processing_time_ms = CAST(processing_time * 1000 AS INTEGER)
                    WHERE processing_time IS NOT NULL AND processing_time_ms IS NULL
                """)
                conn.commit()
                print("✓ Data migration complete")
        else:
            print("✓ All columns already exist")
            
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
