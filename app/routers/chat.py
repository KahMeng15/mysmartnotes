"""Chat/Q&A endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import json

from app.models.db import User, Lecture, ChatMessage
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.processing.ai_client import AIClient

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    lecture_id: int
    message: str


class ChatMessageResponse(BaseModel):
    id: int
    message: str
    response: str
    sources: list = []
    created_at: str


class ChatResponse(BaseModel):
    message: str
    response: str
    sources: list = []


@router.post("/ask", response_model=ChatResponse)
async def ask_question(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ask a question about a lecture"""
    
    # Verify lecture belongs to user
    lecture = db.query(Lecture).filter(
        Lecture.id == request.lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    # TODO: Get extracted text and embeddings from lecture
    # TODO: Use semantic search to find relevant content
    lecture_content = lecture.extracted_text or ""
    
    # Generate response using AI
    ai_client = AIClient()
    
    try:
        response = ai_client.generate_response(
            query=request.message,
            context=lecture_content,
            model="gemini" if lecture.user_id % 2 == 0 else "huggingface"
        )
        
        sources = [lecture.title]
        
        # Save to history
        chat_msg = ChatMessage(
            user_id=current_user.id,
            lecture_id=request.lecture_id,
            message=request.message,
            response=response,
            sources=json.dumps(sources)
        )
        db.add(chat_msg)
        db.commit()
        
        return ChatResponse(
            message=request.message,
            response=response,
            sources=sources
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating response: {str(e)}"
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
            created_at=m.created_at.isoformat()
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
            created_at=m.created_at.isoformat()
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

