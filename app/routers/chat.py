"""Chat/Q&A endpoints with conversation threading and AI response modes"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
import time
from typing import List, Optional
import json
import asyncio
import uuid

from app.models.db import User, Lecture, ChatMessage, Subject, SubjectGroup
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.processing.ai_client import AIClient
from app.processing.embeddings import find_relevant_snippets, combine_snippets

router = APIRouter(prefix="/chat", tags=["chat"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    lecture_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    message: str
    ai_mode: str = "elaborate"
    output_format: str = "sentence"
    conversation_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: int
    message: str
    response: str
    sources: list = []
    detailed_sources: list = []
    created_at: str
    lecture_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    ai_mode: Optional[str] = None
    output_format: Optional[str] = None
    ai_model: Optional[str] = None
    conversation_id: Optional[str] = None
    conversation_title: Optional[str] = None
    timings: Optional[dict] = None
    timings: Optional[dict] = None


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    message_count: int
    last_message_at: str
    lecture_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    scope_type: Optional[str] = None
    is_pinned: bool = False
    is_favourite: bool = False


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


# ─────────────────────────────────────────────────────────────────────────────
# AI Mode Definitions and Prompt Builder
# ─────────────────────────────────────────────────────────────────────────────

AI_MODES = {
    "quick":       {"label": "Quick",      "icon": "ph-lightning",         "description": "Use less processing to get answer"},
    "simple":      {"label": "Simple",     "icon": "ph-text-a-underline",  "description": "Answer in simple terms"},
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
    "Answer ONLY using the provided context. "
    "If the answer is NOT found in the context, respond with exactly: \"I don't know.\" "
    "Do NOT make up facts or invent information."
)


def build_mode_prompt(context: str, question: str, mode: str, output_format: str = "sentence", is_web_search: bool = False) -> str:
    """Return the full system prompt based on AI mode and output format."""
    if question.strip().lower() in {"hi", "hello", "how are you", "how are you?"}:
        return f"You are a friendly assistant. Respond warmly to: '{question}'"

    # Base mode instructions
    mode_instructions = {
        "quick": "You are a concise assistant providing brief, focused answers using only the provided context.",
        "simple": "You are a clear communicator who makes complex ideas easy to understand using plain, everyday language. Avoid technical jargon.",
        "elaborate": "You are a knowledgeable and helpful assistant providing thorough, clear, and well-structured explanations.",
        "eli5": "You are a patient, friendly teacher explaining to a 5-year-old child using very simple words, short sentences, and relatable everyday analogies.",
    }

    # Output format instructions
    output_instructions = {
        "sentence": "Respond as a single paragraph or a few flowing sentences.",
        "pointform": "Format your answer as a bullet-pointed list (using - or •). Each point should be clear and concise.",
        "numbered_list": "Format your answer as a numbered list (1. 2. 3. etc.) with clear, well-organized points.",
        "table": "Format your answer as a markdown table. Use this structure:\n| Column 1 | Column 2 |\n|----------|----------|\n| data     | data     |\n\nCreate logical column headers based on the question content.",
    }

    mode_inst = mode_instructions.get(mode, mode_instructions["elaborate"])
    output_inst = output_instructions.get(output_format, output_instructions["sentence"])

    guard = _BASE_GUARD
    if is_web_search:
        guard = (
            "You are answering using snippets obtained from a web search. "
            "Ignore any irrelevant information in the snippets. "
            "If the answer is NOT found in the snippets, respond with exactly: \"I don't know.\" "
            "Do NOT make up facts or invent information."
        )

    prompt = f"""{mode_inst}
{guard}

{output_inst}

Do NOT include introductory phrases like "Here's what...", "Based on the information provided:", "Let me explain:", or similar. Answer directly and get straight to the point.

Context:
{context}

Question: {question}

Answer:"""

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
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/ask", response_model=ChatResponse)
async def ask_question(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ask a question using retrieval-first QnA with AI mode support and conversation threading."""

    if not any([request.lecture_id, request.subject_id, request.group_id]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide lecture_id, subject_id, or group_id"
        )

    t_start = time.time()
    lecture_ids = []
    sources = []

    # STEP 1: Identify which lectures to search
    if request.lecture_id:
        lecture = db.query(Lecture).filter(
            Lecture.id == request.lecture_id,
            Lecture.user_id == current_user.id
        ).first()
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
        lecture_ids = [request.lecture_id]
        sources = [lecture.title]

    elif request.subject_id:
        subject = db.query(Subject).filter(
            Subject.id == request.subject_id,
            Subject.user_id == current_user.id
        ).first()
        if not subject:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        lectures = db.query(Lecture).filter(Lecture.subject_id == subject.id).all()
        lecture_ids = [l.id for l in lectures]
        sources = [l.title for l in lectures]

    elif request.group_id:
        group = db.query(SubjectGroup).filter(
            SubjectGroup.id == request.group_id,
            SubjectGroup.user_id == current_user.id
        ).first()
        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        subjects = db.query(Subject).filter(Subject.group_id == group.id).all()
        for s in subjects:
            lectures = db.query(Lecture).filter(Lecture.subject_id == s.id).all()
            lecture_ids.extend([l.id for l in lectures])
            sources.extend([l.title for l in lectures])

    retrieval_ms = (time.time() - t_start) * 1000.0

    # Initialize AI client early for classification
    ai_client = AIClient(current_user)
    
    # STEP 2: Classify Query Intent
    intent = await classify_query(ai_client, request.message)

    context = ""
    snippet_sources = []
    detailed_sources = []

    if intent == "CONVERSATIONAL":
        # Skip retrieval completely for conversational queries
        context = "User is just making conversation. Provide a friendly, brief response."
        prompt = "You are a friendly study assistant. Provide a brief, warm response to the user's conversational message. Do not provide facts or knowledge."
    elif intent == "OFF_TOPIC":
        # Skip retrieval completely for off-topic queries
        context = "User is asking an off-topic question."
        prompt = "You are an AI study assistant. The user's query is off-topic. Politely decline to answer, stating that you can only answer questions related to their notes or general educational topics, and cannot look up the answer to their off-topic query."
    else:
        # STEP 3: Retrieve relevant chunks from pre-computed embeddings (INFORMATIONAL)
        if lecture_ids:
            try:
                from app.processing.embeddings import retrieve_relevant_chunks, combine_snippets
                chunks = retrieve_relevant_chunks(
                    query=request.message,
                    lecture_ids=lecture_ids,
                    db=db,
                    top_k=3
                )
                if chunks:
                    snippets = [
                        {"text": chunk["text"], "position": chunk["position"], "score": chunk["score"]}
                        for chunk in chunks
                    ]
                    context = combine_snippets(snippets, max_chars=2000)
                    for chunk in chunks:
                        detailed_sources.append({
                            "text_preview": chunk["text"][:100] + "..." if len(chunk["text"]) > 100 else chunk["text"],
                            "position": chunk["position"],
                            "score": chunk["score"],
                            "lecture_id": chunk["lecture_id"]
                        })
                    snippet_sources = list(set(sources))[:2] if sources else []
                retrieval_ms = (time.time() - t_start) * 1000.0
            except Exception as e:
                print(f"[chat] Vector retrieval failed: {e}")
                retrieval_ms = (time.time() - t_start) * 1000.0

        # STEP 4: Web search fallback if no local context
        if not context or len(context) < 100:
            print(f"[chat] No sufficient local context ({len(context)} chars), trying web search...")
            web_snippet, web_sources, web_error = await web_search(request.message, timeout=10.0)
            if web_error == "timeout":
                context = "[DDG is slow but searching... please wait]"
                snippet_sources = ["Web: DuckDuckGo (searching)"]
            elif web_error == "unavailable":
                context = "[DuckDuckGo is unavailable]"
                snippet_sources = ["Web Search: Unavailable"]
            elif web_snippet:
                context = web_snippet
                snippet_sources = [s["url"] for s in web_sources if s.get("url")] or ["Web Search"]
                detailed_sources = [
                    {
                        "text_preview": s["text_preview"],
                        "position": 0,
                        "score": s["relevance_score"],
                        "lecture_id": 0,
                        "is_web": True,
                        "url": s["url"],
                        "title": s["title"]
                    }
                    for s in web_sources
                ]
                
        # STEP 5: Build mode-specific prompt for informational queries
        if not context:
            context = "No information available."
        prompt = build_mode_prompt(context, request.message, request.ai_mode, request.output_format)
    
    # STEP 6: Call LLM
    t_model_start = time.time()

    ai_model_info = f"{ai_client.provider.upper()}"
    if ai_client.ai_model_name:
        ai_model_info += f" ({ai_client.ai_model_name})"

    try:
        response = await asyncio.wait_for(
            ai_client.answer_question(
                question=request.message,
                context=context,
                system_prompt=prompt
            ),
            timeout=4.5
        )
        
        # Checking if local context didn't have the answer
        if response.strip().lower() in ["i don't know", "i don't know.", '"i don\'t know."']:
            print(f"[chat] LLM responded 'I don't know' using local context. Trying web search...")
            web_snippet, web_sources, web_error = await web_search(request.message, timeout=10.0)
            print(f"[chat] web_snippet fetched length: {len(web_snippet)}, error: {web_error}")
            if web_error == "timeout":
                response = "DuckDuckGo is taking a while to search... Could you try rephrasing your question or check your internet connection?"
                snippet_sources = ["Web: DuckDuckGo (timeout)"]
            elif web_error == "unavailable":
                response = "DuckDuckGo is currently unavailable. I wasn't able to find information about this in your notes. Please try again later."
                snippet_sources = ["Web Search: Unavailable"]
            elif web_snippet:
                # Override context and prompt for web search retry
                context = web_snippet
                snippet_sources = [s["url"] for s in web_sources if s.get("url")] or ["Web Search"]
                detailed_sources = [
                    {
                        "text_preview": s["text_preview"],
                        "position": 0,
                        "score": s["relevance_score"],
                        "lecture_id": 0,
                        "is_web": True,
                        "url": s["url"],
                        "title": s["title"]
                    }
                    for s in web_sources
                ]
                prompt = build_mode_prompt(context, request.message, request.ai_mode, request.output_format, is_web_search=True)
                
                # Ask LLM again with web snippet as context
                response = await asyncio.wait_for(
                    ai_client.answer_question(
                        question=request.message,
                        context=context,
                        system_prompt=prompt
                    ),
                    timeout=8.0
                )
                print(f"[chat] LLM 2nd response: {response}")

    except asyncio.TimeoutError:
        response = "I'm thinking… this is taking longer than expected. Could you try rephrasing your question?"
    except Exception as e:
        print(f"[chat] LLM call failed: {e}")
        response = f"I encountered an error: {str(e)[:100]}"

    model_ms = (time.time() - t_model_start) * 1000.0
    total_ms = (time.time() - t_start) * 1000.0

    # STEP 6: Resolve conversation identity and title
    conv_id = request.conversation_id or str(uuid.uuid4())

    existing_count = db.query(func.count(ChatMessage.id)).filter(
        ChatMessage.conversation_id == conv_id,
        ChatMessage.user_id == current_user.id
    ).scalar() or 0

    if existing_count == 0:
        conv_title = generate_conversation_title(request.message)
    else:
        existing_title = db.query(ChatMessage.conversation_title).filter(
            ChatMessage.conversation_id == conv_id,
            ChatMessage.user_id == current_user.id,
            ChatMessage.conversation_title.isnot(None)
        ).first()
        conv_title = existing_title[0] if existing_title else generate_conversation_title(request.message)

    # STEP 7: Save to chat history
    try:
        # Prepare timings dict for storage
        timings_dict = {
            "retrieval_ms": round(retrieval_ms, 2),
            "model_ms": round(model_ms, 2),
            "total_ms": round(total_ms, 2),
        }
        
        chat_msg = ChatMessage(
            user_id=current_user.id,
            lecture_id=request.lecture_id,
            subject_id=request.subject_id,
            group_id=request.group_id,
            message=request.message,
            response=response,
            sources=json.dumps(snippet_sources),
            conversation_id=conv_id,
            conversation_title=conv_title,
            ai_mode=request.ai_mode,
            output_format=request.output_format,
            ai_model=ai_model_info,
            detailed_sources_json=json.dumps(detailed_sources) if detailed_sources else None,
            timings_json=json.dumps(timings_dict),
        )
        db.add(chat_msg)
        db.commit()
        db.refresh(chat_msg)  # Refresh to get the ID
    except Exception as e:
        db.rollback()
        print(f"[chat] Failed to save to history: {e}")
        import traceback
        traceback.print_exc()

    return ChatResponse(
        message=request.message,
        response=response,
        sources=snippet_sources,
        ai_mode=request.ai_mode,
        output_format=request.output_format,
        ai_model=ai_model_info,
        detailed_sources=detailed_sources,
        conversation_id=conv_id,
        conversation_title=conv_title,
        timings={
            "retrieval_ms": round(retrieval_ms, 2),
            "model_ms": round(model_ms, 2),
            "total_ms": round(total_ms, 2)
        }
    )


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
            func.max(ChatMessage.lecture_id).label("lecture_id"),
            func.max(ChatMessage.subject_id).label("subject_id"),
            func.max(ChatMessage.group_id).label("group_id"),
            func.max(ChatMessage.is_pinned).label("is_pinned"),
            func.max(ChatMessage.is_favourite).label("is_favourite"),
        )
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.conversation_id.isnot(None),
        )
        .group_by(ChatMessage.conversation_id)
        .order_by(
            func.max(ChatMessage.is_pinned).desc(),
            func.max(ChatMessage.created_at).desc()
        )
        .all()
    )

    result = []
    for row in rows:
        scope_type = "note" if row.lecture_id else ("subject" if row.subject_id else ("group" if row.group_id else None))
        result.append(ConversationSummary(
            conversation_id=row.conversation_id,
            title=row.title or "Untitled Conversation",
            message_count=row.message_count,
            last_message_at=row.last_message_at.isoformat(),
            lecture_id=row.lecture_id,
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
            lecture_id=m.lecture_id,
            subject_id=m.subject_id,
            group_id=m.group_id,
            ai_mode=m.ai_mode,
            ai_model=m.ai_model,
            conversation_id=m.conversation_id,
            conversation_title=m.conversation_title,
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
            lecture_id=m.lecture_id,
            subject_id=m.subject_id,
            group_id=m.group_id,
            ai_mode=m.ai_mode,
            ai_model=m.ai_model,
            conversation_id=m.conversation_id,
            conversation_title=m.conversation_title,
            output_format=m.output_format,
            timings=json.loads(m.timings_json) if m.timings_json else None,
        )
        for m in messages
    ]


@router.get("/history/{lecture_id}", response_model=List[ChatMessageResponse])
async def get_lecture_chat_history(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get chat history for a specific lecture."""
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()

    if not lecture:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecture not found")

    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.lecture_id == lecture_id
    ).order_by(ChatMessage.created_at.desc()).all()

    return [
        ChatMessageResponse(
            id=m.id,
            message=m.message,
            response=m.response,
            sources=json.loads(m.sources) if m.sources else [],
            detailed_sources=json.loads(m.detailed_sources_json) if m.detailed_sources_json else [],
            created_at=m.created_at.isoformat(),
            lecture_id=m.lecture_id,
            subject_id=m.subject_id,
            group_id=m.group_id,
            ai_mode=m.ai_mode,
            ai_model=m.ai_model,
            conversation_id=m.conversation_id,
            conversation_title=m.conversation_title,
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
    message_id: int,
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
