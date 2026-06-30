import asyncio
import httpx
from app.models.db import User, Resource
from app.utils.db import SessionLocal
from app.utils.auth import create_access_token

async def test():
    db = SessionLocal()
    user = db.query(User).first()
    resource = db.query(Resource).filter(Resource.user_id == user.id).first()
    token = create_access_token(data={"sub": str(user.id)})
    
    async with httpx.AsyncClient() as client:
        img_url = "http://localhost:8000/resources/rs_39b85055/user-images/img_03a1a9797da247d9b3e23f650cc9ca2e.webp"
        res = await client.get(img_url, headers={"Authorization": f"Bearer {token}"})
        print("STATUS:", res.status_code)
        print("RESPONSE:", res.text[:200])

if __name__ == "__main__":
    asyncio.run(test())
