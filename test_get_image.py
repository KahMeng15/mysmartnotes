import asyncio
import httpx

async def test():
    # Make a request without cookies or auth headers
    async with httpx.AsyncClient() as client:
        # Assuming the image we uploaded earlier is at this path
        img_url = "http://localhost:8000/resources/rs_39b85055/user-images/img_03a1a9797da247d9b3e23f650cc9ca2e.webp"
        res = await client.get(img_url)
        print("STATUS:", res.status_code)
        print("RESPONSE:", res.text)

if __name__ == "__main__":
    asyncio.run(test())
