import asyncio
from duckduckgo_search import DDGS

async def web_search(query: str, timeout: float = 8.0) -> tuple:
    try:
        def run_search():
            try:
                return DDGS().text(query, max_results=3)
            except Exception as e:
                print(f"[chat] DDGS error: {e}")
                return []

        results = await asyncio.wait_for(asyncio.to_thread(run_search), timeout=timeout)
        print("Results:", results)
        
        snippets = []
        sources = []
        for r in results:
            body = r.get("body", "").strip()
            url = r.get("href", "")
            if body:
                snippets.append(body)
                if url:
                    sources.append(url)
                    
        if snippets:
            combined = "\n\n".join(snippets[:300])
            main_source = sources[0] if sources else "Web Search"
            return combined, main_source
            
        return "", ""
    except Exception as e:
        import traceback
        traceback.print_exc()
        return "", ""

async def main():
    res = await web_search("What is a VLAN")
    print("Final result:", res)

asyncio.run(main())
