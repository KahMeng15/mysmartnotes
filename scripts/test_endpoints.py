import os
import sys
import json
from fastapi.testclient import TestClient

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.utils.db import SessionLocal
from app.models.db import User

def main():
    client = TestClient(app)
    
    # We need a user token or just override the get_current_user dependency
    # Let's get the first user
    db = SessionLocal()
    user = db.query(User).first()
    db.close()
    
    if not user:
        print("No users found in db.")
        return
        
    # Let's override get_current_user dependency
    from app.utils.auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: user
    
    # Now let's hit the failing endpoints!
    endpoints = [
        "/auth/me",
        "/subjects",
        "/notes",
        "/exercises/subject/sj_53a990ae",
        "/summaries?subject_id=sj_53a990ae"
    ]
    
    for ep in endpoints:
        print(f"\n--- GET {ep} ---")
        try:
            res = client.get(ep)
            print(f"Status Code: {res.status_code}")
            try:
                print("JSON Response:", json.dumps(res.json())[:200] + "...")
            except Exception:
                print("Raw Response:", repr(res.text)[:200] + "...")
        except Exception as e:
            print(f"Exception raised: {e}")
            
if __name__ == "__main__":
    main()
