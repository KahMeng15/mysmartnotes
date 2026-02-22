"""Chat/Q&A endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import time
from typing import List, Optional
import json
import asyncio
import httpx

from app.models.db import User, Lecture, ChatMessage, Subject, SubjectGroup
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.processing.ai_client import AIClient
from app.processing.embeddings import find_relevant_snippets, combine_snippets

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    lecture_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    message: str


class ChatMessageResponse(BaseModel):
    id: int
    message: str
    response: str
    sources: list = []
    created_at: str
    lecture_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None


class ChatResponse(BaseModel):
    message: str
    response: str
    sources: list = []
    timings: Optional[dict] = None
    ai_model: Optional[str] = None  # AI model/provider used
    detailed_sources: Optional[list] = []  # Detailed source references with positions


# Helper: Web search fallback
async def web_search(query: str, timeout: float = 2.5) -> tuple:
    """
    Quick web search using DuckDuckGo instant answer API.
    Returns: (snippets_text, source_title)
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            params = {"q": query, "format": "json", "no_html": 1, "skip_disambig": 1}
            resp = await client.get("https://api.duckduckgo.com/", params=params)
            if resp.status_code != 200:
                return "", ""
            
            data = resp.json()
            snippets = []
            
            # Instant answer (highest confidence)
            abstract = data.get("AbstractText", "").strip()
            if abstract:
                snippets.append(abstract)
            
            # Related topics
            for topic in data.get("RelatedTopics", [])[:2]:
                if isinstance(topic, dict):
                    text = topic.get("Text", "").strip()
                    if text:
                        snippets.append(text)
            
            if snippets:
                combined = "\n\n".join(snippets[:300])  # Limit to ~300 chars per snippet
                source = data.get("Heading", "Web Search")
                return combined, source
            
            return "", ""
    
    except Exception as e:
        print(f"[chat] Web search failed: {e}")
        return "", ""


# Helper: Strict anti-hallucination prompt
def build_strict_prompt(context: str, question: str) -> str:
    """
    Build a prompt that enforces answering from context only.
    """
    # For simple greetings, don't use the strict "I don't know" prompt
    if question.strip().lower() in ["hi", "hello", "how are you", "how are you?"]:
        return f"You are a friendly assistant. Respond to the user's greeting: '{question}'"

    return f"""You are a helpful assistant. Answer the user's question ONLY using the provided context.

If the answer is not found in the context, respond with exactly: "I don't know."

Do NOT make up facts or invent information.
Do NOT hallucinate.

Context:
{context}

Question: {question}

Answer:"""


@router.post("/ask", response_model=ChatResponse)
async def ask_question(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ask a question using retrieval-first QnA with web search fallback."""
    
    if not any([request.lecture_id, request.subject_id, request.group_id]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide lecture_id, subject_id, or group_id"
        )
         
    t_start = time.time()
    all_content = ""
    sources = []
    
    # STEP 1: Retrieve content from notes
    if request.lecture_id:
        lecture = db.query(Lecture).filter(
            Lecture.id == request.lecture_id,
            Lecture.user_id == current_user.id
        ).first()
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
        all_content = lecture.extracted_text or ""
        sources.append(lecture.title)
        
    elif request.subject_id:
        subject = db.query(Subject).filter(
            Subject.id == request.subject_id,
            Subject.user_id == current_user.id
        ).first()
        if not subject:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        lectures = db.query(Lecture).filter(Lecture.subject_id == subject.id).all()
        for l in lectures:
            if l.extracted_text:
                all_content += f"\n--- Note: {l.title} ---\n{l.extracted_text}"
                sources.append(l.title)

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
            for l in lectures:
                if l.extracted_text:
                    all_content += f"\n--- Subject: {s.name}, Note: {l.title} ---\n{l.extracted_text}"
                    sources.append(l.title)
    
    retrieval_ms = (time.time() - t_start) * 1000.0
    
    # STEP 2: Semantic search for relevant snippets
    context = ""
    snippet_sources = []
    detailed_sources = []  # Store detailed source info with positions
    
    if all_content:
        try:
            from app.processing.embeddings import find_relevant_snippets, combine_snippets
            snippets = find_relevant_snippets(
                query=request.message,
                text=all_content,
                top_k=3
            )
            context = combine_snippets(snippets, max_chars=2000)
            
            # Build detailed sources with positions and scores
            for snippet in snippets:
                source_info = {
                    'text_preview': snippet['text'][:100] + '...' if len(snippet['text']) > 100 else snippet['text'],
                    'position': snippet['position'],
                    'score': snippet['score'],
                    'lecture_id': request.lecture_id if request.lecture_id else None
                }
                # Try to identify which lecture this snippet is from
                if not request.lecture_id and sources:
                    source_info['source_name'] = sources[0] if sources else 'Unknown'
                detailed_sources.append(source_info)
            
            # Use top sources
            snippet_sources = sources[:2] if sources else []
        except Exception as e:
            print(f"[chat] Semantic search failed, falling back to direct context: {e}")
            context = all_content[:2000]  # Fallback to first 2000 chars
            snippet_sources = sources
    
    # STEP 3: Web search fallback if no local context
    web_snippet = ""
    if not context or len(context) < 100:
        print(f"[chat] No sufficient local context ({len(context)} chars), trying web search...")
        web_snippet, web_source = await web_search(request.message, timeout=2.5)
        if web_snippet:
            context = web_snippet
            snippet_sources = [f"Web: {web_source}"]
    
    # STEP 4: Build final context and prompt
    if not context:
        context = "No information available."
    
    prompt = build_strict_prompt(context, request.message)
    
    # STEP 5: Call LLM with strict prompting and timeout
    ai_client = AIClient(current_user)
    t_model_start = time.time()
    
    # Get AI model info
    ai_model_info = f"{ai_client.provider.upper()}"
    if ai_client.ai_model_name:
        ai_model_info += f" ({ai_client.ai_model_name})"
    
    try:
        # Enforce 4.5s timeout on model call
        response = await asyncio.wait_for(
            ai_client.answer_question(
                question=request.message,
                context=context,
                system_prompt=prompt
            ),
            timeout=4.5
        )
    except asyncio.TimeoutError:
        response = "I'm thinking... this is taking longer than expected. Could you try rephrasing your question or ask something more specific?"
    except Exception as e:
        print(f"[chat] LLM call failed: {e}")
        response = f"I encountered an error: {str(e)[:100]}"
    
    model_ms = (time.time() - t_model_start) * 1000.0
    total_ms = (time.time() - t_start) * 1000.0
    
    # STEP 6: Save to chat history
    try:
        chat_msg = ChatMessage(
            user_id=current_user.id,
            lecture_id=request.lecture_id,
            subject_id=request.subject_id,
            group_id=request.group_id,
            message=request.message,
            response=response,
            sources=json.dumps(snippet_sources)
        )
        db.add(chat_msg)
        db.commit()
    except Exception as e:
        print(f"[chat] Failed to save to history: {e}")
    
    return ChatResponse(
        message=request.message,
        response=response,
        sources=snippet_sources,
        ai_model=ai_model_info,
        detailed_sources=detailed_sources,
        timings={
            "retrieval_ms": round(retrieval_ms, 2),
            "model_ms": round(model_ms, 2),
            "total_ms": round(total_ms, 2)
        }
    )


@router.get("/history", response_model=List[ChatMessageResponse])
async def get_all_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all chat history for current user"""
    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id
    ).order_by(ChatMessage.created_at.desc()).all()
    
    return [
        ChatMessageResponse(
            id=m.id,
            message=m.message,
            response=m.response,
            sources=json.loads(m.sources) if m.sources else [],
            created_at=m.created_at.isoformat(),
            lecture_id=m.lecture_id,
            subject_id=m.subject_id,
            group_id=m.group_id
        )
        for m in messages
    ]


@router.get("/history/{lecture_id}", response_model=List[ChatMessageResponse])
async def get_lecture_chat_history(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get chat history for a specific lecture"""
    # Verify lecture belongs to user
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
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
            created_at=m.created_at.isoformat(),
            lecture_id=m.lecture_id,
            subject_id=m.subject_id,
            group_id=m.group_id
        )
        for m in messages
    ]


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a specific chat message"""
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.user_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    db.delete(message)
    db.commit()

