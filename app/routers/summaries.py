"""Document generation endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.utils.cache import cache_response, clear_cache_pattern_sync
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging
import random
import string

from app.models.db import User, Note, Summary
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id
from app.utils.tasks import TaskManager
from app.utils.storage import StorageManager
from app.utils.quotas import enforce_quota_summaries
from app.processing.ai_client import AIClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/summaries", tags=["summaries"])


def format_timestamp(dt: Optional[datetime]) -> str:
    """Format datetime as ISO string with UTC timezone for client-side parsing"""
    if not dt:
        return ""
    # Add UTC timezone info to ensure JS interprets as UTC
    if dt.tzinfo is None:
        # Naive datetime - it's in UTC from our backend
        iso_str = dt.isoformat()
        return iso_str + 'Z' if not iso_str.endswith('Z') else iso_str
    else:
        return dt.isoformat()


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    difficulty: str


class QuizResponse(BaseModel):
    note_id: str
    questions: List[QuizQuestion]
    total_questions: int


class SummaryRequest(BaseModel):
    note_id: str
    mode: str = "elaborate"  # quick, simple, elaborate, eli5
    output_format: str = "sentence"  # sentence, pointform, numbered_list, table
    processing_method: str = "whole"  # whole, section
    split_level: str = "h1"  # h1, h2, h3
    force_regenerate: bool = False
    include_quickread: bool = False  # Generate quick mode summary alongside main summary
    custom_prompt: Optional[str] = None  # Single parameter mode prompt
    prompt_name: Optional[str] = None
    prompt_icon: Optional[str] = None



class SummaryResponse(BaseModel):
    note_id: str
    title: str
    content: str
    is_cached: bool
    summary_type: str = "summary"
    quickread: Optional[str] = None  # Optional quickread summary
    mode: str = "elaborate"
    output_format: str = "sentence"
    processing_method: str = "whole"
    split_level: Optional[str] = None
    processing_time: Optional[float] = None
    processing_time_ms: Optional[int] = None
    model: Optional[str] = None
    is_user_edited: bool = False
    id: Optional[str] = None
    version: Optional[int] = None
    custom_prompt: Optional[str] = None
    prompt_name: Optional[str] = None
    prompt_icon: Optional[str] = None


class CheatsheetRequest(BaseModel):
    note_id: str
    format: str = "markdown"  # markdown or html


class CheatsheetResponse(BaseModel):
    note_id: str
    title: str
    content: str


class SummaryItemResponse(BaseModel):
    id: str
    version: int
    note_id: str
    title: str
    summary_type: str
    file_path: str
    created_at: str
    content: Optional[str] = None
    quickread: Optional[str] = None  # For summaries
    mode: Optional[str] = None  # For summaries (elaborate, quick, simple, eli5)
    output_format: Optional[str] = None  # For summaries (sentence, pointform, numbered_list, table)
    processing_method: Optional[str] = None  # For summaries (whole, section)
    split_level: Optional[str] = None  # For summaries (h1, h2, h3)
    processing_time: Optional[float] = None  # Processing time in seconds
    processing_time_ms: Optional[int] = None  # Processing time in milliseconds
    model: Optional[str] = None  # AI model used
    is_user_edited: bool = False  # Whether the user has edited this summary
    prompt_name: Optional[str] = None
    prompt_icon: Optional[str] = None

@router.post("/quiz", response_model=QuizResponse)
async def generate_quiz(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate quiz questions from a note"""
    
    # Verify note belongs to user
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    note_content = StorageManager.get_note_text(note.id) or ""
    if not note_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content not available yet. Please wait for processing."
        )
    
    # Generate quiz using AI
    ai_client = AIClient(current_user, db=db)
    
    try:
        questions = ai_client.generate_quiz(
            content=note_content,
            num_questions=10
        )
        
        return QuizResponse(
            note_id=note_id,
            questions=questions,
            total_questions=len(questions)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating quiz: {str(e)}"
        )


@router.post("/summary", response_model=dict)
async def generate_summary_endpoint(
    request: SummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate or retrieve cached summary for a note"""
    
    # Enforce tier quotas
    enforce_quota_summaries(current_user, db)
    
    # Verify note belongs to user
    note = db.query(Note).filter(
        Note.id == request.note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )

    # Check for existing summary (unless forced)
    if not request.force_regenerate and not request.custom_prompt:
        existing_summary = db.query(Summary).filter(
            Summary.note_id == request.note_id,
            Summary.summary_type == "summary",
            Summary.processing_method == request.processing_method,
            Summary.mode == request.mode,
            Summary.output_format == request.output_format,
            Summary.custom_prompt.is_(None)
        ).order_by(Summary.created_at.desc()).first()

        if existing_summary:
            return {
                "note_id": request.note_id,
                "title": existing_summary.title,
                "content": StorageManager.get_summary_text(existing_summary.id) or "",
                "is_cached": True,
                "summary_type": existing_summary.summary_type,
                "quickread": StorageManager.get_summary_text(existing_summary.id, is_quickread=True),
                "mode": existing_summary.mode or "elaborate",
                "output_format": existing_summary.output_format or "sentence",
                "processing_method": existing_summary.processing_method or "whole",
                "split_level": existing_summary.split_level,
                "processing_time": existing_summary.processing_time,
                "processing_time_ms": existing_summary.processing_time_ms,
                "model": existing_summary.model,
                "is_user_edited": existing_summary.is_user_edited or False,
                "id": existing_summary.id,
                "version": existing_summary.version,
                "custom_prompt": existing_summary.custom_prompt,
                "prompt_name": existing_summary.prompt_name,
                "prompt_icon": existing_summary.prompt_icon,
                "status": "completed"
            }
    # If forcing regeneration, we simply bypass the cache check and generate a new one.

    import time
    task_id = f"summary_{current_user.id}_{request.note_id}_{int(time.time())}"
    TaskManager.submit_task(
        task_id, 
        "summary_generation", 
        current_user.id, 
        note_id=note.id,
        title=note.title, 
        mode=request.mode,
        output_format=request.output_format,
        processing_method=request.processing_method,
        split_level=request.split_level,
        custom_prompt=request.custom_prompt,
        prompt_name=request.prompt_name,
        prompt_icon=request.prompt_icon
    )

    return {"task_id": task_id, "status": "pending"}

class GeneratePromptRequest(BaseModel):
    user_input: str

@router.post("/generate-prompt", response_model=dict)
async def generate_prompt(
    request: GeneratePromptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a custom prompt based on user's instruction"""
    ai_client = AIClient(db, current_user.id)
    system_instruction = "You are an expert prompt engineer. The user will give you instructions on how they want their study notes summarized. Your task is to output a single, clear, instructional prompt that can be directly passed to another AI to generate the summary. Do NOT include any filler text or conversational intro. Output ONLY the generated prompt itself."
    prompt = f"User's request: {request.user_input}"
    
    try:
        generated_prompt = await ai_client.generate_text(prompt, max_tokens=1000, system_instruction=system_instruction)
        return {"prompt": generated_prompt.strip()}
    except Exception as e:
        logger.error(f"Failed to generate prompt: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate prompt: {str(e)}"
        )



@router.post("/cheatsheet", response_model=CheatsheetResponse)
async def generate_cheatsheet(
    request: CheatsheetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate study cheatsheet from note"""
    
    # Enforce tier quotas
    enforce_quota_summaries(current_user, db)
    
    # Verify note belongs to user
    note = db.query(Note).filter(
        Note.id == request.note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    note_content = StorageManager.get_note_text(note.id) or ""
    if not note_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content not available yet. Please wait for processing."
        )
    
    # Generate cheatsheet using AI
    ai_client = AIClient(current_user, db=db)
    
    try:
        content = await ai_client.generate_summary(
            content=note_content,
            output_format=request.format
        )
        
        # Save generated summary
        doc_id = generate_random_id(db, Summary)
        doc = Summary(
            id=doc_id,
            note_id=request.note_id,
            title=f"Cheatsheet - {note.title}",
            summary_type="cheatsheet",
            file_path=f"cheatsheet_{note.id}.md"
        )
        db.add(doc)

        # Save to storage
        StorageManager.save_summary_text(doc_id, content)

        db.commit()

        return CheatsheetResponse(
            note_id=request.note_id,
            title=f"Cheatsheet - {note.title}",
            content=content
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating cheatsheet: {str(e)}"
        )


class UpdateSummaryRequest(BaseModel):
    content: str
    title: Optional[str] = None
    quickread: Optional[str] = None


@router.put("/{summary_id}", response_model=SummaryItemResponse)
async def update_generated_summary(
    summary_id: str,
    request: UpdateSummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a generated summary (e.g. summary edit)"""
    doc = db.query(Summary).filter(Summary.id == summary_id).first()
    
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
    # Verify ownership through note
    note = db.query(Note).filter(Note.id == doc.note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this summary")
        
    # Save to storage
    StorageManager.save_summary_text(doc.id, request.content)
    if request.title:
        doc.title = request.title
    if request.quickread is not None:
        StorageManager.save_summary_text(doc.id, request.quickread, is_quickread=True)

    # Mark as user edited
    doc.is_user_edited = True

    db.commit()
    db.refresh(doc)
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/summaries*:u{current_user.id}*")
    
    return SummaryItemResponse(
        id=doc.id,
        version=doc.version,
        note_id=doc.note_id,
        title=doc.title,
        summary_type=doc.summary_type,
        file_path=doc.file_path,
        created_at=format_timestamp(doc.created_at),
        content=StorageManager.get_summary_text(doc.id),
        quickread=StorageManager.get_summary_text(doc.id, is_quickread=True),
        mode=doc.mode,
        output_format=doc.output_format,
        processing_method=doc.processing_method,
        split_level=doc.split_level,
        processing_time=doc.processing_time,
        processing_time_ms=doc.processing_time_ms,
        model=doc.model,
        is_user_edited=doc.is_user_edited
    )

@router.get("", response_model=List[SummaryItemResponse])
async def list_summaries(
    request: Request,
    note_id: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all generated summaries for current user"""
    query = db.query(Summary).join(Note).filter(
        Note.user_id == current_user.id
    )
    
    if note_id:
        query = query.filter(Summary.note_id == note_id)
    
    summaries = query.all()
    
    return [
        SummaryItemResponse(
            id=d.id,
            version=d.version,
            note_id=d.note_id,
            title=d.title,
            summary_type=d.summary_type,
            file_path=d.file_path,
            created_at=format_timestamp(d.created_at),
            model=d.model,
            processing_time_ms=d.processing_time_ms,
            mode=d.mode,
            output_format=d.output_format,
            processing_method=d.processing_method,
            split_level=d.split_level,
            is_user_edited=d.is_user_edited or False,
            prompt_name=d.prompt_name,
            prompt_icon=d.prompt_icon
        )
        for d in summaries
    ]


@router.get("/{summary_id}", response_model=SummaryItemResponse)
async def get_summary(
    request: Request,
    summary_id: str,
    note_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific generated summary by ID or version (if note_id provided)"""
    query = db.query(Summary).join(Note).filter(
        Note.user_id == current_user.id
    )
    
    if note_id and summary_id.startswith('v'):
        try:
            version_num = int(summary_id[1:])
            summary = query.filter(
                Summary.note_id == note_id,
                Summary.version == version_num
            ).first()
        except ValueError:
            summary = None
    else:
        summary = query.filter(Summary.id == summary_id).first()
    
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found"
        )
    
    return SummaryItemResponse(
        id=summary.id,
        version=summary.version,
        note_id=summary.note_id,
        title=summary.title,
        summary_type=summary.summary_type,
        file_path=summary.file_path,
        created_at=format_timestamp(summary.created_at),
        content=StorageManager.get_summary_text(summary.id),
        quickread=StorageManager.get_summary_text(summary.id, is_quickread=True),
        mode=summary.mode,
        output_format=summary.output_format,
        processing_method=summary.processing_method,
        split_level=summary.split_level,
        processing_time=summary.processing_time,
        processing_time_ms=summary.processing_time_ms,
        model=summary.model,
        is_user_edited=summary.is_user_edited or False,
        prompt_name=summary.prompt_name,
        prompt_icon=summary.prompt_icon
    )


@router.delete("/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_summary(
    summary_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a generated summary"""
    summary = db.query(Summary).join(Note).filter(
        Summary.id == summary_id,
        Note.user_id == current_user.id
    ).first()

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Delete storage files
    StorageManager.delete_summary_files(summary.id)

    db.delete(summary)
    db.commit()
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/summaries*:u{current_user.id}*")

@router.post("/{summary_id}/export", response_model=dict)
async def export_summary(
    summary_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export a specific generated summary as PDF or DOCX"""
    import os
    import uuid
    from datetime import datetime
    from pathlib import Path
    from app.models.db import Summary, Note, ExportTemplate
    from app.processing.text_processor import ContentSegment, ContentType
    
    # 1. Verify existence and ownership
    doc = db.query(Summary).join(Note).filter(
        Summary.id == summary_id,
        Note.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    note = db.query(Note).filter(Note.id == doc.note_id).first()
    
    # 2. Extract options
    export_format = body.get("format", "pdf").lower()
    if export_format not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'docx'")
        
    template_id = body.get("template_id")
    template = None
    if template_id:
        template = db.query(ExportTemplate).filter(ExportTemplate.id == template_id).first()
        
    # 3. Build content segments
    segments = []
    
    # Add Quickread as a special section if it exists
    quickread = StorageManager.get_summary_text(doc.id, is_quickread=True)
    if quickread:
        segments.append(ContentSegment(
            content=quickread,
            content_type=ContentType.H2,
            page_number=1,
            metadata={"title": "Quickread"}
        ))
        
    # Add the main content
    summary_text = StorageManager.get_summary_text(doc.id) or ""
    segments.append(ContentSegment(
        content=summary_text,
        content_type=ContentType.BODY,
        page_number=1,
        metadata={"title": doc.title or "Summary"}
    ))
    
    # 4. Generate the summary
    generated_dir = "generated"
    output_dir = os.path.join(generated_dir, str(doc.note_id))
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    safe_title = "".join(c for c in (doc.title or note.title) if c.isalnum() or c in (' ', '-', '_')).strip()
    filename = f"{safe_title}_{uuid.uuid4().hex[:6]}.{export_format}"
    output_path = os.path.join(output_dir, filename)
    
    try:
        template_config = template.config if template else None
        
        if export_format == "pdf":
            from app.processing.document_generator import DocumentGenerator
            generator = DocumentGenerator(
                note_id=doc.note_id,
                note_title=note.title,
                base_output_dir=generated_dir
            )
            # Generator uses its own internal path, we need to move it after
            temp_path = generator.generate_pdf(segments, [], template_config=template_config)
            import shutil
            shutil.move(temp_path, output_path)
        else:
            from app.processing.docx_generator import DocxGenerator
            generator = DocxGenerator(
                note_id=doc.note_id,
                note_title=note.title,
                base_output_dir=generated_dir
            )
            temp_path = generator.generate_docx(segments, [], template_config=template_config)
            import shutil
            shutil.move(temp_path, output_path)
            
        # 5. Store export in Summary as a permanent export record
        new_export = Summary(
            note_id=doc.note_id,
            title=f"Export: {doc.title or 'Summary'} ({export_format.upper()})",
            file_path=output_path,
            summary_type=export_format,
            is_user_edited=False
        )
        db.add(new_export)
        db.commit()
        
        return {
            "success": True,
            "message": f"{export_format.upper()} generated successfully",
            "download_url": f"/summaries/{summary_id}/download-export?export_id={new_export.id}",
            "filename": filename
        }
    except Exception as e:
        import logging
        logger = logging.getLogger("app")
        logger.error(f"Error exporting summary {summary_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error exporting: {str(e)}")


@router.get("/{summary_id}/download-export")
async def download_summary_export(
    summary_id: str,
    export_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download a previously generated summary export"""
    import os
    from fastapi.responses import FileResponse
    from app.models.db import Summary, Note
    
    try:
        # Verify export summary exists and user owns the parent note
        export_doc = db.query(Summary).join(Note).filter(
            Summary.id == export_id,
            Note.user_id == current_user.id
        ).first()
        
        if not export_doc:
            logger.error(f"[Download] Export doc {export_id} not found or unauthorized for user {current_user.id}")
            raise HTTPException(status_code=404, detail="Exported record not found")
            
        if not os.path.exists(export_doc.file_path):
            logger.error(f"[Download] File not found on disk: {export_doc.file_path}")
            raise HTTPException(status_code=404, detail="Exported file not found on server")
            
        # Get original doc for title
        original_doc = db.query(Summary).filter(Summary.id == summary_id).first()
        safe_title = "".join(c for c in ((original_doc.title if original_doc else "Summary") or "Summary") if c.isalnum() or c in (' ', '-', '_')).strip()
        
        ext = export_doc.summary_type
        mime_types = {
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        
        return FileResponse(
            path=export_doc.file_path,
            filename=f"{safe_title}.{ext}",
            media_type=mime_types.get(ext, "application/octet-stream")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Download] Internal error serving export {export_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
