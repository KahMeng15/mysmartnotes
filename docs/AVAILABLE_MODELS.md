# Available AI Models (Google AI Studio)

This document lists the models currently available through the Google Generative AI API, as discovered via the `list_models()` method. Use these identifiers in your `.env` or administrator dashboard.

## 🚀 Gemini 2.x Series (Standard & Experimental)
High-performance models for general reasoning, coding, and multi-modal tasks.

| Model ID | Supported Methods | Notes |
|----------|-------------------|-------|
| `models/gemini-2.5-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | **Recommended Default** |
| `models/gemini-2.5-pro` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | High reasoning capabilities |
| `models/gemini-2.0-flash` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Stable 2.0 variant |
| `models/gemini-2.0-flash-lite` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Optimized for speed/cost |
| `models/gemini-2.5-flash-lite` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Latest lightweight variant |

## 🧪 Gemini 3.x Series (Previews)
Experimental next-generation models.

| Model ID | Supported Methods | Notes |
|----------|-------------------|-------|
| `models/gemini-3-pro-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Next-gen reasoning |
| `models/gemini-3-flash-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Next-gen speed |
| `models/gemini-3.1-pro-preview` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Enhanced 3.1 architecture |
| `models/gemini-3.1-flash-lite` | `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent` | Latest 3.1 preview |

## 🧠 Gemma 4 Series (Reasoning)
Open-weights reasoning models with internal "thought channels".

| Model ID | Supported Methods | Notes |
|----------|-------------------|-------|
| `models/gemma-4-31b-it` | `generateContent`, `countTokens` | 31B Dense (Internal 500 errors common) |
| `models/gemma-4-26b-a4b-it` | `generateContent`, `countTokens` | **Recommended Gemma 4 Stable (MoE)** |

## 🖼️ Specialized & Native Modalities
Models optimized for specific data types or experimental features.

| Model ID | Supported Methods | Notes |
|----------|-------------------|-------|
| `models/gemini-2.5-flash-image` | `generateContent`, `countTokens`, `batchGenerateContent` | Image-first optimization |
| `models/gemini-2.5-flash-native-audio-latest` | `countTokens`, `bidiGenerateContent` | Real-time audio processing |
| `models/gemini-embedding-001` | `embedContent`, `countTextTokens` | Text embeddings |
| `models/gemini-embedding-2` | `embedContent`, `countTextTokens` | Latest embedding model |
| `models/deep-research-pro-preview` | `generateContent`, `countTokens` | Specialized for long-form research |

## 🛠️ Usage Notes
- **API Key:** Ensure your `GEMINI_API_KEY` has permissions for the model series.
- **Experimental Models:** Models marked with `preview` or `experimental` may have lower rate limits or inconsistent uptime.
- **Thinking Mode:** Gemma 4 models require special handling for their `<|channel|>thought` tokens. See `docs/GEMMA4_SKILL.md` for implementation details.
