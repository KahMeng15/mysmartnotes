"""Note Snapshots management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.models.db import NoteSnapshot, Note, User
from app.schemas.schemas import NoteSnapshotCreate, NoteSnapshotResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


@router.get("/{note_id}", response_model=List[NoteSnapshotResponse])
async def list_snapshots(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all snapshots for a note"""
    # Verify note belongs to user
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    snapshots = db.query(NoteSnapshot).filter(
        NoteSnapshot.note_id == note_id,
        NoteSnapshot.user_id == current_user.id
    ).order_by(NoteSnapshot.created_at.desc()).all()
    
    return snapshots


@router.post("/{note_id}", response_model=NoteSnapshotResponse, status_code=201)
async def create_snapshot(
    note_id: str,
    body: NoteSnapshotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a named snapshot of the current note content"""
    # Verify note belongs to user
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    snapshot = NoteSnapshot(
        note_id=note_id,
        user_id=current_user.id,
        name=body.name,
        content=body.content
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.get("/{note_id}/{snapshot_id}", response_model=NoteSnapshotResponse)
async def get_snapshot(
    note_id: str,
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single snapshot's content"""
    snapshot = db.query(NoteSnapshot).filter(
        NoteSnapshot.id == snapshot_id,
        NoteSnapshot.note_id == note_id,
        NoteSnapshot.user_id == current_user.id
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.delete("/{note_id}/{snapshot_id}", status_code=204)
async def delete_snapshot(
    note_id: str,
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a snapshot"""
    snapshot = db.query(NoteSnapshot).filter(
        NoteSnapshot.id == snapshot_id,
        NoteSnapshot.note_id == note_id,
        NoteSnapshot.user_id == current_user.id
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    db.delete(snapshot)
    db.commit()
    return None
