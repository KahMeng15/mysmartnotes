"""Chat/Q&A endpoints with conversation threading and AI response modes"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Integer
from pydantic import BaseModel, field_validator
import time
from typing import List, Optional
import json
import asyncio
import uuid
import logging

from app.models.db import User, Note, ChatMessage, Subject, SubjectGroup
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id, generate_conversation_id
from app.utils.quotas import enforce_quota_messages, check_quota_conversations, get_user_conversation_count, get_user_tier_config
from app.processing.ai_client import AIClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    note_id: Optional[str] = None
    subject_id: Optional[str] = None
    group_id: Optional[str] = None
    message: str
    ai_mode: str = "elaborate"
    output_format: str = "sentence"
    conversation_id: Optional[str] = None
    auto_detect_conversation: bool = True  # Auto-detect if this is a conversation continuation
    reply_to_message_id: Optional[str] = None  # Reply to a specific message in conversation


class ChatMessageResponse(BaseModel):
    id: str
    message: str
    response: str
    sources: list = []
    detailed_sources: list = []
    created_at: str
    note_id: Optional[str] = None
    subject_id: Optional[str] = None
    group_id: Optional[str] = None
    ai_mode: Optional[str] = None
    output_format: Optional[str] = None
    ai_model: Optional[str] = None
    conversation_id: Optional[str] = None
    conversation_title: Optional[str] = None
    reply_to_message_id: Optional[str] = None
    timings: Optional[dict] = None

    @field_validator('id', 'conversation_id', 'reply_to_message_id', mode='before')
    @classmethod
    def coerce_to_str(cls, v):
        if v is None: return v
        return str(v)


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    message_count: int
    last_message_at: str
    note_id: Optional[str] = None
    subject_id: Optional[str] = None
    group_id: Optional[str] = None
    scope_type: Optional[str] = None
    is_pinned: bool = False
    is_favourite: bool = False

    @field_validator('conversation_id', mode='before')
    @classmethod
    def coerce_to_str(cls, v):
        if v is None: return v
        return str(v)


class ChatResponse(BaseModel):
    message: str
    response: str
    sources: list = []
    timings: Optional[dict] = None
    ai_mode: Optional[str] = None
    output_format: Optional[str] = None
    ai_model: Optional[str] = None
    detailed_sources: Optional[list] = []
    conversation_id: Optional[str] = None
    conversation_title: Optional[str] = None
    reply_to_message_id: Optional[str] = None

    @field_validator('conversation_id', 'reply_to_message_id', mode='before')
    @classmethod
    def coerce_to_str(cls, v):
        if v is None: return v
        return str(v)


# ─────────────────────────────────────────────────────────────────────────────
# AI Mode Definitions and Prompt Builder
# ─────────────────────────────────────────────────────────────────────────────

AI_MODES = {
    "quick":       {"label": "Quick",      "icon": "ph-lightning",         "description": "Use less processing to get answer"},
    "simple":      {"label": "Simple",     "icon": "ph-text-a-underline",  "description": "Answer in simple terms"},
    "normal":      {"label": "Normal",     "icon": "ph-stack",             "description": "A balanced response with standard detail"},
    "elaborate":   {"label": "Elaborate",  "icon": "ph-lightbulb",         "description": "Provide thorough explanation"},
    "eli5":        {"label": "ELI5",       "icon": "ph-smiley",            "description": "Explain like I'm 5"},
}

OUTPUT_FORMATS = {
    "sentence":       "Single paragraph response",
    "pointform":      "Bullet point format",
    "numbered_list":  "Numbered list format",
    "table":          "Table format",
}

_BASE_GUARD = (
    "CRITICAL: Answer ONLY using the provided context. "
    "If the answer is NOT found in the context, respond with EXACTLY AND ONLY: \"I am unable to find any information based on your question.\" "
    "Do NOT make up facts, hallucinate information, or guess. "
    "Never provide information outside the provided context."
)


def build_mode_prompt(context: str, question: str, mode: str, output_format: str = "sentence", is_web_search: bool = False, conversation_context: str = "") -> str:
    """Return the full system prompt based on AI mode and output format."""
    if question.strip().lower() in {"hi", "hello", "how are you", "how are you?"}:
        return f"You are a friendly assistant. Respond warmly and ONLY output the final greeting. Do NOT show your internal reasoning, constraints, or options. Just say 'Hello' or 'Hi' with a friendly follow-up. Question: '{question}'"

    # Base mode instructions with STRICTER constraints
    mode_instructions = {
        "quick": "You are a concise assistant. Extract the most important facts from the context. Be specific and factual. If context lacks details, say 'I am unable to find any information based on your question.'",
        "simple": "Explain using ONLY the provided context. Use plain, everyday language. Avoid jargon. If unclear in context, say 'I am unable to find any information based on your question.'",
        "normal": "Provide a balanced response using ONLY the provided context. Be clear and informative without being overly brief or excessively detailed.",
        "elaborate": "Provide thorough, well-structured explanations grounded in the context. Be detailed but accurate. Never assume facts not in context.",
        "eli5": "Explain like to a 5-year-old using ONLY context material. Use short sentences and relatable analogies from the context only.",
    }

    # Output format instructions (Suggestive rather than strict)
    output_instructions = {
        "sentence": "Respond using complete sentences. You may use headings, titles, or multiple sections as appropriate.",
        "pointform": "Incorporate bullet points where helpful. You may use headings, titles, or multiple sections as appropriate.",
        "numbered_list": "Incorporate numbered lists where helpful. You may use headings, titles, or multiple sections as appropriate.",
        "table": "Include a markdown table if relevant. You may use headings, titles, or multiple sections as appropriate.",
    }

    mode_inst = mode_instructions.get(mode, mode_instructions["elaborate"])
    output_inst = output_instructions.get(output_format, output_instructions["sentence"])

    guard = _BASE_GUARD
    if is_web_search:
        guard = (
            "CRITICAL: Answer using ONLY the web search snippets provided. "
            "Do NOT add external knowledge. "
            "If the answer is NOT found in snippets, respond with EXACTLY AND ONLY: \"I am unable to find any information based on your question.\" "
            "Never hallucinate or guess."
        )
    prompt = f"""{mode_inst}

{guard}

{output_inst}

CRITICAL: 
You MUST output your response as a valid JSON object. Do not include any other text, markdown blocks, or greetings before or after the JSON.
Your JSON must exactly match the following structure:
{{
  "reasoning": "your step-by-step internal thoughts, constraint checks, and task analysis",
  "final_answer": "your polished final answer that directly addresses the prompt. No intro phrases. No checklists."
}}

RULES FOR final_answer:
- NO introductory phrases like "Based on...", "Let me explain...", "Here's what..."
- Answer directly and concisely
- PARAPHRASE the context in your own words—do NOT copy-paste source text
- Do NOT include quotes or brackets
- Do NOT include author names or dates in the answer
- Simply answer naturally; numerical citations [1], [2], etc. will be added automatically
- If you found the answer, provide IT and NOTHING ELSE. Do NOT append "I am unable to find any information..." to a valid answer.
- Never add information outside the provided context
- Check facts twice before responding
"""

    if conversation_context:
        prompt += f"""
PREVIOUS CONVERSATION (for context):
{conversation_context}

Use this to understand the discussion, but focus on the current question.
"""

    prompt += f"""
CONTEXT:
{context}

QUESTION: {question}

ANSWER (be accurate and honest):"""
    
    return prompt


async def classify_query(client: AIClient, question: str) -> str:
    """Classify the user intent to avoid unnecessary retrieval or off-topic web searches."""
    prompt = (
        "Classify this user query into strictly one of three categories:\n"
        "1. CONVERSATIONAL: Simple greetings, praise, thanks, goodbyes, or small talk (e.g. 'hello', 'thanks', 'how are you').\n"
        "2. OFF_TOPIC: Requests unrelated to answering questions from notes, such as asking to write a poem, generate code, personal advice, or tell a joke.\n"
        "3. INFORMATIONAL: Questions asking for facts, explanations, summaries, or knowledge.\n\n"
        "Reply with EXACTLY ONE WORD: CONVERSATIONAL, OFF_TOPIC, or INFORMATIONAL."
    )
    try:
        res = await asyncio.wait_for(
            client.answer_question(question=question, context="", system_prompt=prompt),
            timeout=3.0
        )
        res_upper = res.strip().upper()
        if "CONVERSATIONAL" in res_upper: return "CONVERSATIONAL"
        if "OFF_TOPIC" in res_upper: return "OFF_TOPIC"
        return "INFORMATIONAL"
    except Exception:
        return "INFORMATIONAL"  # Default to informational if classification fails


async def is_conversation_continuation(
    client: AIClient, 
    current_question: str, 
    last_question: Optional[str],
    last_answer: Optional[str]
) -> bool:
    """Determine if the current question is a follow-up/continuation of the last conversation.
    
    Returns True if the question appears to be directly related to the last exchange.
    Examples:
    - Last: "What is photosynthesis?" → Current: "How does it work?" → True
    - Last: "Explain gravity" → Current: "Tell me about physics" → False (likely new topic)
    """
    if not last_question or not last_answer:
        return False  # No previous context = new conversation
    
    prompt = f"""Determine if the CURRENT question is a direct follow-up or continuation of the LAST Q&A exchange.

LAST QUESTION: {last_question}
LAST ANSWER (preview): {last_answer[:200]}...

CURRENT QUESTION: {current_question}

Is the CURRENT question a direct follow-up/continuation? Answer with EXACTLY ONE WORD: YES or NO.

Examples of YES: 
- Last: "What is photosynthesis?" → Current: "How does it work?" 
- Last: "Explain gravity" → Current: "Can you give more examples?"
- Last: "What's the capital of France?" → Current: "What about Germany?"

Examples of NO:
- Last: "What is photosynthesis?" → Current: "Tell me a joke"
- Last: "Explain photosynthesis" → Current: "Explain gravity instead"
- Last: "What's the weather?" → Current: "Unrelated question about cooking"
"""
    
    try:
        res = await asyncio.wait_for(
            client.answer_question(question=current_question, context="", system_prompt=prompt),
            timeout=3.0
        )
        res_upper = res.strip().upper()
        return "YES" in res_upper
    except Exception:
        return False  # Default to new conversation if detection fails


def build_conversation_context(messages: List[ChatMessage], max_messages: int = 3) -> str:
    """Build formatted context from previous messages in the conversation.
    
    Returns a formatted string with the last N messages to include as context for the AI.
    """
    if not messages:
        return ""
    
    # Get the last N messages (most recent)
    recent_messages = messages[-max_messages:]
    
    context_parts = ["Previous conversation context:"]
    for i, msg in enumerate(recent_messages, 1):
        context_parts.append(f"\n[Message {i}]")
        context_parts.append(f"Q: {msg.message}")
        context_parts.append(f"A: {msg.response[:300]}...")  # Truncate long responses
    
    return "\n".join(context_parts)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def generate_conversation_title(first_question: str) -> str:
    """Derive a clean, readable conversation title from the first question (max 8 words)."""
    title = first_question.strip()
    if title.endswith("?"):
        title = title[:-1].strip()
    if title:
        title = title[0].upper() + title[1:]
        
    words = title.split()
    if len(words) > 8:
        title = " ".join(words[:8]) + "…"

    if len(title) > 80:
        truncated = title[:77]
        last_space = truncated.rfind(" ")
        title = (truncated[:last_space] if last_space > 50 else truncated) + "…"
    return title or "New Conversation"


async def web_search(query: str, timeout: float = 10.0) -> tuple:
    """Quick web search using ddgs with relevance filtering. Returns (snippet, sources_list, error_status).
    sources_list: list of {"url": url, "title": title, "text_preview": snippet, "relevance_score": %}
    error_status: None = success, 'timeout' = slow/taking too long, 'unavailable' = error (DDG down)
    """
    try:
        from ddgs import DDGS
        import asyncio
        
        def calculate_relevance(query_str: str, title: str, body: str) -> float:
            """Calculate realistic relevance score (0-100) based on semantic matching."""
            import re
            
            query_lower = query_str.lower()
            title_lower = title.lower()
            body_lower = body.lower()
            
            # Extract important query terms (>2 chars, not stop words)
            query_words = [w for w in query_lower.split() if len(w) > 2 and w not in {'what', 'this', 'that', 'with', 'from', 'into', 'have', 'been', 'does', 'is', 'a', 'an', 'the'}]
            
            if not query_words:
                return 0.0
            
            score = 0.0
            
            # 1. Title relevance (40% weight) - very important
            title_matches = sum(1 for word in query_words if word in title_lower)
            title_score = (title_matches / len(query_words)) * 100 if query_words else 0
            score += title_score * 0.40
            
            # 2. Keyword density in body (35% weight)
            body_words = re.findall(r'\\b\\w+\\b', body_lower)
            if body_words:
                keyword_count = sum(1 for word in body_words if word in query_words)
                density = keyword_count / len(body_words)
                # Non-linear: high density rewards are capped
                density_score = min(density * 150, 100)  
                score += density_score * 0.35
            
            # 3. Phrase matching bonus (25% weight) - if keywords appear together
            phrase_bonus = 0
            for i in range(len(query_words) - 1):
                phrase = f'{query_words[i]} {query_words[i+1]}'
                if phrase in body_lower or phrase in title_lower:
                    phrase_bonus += 15
            phrase_bonus = min(phrase_bonus, 100)
            score += phrase_bonus * 0.25
            
            # Cap at 100% and round
            return min(score, 100.0)
        
        def run_search():
            try:
                ddgs_instance = DDGS(timeout=5)
                return list(ddgs_instance.text(query, max_results=8))  # Get more to filter
            except Exception as e:
                print(f"[chat] DDGS error: {e}")
                return []

        try:
            results = await asyncio.wait_for(asyncio.to_thread(run_search), timeout=timeout)
        except asyncio.TimeoutError:
            print(f"[chat] Web search timed out after {timeout}s")
            return "", [], "timeout"
        
        sources_list = []
        for r in results:
            body = r.get("body", "").strip()
            url = r.get("href", "")
            title = r.get("title", "")
            if body:
                # Calculate relevance score
                relevance = calculate_relevance(query, title, body)
                
                # Filter out low relevance results (< 20% with new algorithm)
                if relevance < 20.0:
                    print(f"[chat] Skipping low-relevance result: {title[:50]}... (score: {relevance:.1f}%)")
                    continue
                
                print(f"[chat] Result: {title[:50]}... (relevance: {relevance:.1f}%)")
                
                # Store detailed source info with relevance
                sources_list.append({
                    "url": url,
                    "title": title,
                    "text_preview": body[:150] + "..." if len(body) > 150 else body,
                    "relevance_score": round(relevance, 1)
                })
        
        # Sort by relevance score descending
        sources_list.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        print(f"[chat] DDGS retrieved {len(sources_list)} relevant snippets (relevance >= 20%)")
        if sources_list:
            # Reconstruct snippets from sorted sources
            snippets = [s["text_preview"].replace("...", "").strip() for s in sources_list[:5]]
            combined = "\n\n".join(snippets)
            return combined, sources_list[:5], None
        
        print(f"[chat] No relevant results found from DDGS")
        return "", [], None
    except Exception as e:
        import traceback
        print(f"[chat] Web search failed with Exception: {type(e).__name__}: {e}")
        traceback.print_exc()
        return "", [], "unavailable"


# ─────────────────────────────────────────────────────────────────────────────
# Citation Injection
# ─────────────────────────────────────────────────────────────────────────────

def inject_citations(response: str, detailed_sources: List[dict]) -> str:
    """
    Intelligently inject [1], [2], etc. citations into the response text.
    
    This function matches detailed_sources to relevant parts of the response
    and injects citation markers at the end of sentences (not in the middle).
    
    Args:
        response: AI-generated response text
        detailed_sources: List of source dictionaries with text_preview, score, etc.
    
    Returns:
        Response text with [1], [2], etc. citations injected
    """
    if not detailed_sources or not response:
        return response
    
    import re
    
    # Split response keeping the whitespace separators using a capture group
    # This preserves newlines and spacing perfectly.
    parts = re.split(r'((?<=[.!?])\s+)', response.strip())
    
    # parts looks like: [sentence1, whitespace1, sentence2, whitespace2, ...]
    sentences = parts[0::2]
    separators = parts[1::2]
    
    # Map each source to its best matching sentence
    sentence_citations = {}  # {sentence_index: citation_number}
    used_sources = set()
    
    for src_idx, source in enumerate(detailed_sources[:10]):  # Limit to 10 sources
        if src_idx in used_sources:
            continue
            
        citation_num = src_idx + 1
        source_preview = source.get("text_preview", "").lower()
        
        if not source_preview or len(source_preview) < 3:
            continue
        
        # Find the sentence with best keyword overlap with this source
        best_sentence_idx = -1
        best_overlap = 0
        
        for sent_idx, sentence in enumerate(sentences):
            if sent_idx in sentence_citations:
                continue  # Already cited this sentence
            
            sentence_lower = sentence.lower()
            
            # Extract key terms (words > 3 chars) from source, excluding common words
            key_terms = [
                w for w in re.findall(r'\b\w{3,}\b', source_preview) 
                if w not in {'the', 'and', 'for', 'are', 'was', 'were', 'been', 'have', 'that', 'this', 'with', 'from', 'into', 'can', 'your', 'will', 'also'}
            ]
            
            if not key_terms:
                continue
            
            # Count how many key terms appear in the sentence
            overlap = sum(1 for term in key_terms if term in sentence_lower)
            
            # Require at least 40% of key terms to match
            match_percentage = (overlap / len(key_terms)) * 100 if key_terms else 0
            
            if match_percentage >= 40 and overlap > best_overlap:
                best_overlap = overlap
                best_sentence_idx = sent_idx
        
        # If we found a matching sentence, add citation to it
        if best_sentence_idx >= 0 and best_overlap > 0:
            sentence_citations[best_sentence_idx] = citation_num
            used_sources.add(src_idx)
    
    # Rebuild response with citations placed at the end of sentences
    cited_parts = []
    for sent_idx, sentence in enumerate(sentences):
        # Don't inject citation if the sentence looks like a markdown table row (starts/ends with |)
        is_table_row = bool(re.search(r'^\s*\|.*\|\s*$', sentence, re.MULTILINE))
        
        if sent_idx in sentence_citations and not is_table_row:
            citation_num = sentence_citations[sent_idx]
            
            if sentence and sentence[-1] in '.!?':
                sentence = sentence[:-1] + f" [{citation_num}]{sentence[-1]}"
            else:
                sentence = sentence + f" [{citation_num}]"
        
        cited_parts.append(sentence)
        if sent_idx < len(separators):
            cited_parts.append(separators[sent_idx])
            
    return ''.join(cited_parts)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/ask", response_model=dict)
async def ask_question(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ask a question as a background task."""

    # Enforce tier quotas
    enforce_quota_messages(current_user, db)
    
    # Check conversation quota if creating a new conversation
    if not request.conversation_id and request.auto_detect_conversation:
        if not check_quota_conversations(current_user, db):
            tier_config = get_user_tier_config(current_user, db)
            current = get_user_conversation_count(current_user, db)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Conversation quota exceeded. Your {current_user.tier.upper()} tier allows {tier_config.max_conversations} conversations. You have {current}."
            )

    task_id = f"chat_{current_user.id}_{int(time.time())}"
    from app.utils.tasks import TaskManager
    TaskManager.submit_task(
        task_id,
        "chat_response",
        current_user.id,
        message=request.message,
        note_id=request.note_id,
        subject_id=request.subject_id,
        group_id=request.group_id,
        ai_mode=request.ai_mode,
        output_format=request.output_format,
        conversation_id=request.conversation_id,
        auto_detect_conversation=request.auto_detect_conversation,
        reply_to_message_id=request.reply_to_message_id
    )
    
    return {"task_id": task_id, "status": "pending"}

async def ask_question_logic(**kwargs) -> dict:
    """Core logic for asking a question, moved from the endpoint for background task support."""
    from app.utils.db import SessionLocal
    db = SessionLocal()
    try:
        user_id = kwargs.get("user_id")
        message = kwargs.get("message")
        note_id = kwargs.get("note_id")
        subject_id = kwargs.get("subject_id")
        group_id = kwargs.get("group_id")
        ai_mode = kwargs.get("ai_mode", "elaborate")
        output_format = kwargs.get("output_format", "sentence")
        conversation_id = kwargs.get("conversation_id")
        auto_detect_conversation = kwargs.get("auto_detect_conversation", True)
        reply_to_message_id = kwargs.get("reply_to_message_id")

        current_user = db.query(User).filter(User.id == user_id).first()
        if not current_user:
            raise ValueError("User not found")

        t_start = time.time()
        step_times = {f"step{i}": 0.0 for i in range(1, 10)}
        target_note_ids = []
        sources = []

        # Identical logic to previous endpoint follows...
        if note_id:
            note = db.query(Note).filter(Note.id == note_id, Note.user_id == user_id).first()
            if note:
                target_note_ids = [note_id]
                sources = [note.title]

        elif subject_id:
            subject = db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == user_id).first()
            if subject:
                notes = db.query(Note).filter(Note.subject_id == subject.id).all()
                target_note_ids = [l.id for l in notes]
                sources = [l.title for l in notes]

        elif group_id:
            group = db.query(SubjectGroup).filter(SubjectGroup.id == group_id, SubjectGroup.user_id == user_id).first()
            if group:
                subjects = db.query(Subject).filter(Subject.group_id == group.id).all()
                for s in subjects:
                    notes = db.query(Note).filter(Note.subject_id == s.id).all()
                    target_note_ids.extend([l.id for l in notes])
                    sources.extend([l.title for l in notes])
        else:
            notes = db.query(Note).filter(Note.user_id == user_id).all()
            target_note_ids = [l.id for l in notes]
            sources = [l.title for l in notes]

        step_times["step1"] = round((time.time() - t_start) * 1000.0, 2)
        retrieval_ms = (time.time() - t_start) * 1000.0

        t_step2_start = time.time()
        ai_client = AIClient(current_user, db=db)
        
        conv_id = conversation_id
        conversation_context = ""
        
        if auto_detect_conversation and not conversation_id:
            recent_messages = db.query(ChatMessage).filter(
                ChatMessage.user_id == user_id,
                ChatMessage.conversation_id.isnot(None)
            ).order_by(ChatMessage.created_at.desc()).limit(1).all()
            
            if recent_messages:
                last_msg = recent_messages[0]
                try:
                    is_continuation = await is_conversation_continuation(
                        client=ai_client,
                        current_question=message,
                        last_question=last_msg.message,
                        last_answer=last_msg.response
                    )
                    
                    if is_continuation:
                        conv_id = last_msg.conversation_id
                        earlier_messages = db.query(ChatMessage).filter(
                            ChatMessage.conversation_id == conv_id,
                            ChatMessage.user_id == user_id
                        ).order_by(ChatMessage.created_at.desc()).limit(2).all()
                        
                        if earlier_messages:
                            conversation_context = build_conversation_context(earlier_messages)
                    else:
                        conv_id = generate_conversation_id(db)
                except Exception:
                    conv_id = generate_conversation_id(db)
        
        if not conv_id:
            conv_id = generate_conversation_id(db)
        
        step_times["step2"] = round((time.time() - t_step2_start) * 1000.0, 2)
        t_step3_start = time.time()
        
        intent = await classify_query(ai_client, message)
        step_times["step3"] = round((time.time() - t_step3_start) * 1000.0, 2)

        context = ""
        snippet_sources = []
        detailed_sources = []

        if intent == "CONVERSATIONAL":
            context = "User is just making conversation."
            prompt = f"Friendly study assistant. Response warm. Question: {message}"
        elif intent == "OFF_TOPIC":
            context = "User asking off-topic."
            prompt = "Decline politely."
        else:
            t_step4_start = time.time()
            if target_note_ids:
                try:
                    from app.processing.embeddings import retrieve_relevant_chunks, combine_snippets
                    raw_chunks = retrieve_relevant_chunks(query=message, note_ids=target_note_ids, db=db, top_k=5)
                    # Filter for confident chunks (score >= 15.0)
                    chunks = [c for c in raw_chunks if c["score"] >= 15.0]
                    
                    if chunks:
                        snippets = [{"text": chunk["text"], "position": chunk["position"], "score": chunk["score"]} for chunk in chunks]
                        context = combine_snippets(snippets, max_chars=3000)
                        for chunk in chunks:
                            detailed_sources.append({
                                "text_preview": chunk["text"][:150],
                                "position": chunk["position"],
                                "score": chunk["score"],
                                "note_id": chunk["note_id"]
                            })
                        snippet_sources = list(set(sources))[:2]
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).error(f"Error retrieving chunks: {e}")
            
            step_times["step4"] = round((time.time() - t_step4_start) * 1000.0, 2)

            t_step5_start = time.time()
            # Only fallback to web search if we truly have no context or very little context AND no chunks found
            if not context or (len(context) < 50 and len(detailed_sources) == 0):
                web_snippet, web_sources, web_error = await web_search(message, timeout=10.0)
                if web_snippet:
                    context = web_snippet
                    snippet_sources = [s["url"] for s in web_sources if s.get("url")] or ["Web Search"]
                    detailed_sources = [{"text_preview": s["text_preview"], "is_web": True, "url": s["url"]} for s in web_sources]
                    
            step_times["step5"] = round((time.time() - t_step5_start) * 1000.0, 2)

            t_step6_start = time.time()
            prompt = build_mode_prompt(context or "No info", message, ai_mode, output_format, conversation_context=conversation_context)
            step_times["step6"] = round((time.time() - t_step6_start) * 1000.0, 2)
        
        t_model_start = time.time()
        t_step7_start = time.time()

        ai_model_info = f"{ai_client.provider.upper()}"
        if ai_client.ai_model_name:
            ai_model_info += f" ({ai_client.ai_model_name})"

        response = await ai_client.answer_question(question=message, context=context, system_prompt=prompt)
        model_ms = (time.time() - t_model_start) * 1000.0
        step_times["step7"] = round((time.time() - t_step7_start) * 1000.0, 2)

        t_step8_start = time.time()
        if detailed_sources:
            response = inject_citations(response, detailed_sources)
        step_times["step8"] = round((time.time() - t_step8_start) * 1000.0, 2)

        t_step9_start = time.time()
        conv_title = generate_conversation_title(message)
        step_times["step9"] = round((time.time() - t_step9_start) * 1000.0, 2)
        total_ms = (time.time() - t_start) * 1000.0

        timings_dict = {"retrieval_ms": round(retrieval_ms, 2), "model_ms": round(model_ms, 2), "total_ms": round(total_ms, 2), "step_times": step_times}
        
        chat_msg = ChatMessage(
            id=generate_random_id(db, ChatMessage), user_id=user_id, note_id=note_id, subject_id=subject_id, group_id=group_id,
            message=message, response=response, sources=json.dumps(snippet_sources), conversation_id=conv_id, conversation_title=conv_title,
            ai_mode=ai_mode, output_format=output_format, ai_model=ai_model_info, reply_to_message_id=reply_to_message_id,
            detailed_sources_json=json.dumps(detailed_sources) if detailed_sources else None, timings_json=json.dumps(timings_dict),
        )
        db.add(chat_msg)
        db.commit()

        return {
            "message": message, "response": response, "sources": snippet_sources, "ai_mode": ai_mode, "output_format": output_format,
            "ai_model": ai_model_info, "detailed_sources": detailed_sources, "conversation_id": conv_id, "conversation_title": conv_title,
            "timings": timings_dict
        }
    finally:
        db.close()


@router.get("/conversations", response_model=List[ConversationSummary])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all conversations (grouped by conversation_id) for the current user."""
    rows = (
        db.query(
            ChatMessage.conversation_id,
            func.max(ChatMessage.conversation_title).label("title"),
            func.count(ChatMessage.id).label("message_count"),
            func.max(ChatMessage.created_at).label("last_message_at"),
            func.max(ChatMessage.note_id).label("note_id"),
            func.max(ChatMessage.subject_id).label("subject_id"),
            func.max(ChatMessage.group_id).label("group_id"),
            func.max(cast(ChatMessage.is_pinned, Integer)).label("is_pinned"),
            func.max(cast(ChatMessage.is_favourite, Integer)).label("is_favourite"),
        )
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.conversation_id.isnot(None),
        )
        .group_by(ChatMessage.conversation_id)
        .order_by(
            func.max(cast(ChatMessage.is_pinned, Integer)).desc(),
            func.max(ChatMessage.created_at).desc()
        )
        .all()
    )

    result = []
    for row in rows:
        scope_type = "note" if row.note_id else ("subject" if row.subject_id else ("group" if row.group_id else None))
        result.append(ConversationSummary(
            conversation_id=row.conversation_id,
            title=row.title or "Untitled Conversation",
            message_count=row.message_count,
            last_message_at=row.last_message_at.isoformat(),
            note_id=row.note_id,
            subject_id=row.subject_id,
            group_id=row.group_id,
            scope_type=scope_type,
            is_pinned=bool(row.is_pinned),
            is_favourite=bool(row.is_favourite),
        ))

    return result


@router.get("/conversations/{conversation_id}/messages", response_model=List[ChatMessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all messages in a specific conversation, ordered chronologically."""
    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.conversation_id == conversation_id,
        )
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    if not messages:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return [
        ChatMessageResponse(
            id=m.id,
            message=m.message,
            response=m.response,
            sources=json.loads(m.sources) if m.sources else [],
            detailed_sources=json.loads(m.detailed_sources_json) if m.detailed_sources_json else [],
            created_at=m.created_at.isoformat(),
            note_id=m.note_id,
            subject_id=m.subject_id,
            group_id=m.group_id,
            ai_mode=m.ai_mode,
            ai_model=m.ai_model,
            conversation_id=m.conversation_id,
            conversation_title=m.conversation_title,
            reply_to_message_id=m.reply_to_message_id,
            output_format=m.output_format,
            timings=json.loads(m.timings_json) if m.timings_json else None,
        )
        for m in messages
    ]


@router.get("/history", response_model=List[ChatMessageResponse])
async def get_all_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all chat history for current user (individual messages)."""
    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id
    ).order_by(ChatMessage.created_at.desc()).all()

    return [
        ChatMessageResponse(
            id=m.id,
            message=m.message,
            response=m.response,
            sources=json.loads(m.sources) if m.sources else [],
            detailed_sources=json.loads(m.detailed_sources_json) if m.detailed_sources_json else [],
            created_at=m.created_at.isoformat(),
            note_id=m.note_id,
            subject_id=m.subject_id,
            group_id=m.group_id,
            ai_mode=m.ai_mode,
            ai_model=m.ai_model,
            conversation_id=m.conversation_id,
            conversation_title=m.conversation_title,
            reply_to_message_id=m.reply_to_message_id,
            output_format=m.output_format,
            timings=json.loads(m.timings_json) if m.timings_json else None,
        )
        for m in messages
    ]


@router.get("/history/{note_id}", response_model=List[ChatMessageResponse])
async def get_note_chat_history(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get chat history for a specific note."""
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.note_id == note_id
    ).order_by(ChatMessage.created_at.desc()).all()

    return [
        ChatMessageResponse(
            id=m.id,
            message=m.message,
            response=m.response,
            sources=json.loads(m.sources) if m.sources else [],
            detailed_sources=json.loads(m.detailed_sources_json) if m.detailed_sources_json else [],
            created_at=m.created_at.isoformat(),
            note_id=m.note_id,
            subject_id=m.subject_id,
            group_id=m.group_id,
            ai_mode=m.ai_mode,
            reply_to_message_id=m.reply_to_message_id,
            output_format=m.output_format,
            timings=json.loads(m.timings_json) if m.timings_json else None,
        )
        for m in messages
    ]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an entire conversation."""
    db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id,
        ChatMessage.user_id == current_user.id
    ).delete()
    db.commit()


@router.put("/conversations/{conversation_id}/pin")
async def toggle_pin_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle the pinned state of a conversation."""
    messages = db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id,
        ChatMessage.user_id == current_user.id
    ).all()
    if not messages:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    new_state = not messages[0].is_pinned
    for msg in messages:
        msg.is_pinned = new_state
    db.commit()
    return {"is_pinned": new_state}


@router.put("/conversations/{conversation_id}/favourite")
async def toggle_favourite_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle the favourite state of a conversation."""
    messages = db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id,
        ChatMessage.user_id == current_user.id
    ).all()
    if not messages:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    new_state = not messages[0].is_favourite
    for msg in messages:
        msg.is_favourite = new_state
    db.commit()
    return {"is_favourite": new_state}


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a specific chat message."""
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.user_id == current_user.id
    ).first()

    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    db.delete(message)
    db.commit()
