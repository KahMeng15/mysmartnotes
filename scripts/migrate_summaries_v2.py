import sqlite3
import os
import random
import string

db_path = "./data/app.db"

def generate_id(length=8):
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Checking for summaries table...")
    
    # 1. Add 'version' column if it doesn't exist
    try:
        cursor.execute("ALTER TABLE summaries ADD COLUMN version INTEGER DEFAULT 1")
        print("Added 'version' column to summaries.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("'version' column already exists.")
        else:
            print(f"Error adding 'version' column: {e}")

    # 2. Handle ID migration from Integer to String(8)
    # Check current type of 'id'
    cursor.execute("PRAGMA table_info(summaries)")
    columns = cursor.fetchall()
    id_col = next((c for c in columns if c[1] == 'id'), None)
    
    if id_col and id_col[2].upper() == 'INTEGER':
        print("Migrating 'id' from INTEGER to TEXT...")
        
        # Create temp table with new schema
        cursor.execute("""
            CREATE TABLE summaries_new (
                id TEXT(8) PRIMARY KEY,
                version INTEGER NOT NULL DEFAULT 1,
                lecture_id TEXT(8) NOT NULL,
                summary_type TEXT(50),
                title TEXT(255) NOT NULL,
                file_path TEXT(512) NOT NULL,
                content TEXT,
                quickread TEXT,
                mode TEXT(50),
                output_format TEXT(50),
                processing_method TEXT(50),
                split_level TEXT(10),
                processing_time REAL,
                processing_time_ms INTEGER,
                model TEXT(100),
                is_user_edited INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(lecture_id) REFERENCES lectures(id)
            )
        """)
        
        # Copy data, generating new string IDs for existing rows
        cursor.execute("SELECT * FROM summaries")
        old_rows = cursor.fetchall()
        
        # Get column names for mapping
        cursor.execute("PRAGMA table_info(summaries)")
        old_cols = [c[1] for c in cursor.fetchall()]
        
        for row in old_rows:
            # Map old row to new schema
            row_dict = dict(zip(old_cols, row))
            new_id = generate_id()
            
            # Use current id if it was already string somehow (unlikely based on error)
            # but here we generate a fresh 8-char one as requested.
            
            # Prepare values for insertion
            vals = (
                new_id,
                row_dict.get('version', 1),
                row_dict.get('lecture_id'),
                row_dict.get('summary_type'),
                row_dict.get('title'),
                row_dict.get('file_path'),
                row_dict.get('content'),
                row_dict.get('quickread'),
                row_dict.get('mode'),
                row_dict.get('output_format'),
                row_dict.get('processing_method'),
                row_dict.get('split_level'),
                row_dict.get('processing_time'),
                row_dict.get('processing_time_ms'),
                row_dict.get('model'),
                row_dict.get('is_user_edited', 0),
                row_dict.get('created_at')
            )
            
            cursor.execute("""
                INSERT INTO summaries_new (
                    id, version, lecture_id, summary_type, title, file_path, content,
                    quickread, mode, output_format, processing_method, split_level,
                    processing_time, processing_time_ms, model, is_user_edited, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, vals)
            
        # Drop old and rename
        cursor.execute("DROP TABLE summaries")
        cursor.execute("ALTER TABLE summaries_new RENAME TO summaries")
        print("Successfully migrated summaries table schema.")
    else:
        print("summaries.id is already TEXT or already migrated.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
