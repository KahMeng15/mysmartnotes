"""Note Snapshots management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.models.db import NoteSnapshot, Lecture, User
from app.schemas.schemas import NoteSnapshotCreate, NoteSnapshotResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


@router.get("/{lecture_id}", response_model=List[NoteSnapshotResponse])
async def list_snapshots(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all snapshots for a lecture"""
    # Verify lecture belongs to user
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    snapshots = db.query(NoteSnapshot).filter(
        NoteSnapshot.lecture_id == lecture_id,
        NoteSnapshot.user_id == current_user.id
    ).order_by(NoteSnapshot.created_at.desc()).all()
    
    return snapshots


@router.post("/{lecture_id}", response_model=NoteSnapshotResponse, status_code=201)
async def create_snapshot(
    lecture_id: str,
    body: NoteSnapshotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a named snapshot of the current note content"""
    # Verify lecture belongs to user
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    snapshot = NoteSnapshot(
        lecture_id=lecture_id,
        user_id=current_user.id,
        name=body.name,
        content=body.content
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.get("/{lecture_id}/{snapshot_id}", response_model=NoteSnapshotResponse)
async def get_snapshot(
    lecture_id: str,
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single snapshot's content"""
    snapshot = db.query(NoteSnapshot).filter(
        NoteSnapshot.id == snapshot_id,
        NoteSnapshot.lecture_id == lecture_id,
        NoteSnapshot.user_id == current_user.id
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.delete("/{lecture_id}/{snapshot_id}", status_code=204)
async def delete_snapshot(
    lecture_id: str,
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a snapshot"""
    snapshot = db.query(NoteSnapshot).filter(
        NoteSnapshot.id == snapshot_id,
        NoteSnapshot.lecture_id == lecture_id,
        NoteSnapshot.user_id == current_user.id
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    db.delete(snapshot)
    db.commit()
    return None
