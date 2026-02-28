"""WebSocket connection manager"""
from fastapi import WebSocket
from typing import Set, Dict
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
    
    async def connect(self, user_id: int, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected. Active connections: {len(self.active_connections[user_id])}")
    
    def disconnect(self, user_id: int, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            logger.info(f"User {user_id} disconnected")
    
    async def broadcast_to_user(self, user_id: int, message: dict):
        """Send message to all connections for a user"""
        if user_id not in self.active_connections:
            return
        
        disconnected = set()
        for connection in self.active_connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected connections
        for connection in disconnected:
            self.active_connections[user_id].discard(connection)
    
    async def send_personal_message(self, websocket: WebSocket, message: dict):
        """Send message to specific connection"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")


# Global connection manager
manager = ConnectionManager()
