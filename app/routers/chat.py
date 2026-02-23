"""Chat/Q&A endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import time
from typing import List, Optional
import json
import asyncio

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
    
    # STEP 2: Retrieve relevant chunks from pre-computed embeddings
    context = ""
    snippet_sources = []
    detailed_sources = []
    
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
                # Convert chunks to snippet format for combine_snippets
                snippets = [
                    {
                        'text': chunk['text'],
                        'position': chunk['position'],
                        'score': chunk['score']
                    }
                    for chunk in chunks
                ]
                context = combine_snippets(snippets, max_chars=2000)
                
                # Build detailed sources
                for chunk in chunks:
                    source_info = {
                        'text_preview': chunk['text'][:100] + '...' if len(chunk['text']) > 100 else chunk['text'],
                        'position': chunk['position'],
                        'score': chunk['score'],
                        'lecture_id': chunk['lecture_id']
                    }
                    detailed_sources.append(source_info)
                
                # Get unique source names
                snippet_sources = list(set(sources))[:2] if sources else []
            
            retrieval_ms = (time.time() - t_start) * 1000.0
        except Exception as e:
            print(f"[chat] Vector retrieval failed: {e}")
            # Fallback: get raw text and use old method
            retrieval_ms = (time.time() - t_start) * 1000.0
    
    # STEP 3: Web search fallback if no local context
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

