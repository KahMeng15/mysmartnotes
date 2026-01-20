"""Semantic search endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from app.models.db import User, Lecture
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/search", tags=["search"])

# Lazy import to avoid version conflicts at startup
def get_embeddings_manager():
    try:
        from app.processing.search import EmbeddingsManager
        return EmbeddingsManager()
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Search service unavailable: {str(e)}"
        )


class SearchQuery(BaseModel):
    query: str
    lecture_id: int = None
    top_k: int = 5


class SearchResult(BaseModel):
    content: str
    score: float
    lecture_id: int
    lecture_title: str


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    total_results: int


@router.post("/semantic", response_model=SearchResponse)
async def semantic_search(
    request: SearchQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Perform semantic search across user's lectures
    """
    try:
        # Get lectures to search
        if request.lecture_id:
            lectures = db.query(Lecture).filter(
                Lecture.id == request.lecture_id,
                Lecture.user_id == current_user.id
            ).all()
        else:
            lectures = db.query(Lecture).filter(
                Lecture.user_id == current_user.id
            ).all()
        
        if not lectures:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No lectures found to search"
            )
        
        # Collect all chunks from lectures
        all_chunks = []
        chunk_metadata = []  # Track which lecture each chunk comes from
        
        for lecture in lectures:
            if not lecture.extracted_text:
                continue
            
            # Split lecture content into chunks
            from app.processing.ocr import OCRProcessor
            chunks = OCRProcessor.chunk_text(lecture.extracted_text)
            
            for chunk in chunks:
                all_chunks.append(chunk)
                chunk_metadata.append({
                    "lecture_id": lecture.id,
                    "lecture_title": lecture.title,
                    "content": chunk
                })
        
        if not all_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text content available in lectures for search"
            )
        
        # Perform semantic search
        embeddings_mgr = get_embeddings_manager()
        results = embeddings_mgr.search(
            query=request.query,
            documents=all_chunks,
            top_k=request.top_k
        )
        
        # Build response
        search_results = []
        for chunk, score in results:
            # Find metadata for this chunk
            for metadata in chunk_metadata:
                if metadata["content"] == chunk:
                    search_results.append(SearchResult(
                        content=chunk,
                        score=float(score),
                        lecture_id=metadata["lecture_id"],
                        lecture_title=metadata["lecture_title"]
                    ))
                    break
        
        return SearchResponse(
            query=request.query,
            results=search_results,
            total_results=len(search_results)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search error: {str(e)}"
        )


@router.get("/similar/{lecture_id}")
async def get_similar_lectures(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Find similar lectures based on content similarity
    """
    try:
        # Get source lecture
        source_lecture = db.query(Lecture).filter(
            Lecture.id == lecture_id,
            Lecture.user_id == current_user.id
        ).first()
        
        if not source_lecture or not source_lecture.extracted_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lecture not found or has no content"
            )
        
        # Get all other lectures
        other_lectures = db.query(Lecture).filter(
            Lecture.user_id == current_user.id,
            Lecture.id != lecture_id,
            Lecture.extracted_text != None
        ).all()
        
        if not other_lectures:
            return {"similar_lectures": []}
        
        # Extract first chunk from source lecture as query
        from app.processing.ocr import OCRProcessor
        source_chunks = OCRProcessor.chunk_text(source_lecture.extracted_text)
        
        if not source_chunks:
            return {"similar_lectures": []}
        
        source_chunk = source_chunks[0]
        
        # Search for similar content
        embeddings_mgr = get_embeddings_manager()
        
        other_contents = [l.extracted_text[:1000] for l in other_lectures]  # First 1000 chars
        results = embeddings_mgr.search(
            query=source_chunk,
            documents=other_contents,
            top_k=5
        )
        
        similar_lectures = []
        for content, score in results:
            for lecture in other_lectures:
                if lecture.extracted_text.startswith(content[:500]):
                    similar_lectures.append({
                        "id": lecture.id,
                        "title": lecture.title,
                        "similarity_score": float(score),
                        "subject_id": lecture.subject_id
                    })
                    break
        
        return {"similar_lectures": similar_lectures}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error finding similar lectures: {str(e)}"
        )


@router.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get status of a background processing task"""
    from app.utils.tasks import TaskManager
    
    status_info = TaskManager.get_task_status(task_id)
    
    if not status_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    return status_info
