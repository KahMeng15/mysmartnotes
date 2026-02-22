#!/usr/bin/env python3
"""
Test script for the fast QnA system
Run from workspace root: python scripts/test_qna_system.py
"""

import asyncio
import time
from app.processing.embeddings import find_relevant_snippets, combine_snippets
from app.processing.ai_client import AIClient

# Sample test content
sample_text = """
The history of photosynthesis spans centuries of scientific discovery.

--- Section 1: Photosynthesis Basics ---
Photosynthesis is the process by which plants convert light energy from the sun into chemical energy that can be stored in glucose. This process occurs in the chloroplasts of plant cells and involves two main stages: the light-dependent reactions and the light-independent reactions.

The light-dependent reactions occur in the thylakoid membranes of chloroplasts. Here, chlorophyll and other pigments absorb photons of light. When a photon is absorbed by a pigment molecule, an electron becomes excited and jumps to a higher energy level. These excited electrons then pass through a series of proteins known as the electron transport chain. The energy from these electrons is used to pump protons into the thylakoid lumen, which creates a proton gradient. The protons flow back across the thylakoid membrane through ATP synthase, which drives the synthesis of ATP from ADP and phosphate. Simultaneously, photosystem II reduces plastoquinone to form plastoquinol, and photosystem I reduces NADP+ to form NADPH. These ATP and NADPH molecules are the energy carriers required for the subsequent light-independent reactions.

--- Section 2: Carbon Fixation ---
The light-independent reactions, also known as the Calvin cycle, occur in the stroma of chloroplasts. The cycle begins with the fixation of carbon dioxide into a 3-carbon compound called 3-phosphoglycerate (3-PG) by the enzyme RuBisCO (Ribulose-1,5-bisphosphate carboxylase/oxygenase). The 3-PG is then reduced using ATP and NADPH from the light reactions to form glyceraldehyde-3-phosphate (G3P). Some of this G3P exits the cycle and is used to form glucose and other sugars, while the rest is recycled to regenerate ribulose-1,5-bisphosphate (RuBP) to continue the cycle.

--- Section 3: Factors Affecting Photosynthesis ---
Several environmental factors affect the rate of photosynthesis. Light intensity is one of the most important factors; as light intensity increases, the rate of photosynthesis increases until a saturation point is reached. Temperature also plays a crucial role; the rate of photosynthesis increases with temperature up to an optimal point (usually around 25-35°C for most plants), and then decreases due to enzyme denaturation. Carbon dioxide concentration is another limiting factor; increasing CO2 concentration increases the rate of photosynthesis until a plateau is reached. Water availability is essential since it is a raw material for photosynthesis and affects the opening and closing of stomata.

--- Section 4: Agricultural Applications ---
Understanding photosynthesis has led to significant agricultural advances. By optimizing growing conditions (light, temperature, CO2, water, and nutrients), farmers can increase crop yields. Vertical farming and greenhouses utilize controlled environmental conditions to maximize photosynthetic efficiency year-round. Genetic modification has also produced crops with enhanced photosynthetic capacity, leading to higher yields with fewer resources.
"""

def test_semantic_search():
    """Test semantic search functionality"""
    print("=" * 60)
    print("TEST 1: Semantic Search")
    print("=" * 60)
    
    queries = [
        "What is photosynthesis?",
        "How does the Calvin cycle work?",
        "What factors affect photosynthesis?",
        "Tell me about farming techniques"
    ]
    
    for query in queries:
        print(f"\n📝 Query: '{query}'")
        try:
            snippets = find_relevant_snippets(
                query=query,
                text=sample_text,
                top_k=3
            )
            print(f"   Found {len(snippets)} relevant snippets")
            
            combined = combine_snippets(snippets, max_chars=2000)
            print(f"   Combined length: {len(combined)} chars")
            print(f"   Preview: {combined[:150]}...")
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    print("\n✅ Semantic search test complete")


def test_prompt_building():
    """Test anti-hallucination prompt"""
    print("\n" + "=" * 60)
    print("TEST 2: Anti-Hallucination Prompt")
    print("=" * 60)
    
    context = """Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose."""
    question = "What is photosynthesis?"
    
    from app.routers.chat import build_strict_prompt
    
    prompt = build_strict_prompt(context, question)
    print(f"\n🎯 Built prompt ({len(prompt)} chars):")
    print("-" * 60)
    print(prompt)
    print("-" * 60)
    
    print("\n✅ Prompt building test complete")


async def test_web_search():
    """Test web search fallback"""
    print("\n" + "=" * 60)
    print("TEST 3: Web Search Fallback")
    print("=" * 60)
    
    from app.routers.chat import web_search
    
    query = "What is the capital of France?"
    print(f"\n🔍 Searching web for: '{query}'")
    
    try:
        result, source = await web_search(query, timeout=3.0)
        if result:
            print(f"   ✅ Found result from: {source}")
            print(f"   Content preview: {result[:200]}...")
        else:
            print(f"   ℹ️  No result found (expected if offline)")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print("\n✅ Web search test complete")


async def test_ai_client():
    """Test AI client with custom prompt"""
    print("\n" + "=" * 60)
    print("TEST 4: AI Client with Custom Prompt")
    print("=" * 60)
    
    try:
        from app.models.db import User
        
        # Create mock user (won't use real DB)
        client = AIClient(user=None)
        
        context = """Photosynthesis converts light energy into chemical energy through two stages:
        1. Light reactions in thylakoids producing ATP and NADPH
        2. Calvin cycle in stroma fixing CO2 into glucose"""
        
        question = "What are the two stages of photosynthesis?"
        
        print(f"\n🤖 Calling AI client...")
        print(f"   Context length: {len(context)} chars")
        print(f"   Question: {question}")
        
        start = time.time()
        response = await client.generate_text(
            prompt=f"Answer based on context:\n\nContext: {context}\n\nQuestion: {question}\n\nAnswer:"
        )
        elapsed = (time.time() - start) * 1000
        
        print(f"\n   ✅ Response received in {elapsed:.1f}ms")
        print(f"   Response: {response[:200] if response else '(no response)'}...")
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        print(f"   (This is expected if Ollama is not running)")
    
    print("\n✅ AI client test complete")


async def main():
    """Run all tests"""
    print("\n🚀 Starting Fast QnA System Tests\n")
    
    test_semantic_search()
    test_prompt_building()
    await test_web_search()
    await test_ai_client()
    
    print("\n" + "=" * 60)
    print("🎉 All tests complete!")
    print("=" * 60)
    print("\n📊 Performance targets:")
    print("   - Retrieval: < 500ms")
    print("   - Model: 1000-2000ms")
    print("   - Total: < 5000ms")
    print("\n💡 Next steps:")
    print("   1. Start the API server: python main.py")
    print("   2. Open http://localhost:8000/chat.html")
    print("   3. Select a note and ask a question")
    print("   4. Check timings in response")
    print("   5. Monitor console logs for debugging")
    print()


if __name__ == "__main__":
    asyncio.run(main())
