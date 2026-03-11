import sqlite3
import os
import sys

# Add root project dir to path to allow importing app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.db import init_db

db_path = "data/app.db"

def migrate():
    # 1. First run SQLAlchemy create_all to create the new tables
    print("Running SQLAlchemy create_all to create new tables...")
    init_db()

    # 2. Alter existing users table for the new columns
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        columns_to_add = [
            ("is_admin", "BOOLEAN", "0"),
            ("is_approved", "BOOLEAN", "1"),
            ("tier", "VARCHAR(50)", "'free'")
        ]
        
        for col_name, col_type, default_val in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} DEFAULT {default_val}")
                print(f"Added column {col_name} to users table.")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e).lower():
                    print(f"Column {col_name} already exists.")
                else:
                    print(f"Error adding {col_name}: {e}")
                    
        # Optional: prompt to make first user admin
        try:
            cursor.execute("SELECT id, email FROM users ORDER BY id ASC LIMIT 1")
            first_user = cursor.fetchone()
            if first_user:
                print(f"Setting first user {first_user[1]} (ID {first_user[0]}) as admin...")
                cursor.execute(f"UPDATE users SET is_admin = 1 WHERE id = {first_user[0]}")
        except Exception as e:
            print(f"Could not auto-promote first user: {e}")
            
        conn.commit()
        conn.close()
        print("Migration complete!")
    else:
        print("data/app.db not found. A new one will be created from scratch next time app runs.")

if __name__ == "__main__":
    migrate()
