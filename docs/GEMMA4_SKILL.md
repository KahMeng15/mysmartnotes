# Skill: Handling Gemma 4 Reasoning Models

This skill provides guidance on interacting with **Gemma 4** models (e.g., `gemma-4-31b-it`, `gemma-4-26b-a4b-it`) in Google AI Studio, highlighting critical differences compared to Gemini and Gemma 3.

## 🧠 Core Architecture: The Reasoning Engine
Gemma 4 is a **reasoning-centric model** (similar to OpenAI o1 or DeepSeek-R1). Unlike standard Gemini models that generate responses in a single stream, Gemma 4 performs an internal "thinking" phase before producing the final output.

### Key Difference: The Thought Channel
Gemma 4's reasoning is exposed via a dedicated "Thought Channel". 
- **Tags:** Reasoning tokens are typically encapsulated between `<|channel|>thought` and `<channel|>` (or `<|thought|>` and `</|thought|>`).
- **Part Structure:** In the `google-generativeai` SDK, the reasoning may appear as the **first part** of the first candidate, or as a prefix in the text part.

## ⚠️ Known Issues in MySmartNotes
The current `AIClient` implementation in `app/processing/ai_client.py` is vulnerable to "Reasoning Leakage":
```python
# Current vulnerable logic:
return "".join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text')).strip()
```
**Problem:** This joins the raw internal thought process with the final answer, causing the UI to display technical "thinking" text to the user and potentially breaking Markdown formatting.

## 📊 Model Comparison

| Feature | Gemini 1.5/2.x/3.x | Gemma 3 | Gemma 4 |
|---------|-------------------|---------|---------|
| **Primary Goal** | General Performance | Efficiency | Deep Reasoning |
| **Response Style** | Direct Answer | Direct Answer | Thought -> Answer |
| **Thought Channel**| No | No | **Yes (Exposed)** |
| **Multi-part** | Rarely (for media) | No | **Common (Part 0=Thought)** |
| **500 Errors** | Low | Low | **High (31B variant stability)** |

## 🛠️ Best Practices for Gemma 4

### 1. Thought Filtering
Always filter out the reasoning block before returning the text to the application logic.
```python
def clean_gemma4_response(text: str) -> str:
    import re
    # Remove everything between thought channel tags
    cleaned = re.sub(r'<\|channel\|>thought.*?(<channel\|>|(?====START===))', '', text, flags=re.DOTALL)
    return cleaned.strip()
```

### 2. Model Selection
If `gemma-4-31b-it` returns a **500 Internal Server Error**, switch to the more stable **MoE (Mixture of Experts)** variant:
- **Preferred:** `models/gemma-4-26b-a4b-it`

### 3. Prompting Strategy
- **Markers:** Use explicit markers like `===START===` in your prompt. Gemma 4 is highly compliant with markers after finishing its reasoning.
- **System Instructions:** Gemma 4 respects the `system_instruction` parameter better than previous Gemma models. Use it to enforce "No Meta-talk".

### 4. Thinking Mode Control
In supported SDKs, you can control the reasoning depth:
- `reasoning_effort`: "low", "medium", or "high". 
- For MySmartNotes "Polish" tasks, "low" is usually sufficient and faster.

## 🚀 Recommended Implementation Update
Update `app/processing/ai_client.py` to handle the reasoning parts separately:
```python
# Logic to adopt:
final_parts = []
for part in response.candidates[0].content.parts:
    if hasattr(part, 'text'):
        if "<|channel|>thought" not in part.text:
            final_parts.append(part.text)
return "".join(final_parts).strip()
```
