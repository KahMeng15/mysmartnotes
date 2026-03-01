"""
Migration script to add output_format column to chat_messages table.
Run this if you've updated the code but the database hasn't been recreated.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.db import engine
from sqlalchemy import text

def migrate():
    try:
        with engine.connect() as conn:
            # Check if column exists
            try:
                conn.execute(text("SELECT output_format FROM chat_messages LIMIT 1"))
                print("✓ output_format column already exists")
                conn.commit()
                return
            except Exception:
                pass
            
            # Add the column
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN output_format VARCHAR(50) DEFAULT 'sentence'"
            ))
            conn.commit()
            print("✓ Successfully added output_format column to chat_messages table")
            
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    print("Running migration: add_output_format_column")
    migrate()
