"""Export templates CRUD router"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.models.db import User, ExportTemplate
from app.utils.auth import get_current_user
from app.utils.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["templates"])

# ─── Default template configs ──────────────────────────────────

DEFAULT_ELEMENT_STYLE = {
    "alignment": "left",
    "text_color": "#2C3E50",
    "background_color": None,
    "font_weight": "normal",
    "font_size": 11,
}

SEEDED_TEMPLATES = [
    {
        "name": "Standard Academic",
        "description": "Clean, professional layout for academic documents",
        "config": {
            "page": {"size": "A4", "orientation": "portrait", "columns": 1, "margins": {"top": 25, "bottom": 25, "left": 19, "right": 19}},
            "font_family": "Instrument Sans",
            "spacing": {"line_spacing": 1.15, "paragraph_spacing": 8},
            "elements": {
                "h1": {"alignment": "left", "text_color": "#1A1A2E", "background_color": None, "font_weight": "bold", "font_size": 28},
                "h2": {"alignment": "left", "text_color": "#2C3E50", "background_color": None, "font_weight": "bold", "font_size": 24},
                "h3": {"alignment": "left", "text_color": "#34495E", "background_color": None, "font_weight": "bold", "font_size": 20},
                "h4": {"alignment": "left", "text_color": "#333333", "background_color": None, "font_weight": "bold", "font_size": 16},
                "h5": {"alignment": "left", "text_color": "#555555", "background_color": None, "font_weight": "bold", "font_size": 14},
                "paragraph": {"alignment": "justify", "text_color": "#2C3E50", "background_color": None, "font_weight": "normal", "font_size": 11},
                "list": {"alignment": "left", "text_color": "#2C3E50", "background_color": None, "font_weight": "normal", "font_size": 11, "number_format": "bullet"},
            },
            "cover_page": {"enabled": True, "title_size": 36, "title_color": "#1A1A2E", "show_date": True, "show_author": False},
            "header": {"enabled": False, "text": ""},
            "footer": {"enabled": True, "show_page_number": True, "custom_text": ""},
            "image_defaults": {"alignment": "center", "max_width_percent": 80},
        }
    },
    {
        "name": "Modern Minimal",
        "description": "Clean and minimal with generous whitespace",
        "config": {
            "page": {"size": "A4", "orientation": "portrait", "columns": 1, "margins": {"top": 32, "bottom": 32, "left": 25, "right": 25}},
            "font_family": "Instrument Sans",
            "spacing": {"line_spacing": 1.4, "paragraph_spacing": 12},
            "elements": {
                "h1": {"alignment": "left", "text_color": "#111111", "background_color": None, "font_weight": "bold", "font_size": 32},
                "h2": {"alignment": "left", "text_color": "#333333", "background_color": None, "font_weight": "bold", "font_size": 22},
                "h3": {"alignment": "left", "text_color": "#555555", "background_color": None, "font_weight": "bold", "font_size": 18},
                "h4": {"alignment": "left", "text_color": "#666666", "background_color": None, "font_weight": "bold", "font_size": 15},
                "h5": {"alignment": "left", "text_color": "#777777", "background_color": None, "font_weight": "bold", "font_size": 13},
                "paragraph": {"alignment": "left", "text_color": "#444444", "background_color": None, "font_weight": "normal", "font_size": 11},
                "list": {"alignment": "left", "text_color": "#444444", "background_color": None, "font_weight": "normal", "font_size": 11, "number_format": "bullet"},
            },
            "cover_page": {"enabled": True, "title_size": 40, "title_color": "#111111", "show_date": True, "show_author": False},
            "header": {"enabled": False, "text": ""},
            "footer": {"enabled": True, "show_page_number": True, "custom_text": ""},
            "image_defaults": {"alignment": "center", "max_width_percent": 70},
        }
    },
    {
        "name": "Bold & Dark",
        "description": "High contrast dark theme with bold typography",
        "config": {
            "page": {"size": "A4", "orientation": "portrait", "columns": 1, "margins": {"top": 19, "bottom": 19, "left": 19, "right": 19}},
            "font_family": "Instrument Sans",
            "spacing": {"line_spacing": 1.2, "paragraph_spacing": 10},
            "elements": {
                "h1": {"alignment": "left", "text_color": "#E74C3C", "background_color": None, "font_weight": "bold", "font_size": 30},
                "h2": {"alignment": "left", "text_color": "#E67E22", "background_color": None, "font_weight": "bold", "font_size": 24},
                "h3": {"alignment": "left", "text_color": "#F1C40F", "background_color": None, "font_weight": "bold", "font_size": 20},
                "h4": {"alignment": "left", "text_color": "#CCCCCC", "background_color": None, "font_weight": "bold", "font_size": 16},
                "h5": {"alignment": "left", "text_color": "#AAAAAA", "background_color": None, "font_weight": "bold", "font_size": 14},
                "paragraph": {"alignment": "left", "text_color": "#333333", "background_color": None, "font_weight": "normal", "font_size": 11},
                "list": {"alignment": "left", "text_color": "#333333", "background_color": None, "font_weight": "normal", "font_size": 11, "number_format": "bullet"},
            },
            "cover_page": {"enabled": True, "title_size": 38, "title_color": "#E74C3C", "show_date": True, "show_author": False},
            "header": {"enabled": False, "text": ""},
            "footer": {"enabled": True, "show_page_number": True, "custom_text": ""},
            "image_defaults": {"alignment": "center", "max_width_percent": 90},
        }
    },
]


def seed_default_templates(db: Session):
    """Seed system default templates if they don't exist, or update existing ones"""
    for tmpl_data in SEEDED_TEMPLATES:
        existing = db.query(ExportTemplate).filter(
            ExportTemplate.user_id.is_(None),
            ExportTemplate.is_default == True,
            ExportTemplate.name == tmpl_data["name"],
        ).first()
        
        if existing:
            # Update config to latest (e.g. mm margin conversion)
            existing.config = tmpl_data["config"]
        else:
            tmpl = ExportTemplate(
                user_id=None,
                name=tmpl_data["name"],
                description=tmpl_data["description"],
                is_default=True,
                config=tmpl_data["config"],
            )
            db.add(tmpl)
    
    db.commit()
    logger.info(f"Seeded/updated {len(SEEDED_TEMPLATES)} default export templates")


# ─── Endpoints ──────────────────────────────────────────────────

@router.get("", response_model=list)
async def list_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all templates available to the user (system defaults + user-created)"""
    templates = db.query(ExportTemplate).filter(
        (ExportTemplate.user_id == current_user.id) | (ExportTemplate.user_id.is_(None))
    ).order_by(ExportTemplate.is_default.desc(), ExportTemplate.name).all()
    
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "is_default": t.is_default,
            "is_system": t.user_id is None,
            "config": t.config,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in templates
    ]


@router.get("/{template_id}", response_model=dict)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific template"""
    tmpl = db.query(ExportTemplate).filter(
        ExportTemplate.id == template_id,
        (ExportTemplate.user_id == current_user.id) | (ExportTemplate.user_id.is_(None))
    ).first()
    
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "description": tmpl.description,
        "is_default": tmpl.is_default,
        "is_system": tmpl.user_id is None,
        "config": tmpl.config,
        "created_at": tmpl.created_at.isoformat() if tmpl.created_at else None,
        "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
    }


@router.post("", response_model=dict, status_code=201)
async def create_template(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new user template"""
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Template name is required")
    
    config = body.get("config", SEEDED_TEMPLATES[0]["config"])  # Default to Standard Academic config
    
    tmpl = ExportTemplate(
        user_id=current_user.id,
        name=name,
        description=body.get("description", ""),
        is_default=False,
        config=config,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "description": tmpl.description,
        "is_default": tmpl.is_default,
        "is_system": False,
        "config": tmpl.config,
        "created_at": tmpl.created_at.isoformat() if tmpl.created_at else None,
        "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
    }


@router.put("/{template_id}", response_model=dict)
async def update_template(
    template_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a user template (cannot edit system defaults)"""
    tmpl = db.query(ExportTemplate).filter(
        ExportTemplate.id == template_id,
        ExportTemplate.user_id == current_user.id,
    ).first()
    
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found or not editable")
    
    if "name" in body:
        tmpl.name = body["name"]
    if "description" in body:
        tmpl.description = body["description"]
    if "config" in body:
        tmpl.config = body["config"]
    
    tmpl.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(tmpl)
    
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "description": tmpl.description,
        "is_default": tmpl.is_default,
        "is_system": False,
        "config": tmpl.config,
        "created_at": tmpl.created_at.isoformat() if tmpl.created_at else None,
        "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
    }


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a user template (cannot delete system defaults)"""
    tmpl = db.query(ExportTemplate).filter(
        ExportTemplate.id == template_id,
        ExportTemplate.user_id == current_user.id,
    ).first()
    
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found or not deletable")
    
    db.delete(tmpl)
    db.commit()
    
    return {"success": True, "message": "Template deleted"}


@router.post("/{template_id}/duplicate", response_model=dict, status_code=201)
async def duplicate_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Duplicate a template (system or user) as a new user template"""
    source = db.query(ExportTemplate).filter(
        ExportTemplate.id == template_id,
        (ExportTemplate.user_id == current_user.id) | (ExportTemplate.user_id.is_(None))
    ).first()
    
    if not source:
        raise HTTPException(status_code=404, detail="Template not found")
    
    new_tmpl = ExportTemplate(
        user_id=current_user.id,
        name=f"{source.name} (Copy)",
        description=source.description,
        is_default=False,
        config=source.config,
    )
    db.add(new_tmpl)
    db.commit()
    db.refresh(new_tmpl)
    
    return {
        "id": new_tmpl.id,
        "name": new_tmpl.name,
        "description": new_tmpl.description,
        "is_default": new_tmpl.is_default,
        "is_system": False,
        "config": new_tmpl.config,
        "created_at": new_tmpl.created_at.isoformat() if new_tmpl.created_at else None,
        "updated_at": new_tmpl.updated_at.isoformat() if new_tmpl.updated_at else None,
    }
