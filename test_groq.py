import asyncio
import os
from dotenv import load_dotenv

# Load .env first
load_dotenv()

from app.processing.ai_client import get_ai_client
from app.config import get_settings

async def main():
    print(f"Loaded Settings Provider: {get_settings().GLOBAL_AI_TIER1_PROVIDER}")
    print(f"Loaded Settings Model: {get_settings().GLOBAL_AI_TIER1_MODEL}")
    
    client = get_ai_client()
    print(f"Initialized AIClient with Provider: {client.provider}")
    
    # Test generation
    prompt = "Hi, can you tell me what 2 + 2 is? Output exactly one word."
    try:
        res = await client.generate_text(prompt, max_tokens=100)
        print("Success! Response:", res)
    except Exception as e:
        print("Error during generation:", e)

if __name__ == "__main__":
    asyncio.run(main())
