"""Document generation endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from app.models.db import User, Lecture, GeneratedDocument, Flashcard
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.processing.ai_client import AIClient
from datetime import datetime

router = APIRouter(prefix="/documents", tags=["documents"])


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    difficulty: str


class QuizResponse(BaseModel):
    lecture_id: int
    questions: List[QuizQuestion]
    total_questions: int


class FlashcardRequest(BaseModel):
    lecture_id: int
    quantity: int = 10


class FlashcardGeneratedResponse(BaseModel):
    lecture_id: int
    count: int
    message: str


class CheatsheetRequest(BaseModel):
    lecture_id: int
    format: str = "markdown"  # markdown or html


class CheatsheetResponse(BaseModel):
    lecture_id: int
    title: str
    content: str


class DocumentResponse(BaseModel):
    id: int
    lecture_id: int
    title: str
    document_type: str
    file_path: str
    created_at: str


@router.post("/quiz", response_model=QuizResponse)
async def generate_quiz(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate quiz questions from a lecture"""
    
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
    
    lecture_content = lecture.extracted_text or ""
    if not lecture_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lecture content not available yet. Please wait for processing."
        )
    
    # Generate quiz using AI
    ai_client = AIClient()
    
    try:
        questions = ai_client.generate_quiz(
            content=lecture_content,
            num_questions=10
        )
        
        return QuizResponse(
            lecture_id=lecture_id,
            questions=questions,
            total_questions=len(questions)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating quiz: {str(e)}"
        )


@router.post("/flashcards", response_model=FlashcardGeneratedResponse)
async def generate_flashcards(
    request: FlashcardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Auto-generate flashcards from lecture content"""
    
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
    
    lecture_content = lecture.extracted_text or ""
    if not lecture_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lecture content not available yet. Please wait for processing."
        )
    
    # Generate flashcards using AI
    ai_client = AIClient()
    
    try:
        flashcard_data = ai_client.generate_flashcards(
            content=lecture_content,
            num_flashcards=request.quantity
        )
        
        # Save flashcards to database
        saved_count = 0
        for data in flashcard_data:
            flashcard = Flashcard(
                lecture_id=request.lecture_id,
                question=data.get("question", ""),
                answer=data.get("answer", ""),
                difficulty=data.get("difficulty", "medium"),
                times_reviewed=0,
                times_correct=0
            )
            db.add(flashcard)
            saved_count += 1
        
        db.commit()
        
        return FlashcardGeneratedResponse(
            lecture_id=request.lecture_id,
            count=saved_count,
            message=f"Generated {saved_count} flashcards successfully"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating flashcards: {str(e)}"
        )


@router.post("/cheatsheet", response_model=CheatsheetResponse)
async def generate_cheatsheet(
    request: CheatsheetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate study cheatsheet from lecture"""
    
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
    
    lecture_content = lecture.extracted_text or ""
    if not lecture_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lecture content not available yet. Please wait for processing."
        )
    
    # Generate cheatsheet using AI
    ai_client = AIClient()
    
    try:
        content = ai_client.generate_summary(
            content=lecture_content,
            format=request.format
        )
        
        # Save generated document
        doc = GeneratedDocument(
            lecture_id=request.lecture_id,
            title=f"Cheatsheet - {lecture.title}",
            document_type="cheatsheet",
            file_path=f"cheatsheet_{lecture.id}.md"
        )
        db.add(doc)
        db.commit()
        
        return CheatsheetResponse(
            lecture_id=request.lecture_id,
            title=f"Cheatsheet - {lecture.title}",
            content=content
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating cheatsheet: {str(e)}"
        )


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    lecture_id: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all generated documents for current user"""
    query = db.query(GeneratedDocument).join(Lecture).filter(
        Lecture.user_id == current_user.id
    )
    
    if lecture_id:
        query = query.filter(GeneratedDocument.lecture_id == lecture_id)
    
    documents = query.all()
    
    return [
        DocumentResponse(
            id=d.id,
            lecture_id=d.lecture_id,
            title=d.title,
            document_type=d.document_type,
            file_path=d.file_path,
            created_at=d.created_at.isoformat() if d.created_at else ""
        )
        for d in documents
    ]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific generated document"""
    document = db.query(GeneratedDocument).join(Lecture).filter(
        GeneratedDocument.id == document_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    return DocumentResponse(
        id=document.id,
        lecture_id=document.lecture_id,
        title=document.title,
        document_type=document.document_type,
        file_path=document.file_path,
        created_at=document.created_at.isoformat() if document.created_at else ""
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a generated document"""
    document = db.query(GeneratedDocument).join(Lecture).filter(
        GeneratedDocument.id == document_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    db.delete(document)
    db.commit()
