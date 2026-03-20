"""Document generation endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging

from app.models.db import User, Lecture, GeneratedDocument, Flashcard
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.processing.ai_client import AIClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    difficulty: str


class QuizResponse(BaseModel):
    lecture_id: str
    questions: List[QuizQuestion]
    total_questions: int


class FlashcardRequest(BaseModel):
    lecture_id: str
    quantity: int = 10


class SummaryRequest(BaseModel):
    lecture_id: str
    mode: str = "elaborate"  # quick, simple, elaborate, eli5
    output_format: str = "sentence"  # sentence, pointform, numbered_list, table
    processing_method: str = "whole"  # whole, section
    split_level: str = "h1"  # h1, h2, h3
    force_regenerate: bool = False
    include_quickread: bool = False  # Generate quick mode summary alongside main summary


class SummaryResponse(BaseModel):
    lecture_id: str
    title: str
    content: str
    is_cached: bool
    quickread: Optional[str] = None  # Optional quickread summary
    mode: str = "elaborate"
    output_format: str = "sentence"
    processing_method: str = "whole"
    id: Optional[int] = None


class FlashcardGeneratedResponse(BaseModel):
    lecture_id: str
    count: int
    message: str


class CheatsheetRequest(BaseModel):
    lecture_id: str
    format: str = "markdown"  # markdown or html


class CheatsheetResponse(BaseModel):
    lecture_id: str
    title: str
    content: str


class DocumentResponse(BaseModel):
    id: int
    lecture_id: str
    title: str
    document_type: str
    file_path: str
    created_at: str
    content: Optional[str] = None
    quickread: Optional[str] = None  # For summaries
    mode: Optional[str] = None  # For summaries (elaborate, quick, simple, eli5)
    output_format: Optional[str] = None  # For summaries (sentence, pointform, numbered_list, table)
    processing_method: Optional[str] = None  # For summaries (whole, section)

@router.post("/quiz", response_model=QuizResponse)
async def generate_quiz(
    lecture_id: str,
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
    ai_client = AIClient(current_user, db=db)
    
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
    ai_client = AIClient(current_user, db=db)
    
    try:
        flashcard_data = await ai_client.generate_flashcards(
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


@router.post("/flashcards/{lecture_id}", response_model=FlashcardGeneratedResponse)
async def generate_flashcards_by_path(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Auto-generate flashcards from lecture content (path param version)"""
    request = FlashcardRequest(lecture_id=lecture_id)
    return await generate_flashcards(request, current_user, db)


@router.post("/summary", response_model=SummaryResponse)
async def generate_summary_endpoint(
    request: SummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate or retrieve cached summary for a lecture"""
    
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

    # Check for existing summary (unless forced)
    if not request.force_regenerate:
        existing_summary = db.query(GeneratedDocument).filter(
            GeneratedDocument.lecture_id == request.lecture_id,
            GeneratedDocument.document_type == "summary"
        ).order_by(GeneratedDocument.created_at.desc()).first()

        if existing_summary:
            return SummaryResponse(
                lecture_id=request.lecture_id,
                title=existing_summary.title,
                content=existing_summary.content,
                is_cached=True,
                quickread=existing_summary.quickread,
                mode=existing_summary.mode or "elaborate",
                output_format=existing_summary.output_format or "sentence",
                processing_method=existing_summary.processing_method or "whole",
                id=existing_summary.id
            )
    # If forcing regeneration, we simply bypass the cache check and generate a new one.

    lecture_content = lecture.extracted_text or ""
    if not lecture_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lecture content not available yet. Please wait for processing."
        )
    
    ai_client = AIClient(current_user, db=db)
    quickread_content = None
    
    try:
        if request.processing_method == "whole":
            summary_content = await ai_client.generate_summary(
                content=lecture_content,
                mode=request.mode,
                output_format=request.output_format
            )
            
            # Generate quickread if requested (quick mode overview)
            if request.include_quickread:
                quickread_content = await ai_client.generate_summary(
                    content=lecture_content,
                    mode="quick",
                    output_format="pointform"
                )
        else:
            # Section by section logic
            import re
            # Split by chosen level (e.g. h1 = # , h2 = ## , h3 = ### )
            # If h2 is chosen, we split by H1 and H2.
            level_map = {"h1": r"^# ", "h2": r"^#{1,2} ", "h3": r"^#{1,3} "}
            split_pattern = level_map.get(request.split_level, r"^# ")
            
            # Split lines but keep headers
            lines = lecture_content.split("\n")
            sections = [] # List of tuples: (title, content)
            current_title = "Introduction"
            current_content = []
            
            for line in lines:
                match = re.match(split_pattern, line)
                if match:
                    if current_content:
                        sections.append((current_title, "\n".join(current_content)))
                    # Extract title from header (remove # symbols)
                    current_title = line.lstrip("#").strip()
                    current_content = []
                current_content.append(line)
            
            if current_content:
                sections.append((current_title, "\n".join(current_content)))
            
            # Summarize each section
            summarized_sections = []
            for title, content in sections:
                # Only summarize if there's actual body text beyond the header
                body_lines = [l for l in content.split("\n") if not re.match(split_pattern, l) and l.strip()]
                if not body_lines:
                    continue
                    
                section_summary = await ai_client.generate_summary(
                    content=content,
                    mode=request.mode,
                    output_format=request.output_format
                )
                summarized_sections.append(f"## {title}\n\n{section_summary}")
            
            summary_content = "\n\n".join(summarized_sections)
            
            # Generate quickread if requested (quick mode overview)
            if request.include_quickread:
                quickread_content = await ai_client.generate_summary(
                    content=lecture_content,
                    mode="quick",
                    output_format="pointform"
                )

        # Save generated document
        doc = GeneratedDocument(
            lecture_id=request.lecture_id,
            title=f"{request.mode.capitalize()} in {request.output_format.replace('_', ' ')}",
            document_type="summary",
            file_path=f"summary_{lecture.id}.md",
            content=summary_content,
            quickread=quickread_content,
            mode=request.mode,
            output_format=request.output_format,
            processing_method=request.processing_method
        )
        db.add(doc)
        db.commit()
        
        return SummaryResponse(
            lecture_id=request.lecture_id,
            title=f"Summary - {lecture.title}",
            content=summary_content,
            is_cached=False,
            quickread=quickread_content,
            mode=request.mode,
            output_format=request.output_format,
            processing_method=request.processing_method,
            id=doc.id
        )
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating summary: {str(e)}"
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
    ai_client = AIClient(current_user, db=db)
    
    try:
        content = await ai_client.generate_summary(
            content=lecture_content,
            output_format=request.format
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
    lecture_id: str = None,
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
        created_at=document.created_at.isoformat() if document.created_at else "",
        content=document.content,
        quickread=document.quickread,
        mode=document.mode,
        output_format=document.output_format,
        processing_method=document.processing_method
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
