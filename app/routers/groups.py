from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List

from app.models.db import User, SubjectGroup
from app.schemas.schemas import SubjectGroupCreate, SubjectGroupUpdate, SubjectGroupResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id
from app.utils.quotas import enforce_quota_groups
from app.utils.cache import cache_response, clear_cache_pattern_sync

router = APIRouter(prefix="/groups", tags=["groups"])

@router.get("", response_model=List[SubjectGroupResponse])
async def get_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all subject groups with their subjects"""
    groups = db.query(SubjectGroup).filter(SubjectGroup.user_id == current_user.id).all()
    return groups

@router.post("", response_model=SubjectGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group: SubjectGroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new subject group"""
    # Enforce tier quotas
    enforce_quota_groups(current_user, db)
    
    db_group = SubjectGroup(
        id=generate_random_id(db, SubjectGroup),
        name=group.name,
        user_id=current_user.id
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/groups*:u{current_user.id}*")
    
    return db_group

@router.put("/{group_id}", response_model=SubjectGroupResponse)
async def update_group(
    group_id: str,
    group: SubjectGroupUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a group"""
    db_group = db.query(SubjectGroup).filter(
        SubjectGroup.id == group_id,
        SubjectGroup.user_id == current_user.id
    ).first()
    
    if not db_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if group.name:
        db_group.name = group.name
    
    db.commit()
    db.refresh(db_group)
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/groups*:u{current_user.id}*")
    
    return db_group

@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a group"""
    db_group = db.query(SubjectGroup).filter(
        SubjectGroup.id == group_id,
        SubjectGroup.user_id == current_user.id
    ).first()
    
    if not db_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    db.delete(db_group)
    db.commit()
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/groups*:u{current_user.id}*")
    
    return None
