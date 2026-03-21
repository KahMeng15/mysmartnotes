#!/usr/bin/env python3
"""
Check the note content and summary data for a specific lecture
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.db import SessionLocal
from app.models.db import Lecture, GeneratedDocument

def check_note_summary(lecture_id):
    db = SessionLocal()
    
    # Get lecture
    lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
    if not lecture:
        print(f"Lecture {lecture_id} not found")
        return
    
    print(f"\n{'='*80}")
    print(f"LECTURE: {lecture.title} (ID: {lecture_id})")
    print(f"{'='*80}")
    print(f"\nContent Length: {len(lecture.extracted_text or '')} characters")
    print(f"Content Preview:\n{(lecture.extracted_text or '')[:500]}...\n")
    
    # Get summaries
    summaries = db.query(GeneratedDocument).filter(
        GeneratedDocument.lecture_id == lecture_id,
        GeneratedDocument.document_type == "summary"
    ).order_by(GeneratedDocument.created_at.desc()).all()
    
    if not summaries:
        print("No summaries found\n")
        return
    
    print(f"Found {len(summaries)} summary(ies):\n")
    for idx, summary in enumerate(summaries, 1):
        print(f"{'-'*80}")
        print(f"Summary #{idx}")
        print(f"{'-'*80}")
        print(f"ID: {summary.id}")
        print(f"Title: {summary.title}")
        print(f"Processing Method: {summary.processing_method or 'NOT SET'}")
        print(f"Mode: {summary.mode or 'NOT SET'}")
        print(f"Output Format: {summary.output_format or 'NOT SET'}")
        print(f"Has Quickread: {'Yes' if summary.quickread else 'No'}")
        print(f"Created: {summary.created_at}")
        print(f"\nMain Content Length: {len(summary.content or '')} characters")
        print(f"Content Preview:\n{(summary.content or '')[:300]}...\n")
        if summary.quickread:
            print(f"Quickread Length: {len(summary.quickread)} characters")
            print(f"Quickread Preview:\n{summary.quickread[:300]}...\n")
    
    db.close()

if __name__ == "__main__":
    lecture_id = "t11p73yA"
    check_note_summary(lecture_id)
