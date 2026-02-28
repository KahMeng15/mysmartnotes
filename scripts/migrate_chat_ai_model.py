"""
Migration: add ai_model column to chat_messages table.
Safe to run multiple times (no-op if column already exists).
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'app.db')

def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check whether column already exists
    cur.execute("PRAGMA table_info(chat_messages)")
    cols = {row[1] for row in cur.fetchall()}

    if 'ai_model' not in cols:
        cur.execute("ALTER TABLE chat_messages ADD COLUMN ai_model VARCHAR(255)")
        conn.commit()
        print("✓ Added 'ai_model' column to chat_messages.")
    else:
        print("✓ Column 'ai_model' already exists — nothing to do.")

    conn.close()

if __name__ == '__main__':
    run()
