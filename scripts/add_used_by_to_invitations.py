"""
Migration script to add used_by and accepted_by columns to user_invitations table
"""
import sqlite3
import sys

DB_PATH = "data/app.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(user_invitations)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if "used_by" in columns:
            print("✓ Column 'used_by' already exists")
            return True
        
        # Add used_by column (nullable foreign key to users table)
        print("Adding 'used_by' column to user_invitations table...")
        cursor.execute("""
            ALTER TABLE user_invitations
            ADD COLUMN used_by INTEGER
        """)
        
        print("✓ Migration completed successfully")
        conn.commit()
        return True
        
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
