"""WebSocket connection manager"""
from fastapi import WebSocket
from typing import Set, Dict
import json
import logging

logger = logging.getLogger(__name__)


"""WebSocket connection manager with Redis Pub/Sub support for cross-process communication"""
from fastapi import WebSocket
from typing import Set, Dict, Optional
import json
import logging
import asyncio
import redis.asyncio as redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ConnectionManager:
    """Manage WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub_task: Optional[asyncio.Task] = None
    
    async def connect(self, user_id: int, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected. Active connections: {len(self.active_connections[user_id])}")
        
        # Start Redis Pub/Sub listener if not already running
        if not self.pubsub_task:
            self.pubsub_task = asyncio.create_task(self._redis_pubsub_listener())

    def disconnect(self, user_id: int, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            logger.info(f"User {user_id} disconnected")

    async def _redis_pubsub_listener(self):
        """Listen for messages from Redis Pub/Sub and broadcast to local connections"""
        logger.info("Starting Redis Pub/Sub listener for WebSockets...")
        try:
            self.redis_client = redis.from_url(settings.REDIS_URL)
            pubsub = self.redis_client.pubsub()
            await pubsub.subscribe("websocket_updates")
            
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        user_id = data.get("user_id")
                        payload = data.get("payload")
                        if user_id is not None and payload is not None:
                            await self.broadcast_to_user(int(user_id), payload)
                    except Exception as e:
                        logger.error(f"Error processing Redis Pub/Sub message: {e}")
        except Exception as e:
            logger.error(f"Redis Pub/Sub listener error: {e}")
            self.pubsub_task = None
            # Retry after delay
            await asyncio.sleep(5)
            self.pubsub_task = asyncio.create_task(self._redis_pubsub_listener())

    async def broadcast_to_user(self, user_id: int, message: dict):
        """Send message to all local connections for a user"""
        if user_id not in self.active_connections:
            return
        
        disconnected = set()
        for connection in self.active_connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {e}")
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

    @staticmethod
    def publish_update(user_id: int, payload: dict):
        """Publish an update to Redis so it can be picked up by any API instance"""
        import redis as redis_sync
        try:
            r = redis_sync.from_url(settings.REDIS_URL)
            message = json.dumps({"user_id": user_id, "payload": payload})
            r.publish("websocket_updates", message)
        except Exception as e:
            logger.error(f"Error publishing WebSocket update to Redis: {e}")


# Global connection manager
manager = ConnectionManager()
