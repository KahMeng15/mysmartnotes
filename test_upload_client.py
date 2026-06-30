from fastapi.testclient import TestClient
from app.main import app
from app.models.db import User, Resource, Subject
from app.utils.db import SessionLocal
from app.utils.auth import create_access_token
import io

client = TestClient(app)

def run_test():
    db = SessionLocal()
    # Find any user
    user = db.query(User).first()
    if not user:
        print("No user found")
        return
        
    # Find a resource for this user
    resource = db.query(Resource).filter(Resource.user_id == user.id).first()
    if not resource:
        print("No resource found for user")
        # Let's create one
        subject = db.query(Subject).filter(Subject.user_id == user.id).first()
        if not subject:
            subject = Subject(id="sj_test", name="Test", user_id=user.id)
            db.add(subject)
            db.commit()
        resource = Resource(id="rs_test", title="Test Res", original_filename="a.pdf", status="completed", user_id=user.id, subject_id=subject.id)
        db.add(resource)
        db.commit()
        
    token = create_access_token(data={"sub": str(user.id)})
    
    # Create a dummy image
    image_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    
    response = client.post(
        f"/resources/{resource.id}/upload-image",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("test.png", io.BytesIO(image_content), "image/png")}
    )
    
    print("STATUS:", response.status_code)
    print("RESPONSE:", response.json())
    
if __name__ == "__main__":
    run_test()
