import asyncio
import time
from dotenv import load_dotenv

load_dotenv()
from app.processing.ai_client import get_ai_client

async def main():
    client = get_ai_client()
    print(f"Testing raw model latency with {client.provider} ({client.ai_model_name})...")
    
    start_time = time.time()
    prompt = "Hi, can you tell me what 2 + 2 is? Output exactly one word."
    try:
        res = await client.generate_text(prompt, max_tokens=100)
        end_time = time.time()
        print(f"Success! Response: {res}")
        print(f"Raw Generation Time: {end_time - start_time:.2f} seconds")
    except Exception as e:
        print("Error during generation:", e)

if __name__ == "__main__":
    asyncio.run(main())
