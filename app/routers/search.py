"""Semantic search endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from app.models.db import User, Resource, Task
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.utils.storage import StorageManager

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
    resource_id: str = None
    top_k: int = 5


class SearchResult(BaseModel):
    content: str
    score: float
    resource_id: str
    resource_title: str


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
    Perform semantic search across user's resources
    """
    try:
        # Get resources to search
        if request.resource_id:
            resources = db.query(Resource).filter(
                Resource.id == request.resource_id,
                Resource.user_id == current_user.id
            ).all()
        else:
            resources = db.query(Resource).filter(
                Resource.user_id == current_user.id
            ).all()
        
        if not resources:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No resources found to search"
            )
        
        # Collect all chunks from resources
        all_chunks = []
        chunk_metadata = []  # Track which resource each chunk comes from
        
        for resource in resources:
            text = StorageManager.get_resource_text(resource.id)
            if not text:
                continue
            
            # Split resource content into chunks
            from app.processing.ocr import OCRProcessor
            chunks = OCRProcessor.chunk_text(text)
            
            for chunk in chunks:
                all_chunks.append(chunk)
                chunk_metadata.append({
                    "resource_id": resource.id,
                    "resource_title": resource.title,
                    "content": chunk
                })
        
        if not all_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text content available in resources for search"
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
                        resource_id=metadata["resource_id"],
                        resource_title=metadata["resource_title"]
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


@router.get("/similar/{resource_id}")
async def get_similar_resources(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Find similar resources based on content similarity
    """
    try:
        # Get source resource
        source_resource = db.query(Resource).filter(
            Resource.id == resource_id,
            Resource.user_id == current_user.id
        ).first()
        
        source_text = StorageManager.get_resource_text(resource_id)
        if not source_resource or not source_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found or has no content"
            )
        
        # Get all other resources
        other_resources = db.query(Resource).filter(
            Resource.user_id == current_user.id,
            Resource.id != resource_id
        ).all()
        
        # Filter for resources that actually have text on disk
        valid_other_resources = []
        other_contents = []
        for l in other_resources:
            text = StorageManager.get_resource_text(l.id)
            if text:
                valid_other_resources.append(l)
                other_contents.append(text[:1000])

        if not valid_other_resources:
            return {"similar_resources": []}
        
        # Extract first chunk from source resource as query
        from app.processing.ocr import OCRProcessor
        source_chunks = OCRProcessor.chunk_text(source_text)
        
        if not source_chunks:
            return {"similar_resources": []}
        
        source_chunk = source_chunks[0]
        
        # Search for similar content
        embeddings_mgr = get_embeddings_manager()
        
        results = embeddings_mgr.search(
            query=source_chunk,
            documents=other_contents,
            top_k=5
        )
        
        similar_resources = []
        for content, score in results:
            for i, text_snippet in enumerate(other_contents):
                if text_snippet.startswith(content[:500]):
                    l = valid_other_resources[i]
                    similar_resources.append({
                        "id": l.id,
                        "title": l.title,
                        "similarity_score": float(score),
                        "subject_id": l.subject_id
                    })
                    break
        
        return {"similar_resources": similar_resources}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error finding similar resources: {str(e)}"
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


@router.post("/tasks/{task_id}/dismiss")
async def dismiss_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Dismiss a background processing task (removes it from DB)"""
    from app.models.db import Task
    task = db.query(Task).filter(
        Task.task_id == task_id,
        Task.user_id == current_user.id
    ).first()
    if task:
        db.delete(task)
        db.commit()
    return {"status": "dismissed"}


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
async def get_resource_task_status(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get status of OCR task for a resource"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Verify resource belongs to user
    resource = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not resource:
        logger.warning(f"Resource {resource_id} not found for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    # Try to find the latest OCR task by resource_id pattern (ocr_<user_id>_<resource_id>_<hash>)
    task_id_pattern = f"ocr_{current_user.id}_{resource_id}%"
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
    has_text = bool(StorageManager.get_resource_text(resource.id))
    logger.info(f"No active task. Resource extracted_text: {'EXISTS' if has_text else 'NULL'}")
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
