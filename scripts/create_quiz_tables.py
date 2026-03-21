import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.db import init_db

if __name__ == "__main__":
    print("Creating new quiz tables...")
    init_db()
    print("Done")
