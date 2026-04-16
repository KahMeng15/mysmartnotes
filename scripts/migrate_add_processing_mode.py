"""
Migration: Add note_processing_mode column to users table.

Run with:
    python scripts/migrate_add_processing_mode.py
"""

import sys
import os

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.utils.db import get_engine


def run():
    engine = get_engine()
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in result.fetchall()]

        if "note_processing_mode" not in columns:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN note_processing_mode VARCHAR(50) DEFAULT 'smart'"
            ))
            conn.commit()
            print("✅ Added 'note_processing_mode' column to users table.")
        else:
            print("ℹ️  Column 'note_processing_mode' already exists — skipping.")


if __name__ == "__main__":
    run()
