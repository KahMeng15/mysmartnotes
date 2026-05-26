"""WebSocket router for real-time updates"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
import logging

from app.utils.db import get_db
from app.utils.auth import decode_token
from app.utils.websocket import manager
from app.models.db import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

@router.websocket("/{token}")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time task updates.
    Expects a JWT token in the path for authentication.
    """
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=1008) # Policy Violation
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=1008)
        return

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        await websocket.close(code=1008)
        return

    await manager.connect(user.id, websocket)
    try:
        while True:
            # Keep connection alive and wait for client messages (if any)
            data = await websocket.receive_text()
            # We don't expect client messages for now, but we keep it to handle disconnects
    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error for user {user.id}: {e}")
        manager.disconnect(user.id, websocket)
