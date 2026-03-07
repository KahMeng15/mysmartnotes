import asyncio
from duckduckgo_search import AsyncDDGS

async def main():
    async with AsyncDDGS() as ddgs:
        results = await ddgs.atext("What is a VLAN", max_results=3)
        print(results)

asyncio.run(main())
