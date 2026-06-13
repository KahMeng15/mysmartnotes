"""Semantic search endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from app.models.db import User, Note, Task
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
    note_id: int = None
    top_k: int = 5


class SearchResult(BaseModel):
    content: str
    score: float
    note_id: int
    note_title: str


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
    Perform semantic search across user's notes
    """
    try:
        # Get notes to search
        if request.note_id:
            notes = db.query(Note).filter(
                Note.id == request.note_id,
                Note.user_id == current_user.id
            ).all()
        else:
            notes = db.query(Note).filter(
                Note.user_id == current_user.id
            ).all()
        
        if not notes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No notes found to search"
            )
        
        # Collect all chunks from notes
        all_chunks = []
        chunk_metadata = []  # Track which note each chunk comes from
        
        for note in notes:
            text = StorageManager.get_note_text(note.id)
            if not text:
                continue
            
            # Split note content into chunks
            from app.processing.ocr import OCRProcessor
            chunks = OCRProcessor.chunk_text(text)
            
            for chunk in chunks:
                all_chunks.append(chunk)
                chunk_metadata.append({
                    "note_id": note.id,
                    "note_title": note.title,
                    "content": chunk
                })
        
        if not all_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text content available in notes for search"
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
                        note_id=metadata["note_id"],
                        note_title=metadata["note_title"]
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


@router.get("/similar/{note_id}")
async def get_similar_notes(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Find similar notes based on content similarity
    """
    try:
        # Get source note
        source_note = db.query(Note).filter(
            Note.id == note_id,
            Note.user_id == current_user.id
        ).first()
        
        source_text = StorageManager.get_note_text(note_id)
        if not source_note or not source_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found or has no content"
            )
        
        # Get all other notes
        other_notes = db.query(Note).filter(
            Note.user_id == current_user.id,
            Note.id != note_id
        ).all()
        
        # Filter for notes that actually have text on disk
        valid_other_notes = []
        other_contents = []
        for l in other_notes:
            text = StorageManager.get_note_text(l.id)
            if text:
                valid_other_notes.append(l)
                other_contents.append(text[:1000])

        if not valid_other_notes:
            return {"similar_notes": []}
        
        # Extract first chunk from source note as query
        from app.processing.ocr import OCRProcessor
        source_chunks = OCRProcessor.chunk_text(source_text)
        
        if not source_chunks:
            return {"similar_notes": []}
        
        source_chunk = source_chunks[0]
        
        # Search for similar content
        embeddings_mgr = get_embeddings_manager()
        
        results = embeddings_mgr.search(
            query=source_chunk,
            documents=other_contents,
            top_k=5
        )
        
        similar_notes = []
        for content, score in results:
            for i, text_snippet in enumerate(other_contents):
                if text_snippet.startswith(content[:500]):
                    l = valid_other_notes[i]
                    similar_notes.append({
                        "id": l.id,
                        "title": l.title,
                        "similarity_score": float(score),
                        "subject_id": l.subject_id
                    })
                    break
        
        return {"similar_notes": similar_notes}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error finding similar notes: {str(e)}"
        )


@router.get("/tasks/active")
async def get_active_tasks(
    current_user: User = Depends(get_current_user)
):
    """Get all currently processing tasks for the user"""
    from app.utils.tasks import TaskManager
    tasks = TaskManager.get_active_tasks(current_user.id)
    return {"tasks": tasks}


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel a background processing task"""
    from app.utils.tasks import TaskManager
    success = TaskManager.cancel_task(task_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task not found or already finished"
        )
    return {"status": "cancelled"}


@router.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get status of a background processing task"""
    from app.utils.tasks import TaskManager
    
    status_info = TaskManager.get_task_status(task_id, user_id=current_user.id)
    
    if not status_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    return status_info


@router.get("/task")
async def get_note_task_status(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get status of OCR task for a note"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Verify note belongs to user
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        logger.warning(f"Note {note_id} not found for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    # Try to find the latest OCR task by note_id pattern (ocr_<user_id>_<note_id>_<hash>)
    task_id_pattern = f"ocr_{current_user.id}_{note_id}%"
    db_task = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.task_id.like(task_id_pattern)
    ).order_by(Task.updated_at.desc()).first()

    if db_task:
        status_info = {
            "task_id": db_task.task_id,
            "status": db_task.status,
            "progress": db_task.progress or 0,
            "updated_at": db_task.updated_at.isoformat() if db_task.updated_at else None,
            "error": db_task.error_message,
        }
        logger.info(f"Returning DB task status: {status_info}")
        return status_info
    
    # No active task
    from app.utils.storage import StorageManager
    has_text = bool(StorageManager.get_note_text(note.id))
    logger.info(f"No active task. Note extracted_text: {'EXISTS' if has_text else 'NULL'}")
    if has_text:
        # Text exists, extraction is complete
        logger.info(f"Text exists, returning completed status")
        return {
            "task_id": None,
            "status": "completed",
            "progress": 100
        }
    else:
        # No text and no active task - return pending status (not completed!)
        logger.warning(f"No text and no active task! Returning pending status to retry")
        return {
            "task_id": None,
            "status": "pending",
            "progress": 0
        }

