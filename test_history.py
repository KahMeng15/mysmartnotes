import asyncio
from app.processing.voice_engine import VoiceEngine

async def run():
    engine = VoiceEngine()
    history = [
        {"role": "user", "text": "hello"},
        {"role": "ai", "text": "hi there!"}
    ]
    res = await engine.evaluate_context("what did I just say?", "some context", "lenient", history)
    print(res)

asyncio.run(run())
