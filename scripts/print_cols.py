import os
import sys

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.db import SessionLocal
from sqlalchemy import text

def main():
    db = SessionLocal()
    try:
        res = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'system_settings';")).fetchall()
        cols = [r[0] for r in res]
        print("Columns in system_settings:", cols)
        
        res2 = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'tier_configs';")).fetchall()
        cols2 = [r[0] for r in res2]
        print("Columns in tier_configs:", cols2)
    except Exception as e:
        print('Error:', str(e))
    finally:
        db.close()

if __name__ == "__main__":
    main()
