"""Smart processing endpoints — font-aware multi-method PDF/PPTX extraction"""
import os
import uuid
import json
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.processing.smart_pipeline import SmartPipeline
from app.models.db import User, Lecture
from app.utils.auth import get_current_user
from app.utils.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/processing", tags=["processing"])

# Shared pipeline instance (reused across requests)
_pipeline = None

def get_pipeline() -> SmartPipeline:
    """Get or create the shared SmartPipeline instance."""
    global _pipeline
    if _pipeline is None:
        _pipeline = SmartPipeline(
            use_layout_detection=False,   # Enable when YOLO model is downloaded
            use_table_transformer=False,  # Enable when Table Transformer is downloaded
        )
    return _pipeline


@router.post("/smart-extract")
async def smart_extract(
    file: UploadFile = File(...),
    use_ai: bool = False,
):
    """
    Upload a PDF/PPTX and get clean Markdown back immediately.
    
    This is a standalone endpoint — no authentication required, no database storage.
    Perfect for quick testing and one-off conversions.
    
    Args:
        file: PDF or PPTX file to process
        use_ai: Whether to use AI models (layout detection + table transformer)
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".pdf", ".pptx"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Only .pdf and .pptx are supported."
        )

    # Read and save to temp file
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    # Write to temp file for processing
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        # Create pipeline with requested settings
        pipeline = SmartPipeline(
            use_layout_detection=use_ai,
            use_table_transformer=use_ai,
        )

        logger.info(f"Smart extract: {file.filename} ({len(contents)} bytes, ai={use_ai})")
        markdown = pipeline.process(tmp_path)

        # Compute stats
        lines = markdown.split("\n")
        headings = len([l for l in lines if l.startswith("#")])
        list_items = len([l for l in lines if l.strip().startswith("- ") or l.strip().startswith("1. ")])
        table_rows = len([l for l in lines if l.strip().startswith("|")])

        return JSONResponse({
            "success": True,
            "filename": file.filename,
            "markdown": markdown,
            "stats": {
                "headings": headings,
                "list_items": list_items,
                "table_rows": table_rows,
                "total_lines": len(lines),
                "total_chars": len(markdown),
            }
        })

    except Exception as e:
        logger.error(f"Smart extract failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.post("/smart-extract/download")
async def smart_extract_download(
    file: UploadFile = File(...),
    use_ai: bool = False,
):
    """
    Upload a PDF/PPTX and download the result as a .md file directly.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".pdf", ".pptx"):
        raise HTTPException(status_code=400, detail="Only .pdf and .pptx supported")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        pipeline = SmartPipeline(
            use_layout_detection=use_ai,
            use_table_transformer=use_ai,
        )
        markdown = pipeline.process(tmp_path)

        md_filename = Path(file.filename).stem + ".md"
        return Response(
            content=markdown.encode("utf-8"),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{md_filename}"'}
        )
    except Exception as e:
        logger.error(f"Smart extract download failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.post("/lectures/{lecture_id}/reprocess-smart")
async def reprocess_smart(
    lecture_id: str,
    use_ai: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reprocess an existing lecture using the smart font-aware pipeline.
    
    This replaces the existing OCR-based extraction with the multi-method
    font-aware pipeline that produces cleaner, more accurate Markdown.
    
    The result is stored in the lecture's extracted_text field as Markdown,
    and in extracted_content_structured as structured JSON segments.
    """
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()

    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    if not os.path.exists(lecture.file_path):
        raise HTTPException(status_code=404, detail="Lecture file not found on disk")

    # Only PDF and PPTX supported by smart pipeline
    file_ext = Path(lecture.file_path).suffix.lower()
    if file_ext not in (".pdf", ".pptx"):
        raise HTTPException(
            status_code=400,
            detail=f"Smart processing only supports PDF and PPTX (got {file_ext})"
        )

    try:
        logger.info(f"Smart reprocessing lecture {lecture_id} (ai={use_ai})")

        pipeline = SmartPipeline(
            use_layout_detection=use_ai,
            use_table_transformer=use_ai,
        )
        markdown = pipeline.process(lecture.file_path)

        # Convert markdown to structured segments for compatibility with existing UI
        structured_segments = _markdown_to_segments(markdown)

        # Update lecture record
        lecture.extracted_text = markdown
        lecture.extracted_content_structured = json.dumps(structured_segments)
        lecture.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(lecture)

        # Compute stats
        lines = markdown.split("\n")
        headings = len([l for l in lines if l.startswith("#")])
        list_items = len([l for l in lines if l.strip().startswith("- ")])
        table_rows = len([l for l in lines if l.strip().startswith("|")])

        logger.info(f"Smart reprocess complete: {len(markdown)} chars, "
                     f"{headings} headings, {list_items} lists, {table_rows} table rows")

        return JSONResponse({
            "success": True,
            "lecture_id": lecture_id,
            "markdown_length": len(markdown),
            "stats": {
                "headings": headings,
                "list_items": list_items,
                "table_rows": table_rows,
                "total_lines": len(lines),
            },
            "message": "Lecture reprocessed with smart pipeline"
        })

    except Exception as e:
        logger.error(f"Smart reprocess failed for lecture {lecture_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Smart reprocessing failed: {str(e)}")


def _markdown_to_segments(markdown: str) -> list:
    """
    Convert Markdown text to structured segments compatible with the existing
    lecture view UI (which expects ContentSegment-style JSON objects).
    """
    import re
    segments = []
    page = 1

    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        # Determine content type
        if stripped.startswith("# "):
            content_type = "h1"
            content = stripped[2:]
        elif stripped.startswith("## "):
            content_type = "h2"
            content = stripped[3:]
        elif stripped.startswith("### "):
            content_type = "h3"
            content = stripped[4:]
        elif stripped.startswith("#### "):
            content_type = "h4"
            content = stripped[5:]
        elif stripped.startswith("##### "):
            content_type = "h5"
            content = stripped[6:]
        elif stripped.startswith("- "):
            content_type = "list"
            content = stripped[2:]
        elif re.match(r"^\d+\.\s", stripped):
            content_type = "ordered_list"
            content = re.sub(r"^\d+\.\s", "", stripped)
        elif stripped.startswith("|"):
            content_type = "table_row"
            content = stripped
        elif stripped.startswith("---"):
            continue  # Skip table separators
        else:
            content_type = "body"
            content = stripped

        segments.append({
            "content": content,
            "type": content_type,
            "page": page,
            "confidence": 0.95,
            "metadata": {"source": "smart_pipeline"}
        })

    return segments
