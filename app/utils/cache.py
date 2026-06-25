import hashlib
import json
import logging
from collections.abc import Callable
from functools import wraps
from typing import Any

import redis as redis_sync
import redis.asyncio as redis_async
from fastapi import Request
from fastapi.encoders import jsonable_encoder

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global Redis clients
_redis_async_client: redis_async.Redis | None = None
_redis_sync_client: redis_sync.Redis | None = None

# --- Async Redis (for FastAPI) ---


async def get_redis_async() -> redis_async.Redis:
    """Get or initialize the async Redis client."""
    global _redis_async_client
    if _redis_async_client is None:
        try:
            _redis_async_client = redis_async.from_url(
                settings.REDIS_URL, encoding="utf-8", decode_responses=True
            )
            await _redis_async_client.ping()
            logger.info("Successfully connected to Redis (async)")
        except Exception as e:
            logger.error(f"Failed to connect to Redis async at {settings.REDIS_URL}: {e}")
            _redis_async_client = None
            raise
    return _redis_async_client


async def get_cache_async(key: str) -> Any | None:
    """Get a value from cache asynchronously."""
    try:
        client = await get_redis_async()
        value = await client.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        logger.error(f"Redis get_cache_async error for key {key}: {e}")
    return None


async def set_cache_async(key: str, value: Any, ttl: int | None = None):
    """Set a value in cache asynchronously."""
    try:
        client = await get_redis_async()
        if ttl is None:
            ttl = settings.CACHE_TTL_SECONDS

        # Ensure value is JSON serializable
        serializable_value = jsonable_encoder(value)
        await client.set(key, json.dumps(serializable_value), ex=ttl)
    except Exception as e:
        logger.error(f"Redis set_cache_async error for key {key}: {e}")


async def delete_cache_async(key: str):
    """Delete a value from cache asynchronously."""
    try:
        client = await get_redis_async()
        await client.delete(key)
    except Exception as e:
        logger.error(f"Redis delete_cache_async error for key {key}: {e}")


# --- Sync Redis (for Worker/Legacy) ---


def get_redis_sync() -> redis_sync.Redis:
    """Get or initialize the sync Redis client."""
    global _redis_sync_client
    if _redis_sync_client is None:
        try:
            _redis_sync_client = redis_sync.from_url(
                settings.REDIS_URL, encoding="utf-8", decode_responses=True
            )
            _redis_sync_client.ping()
            logger.info("Successfully connected to Redis (sync)")
        except Exception as e:
            logger.error(f"Failed to connect to Redis sync at {settings.REDIS_URL}: {e}")
            _redis_sync_client = None
            raise
    return _redis_sync_client


def get_cache_sync(key: str) -> Any | None:
    """Get a value from cache synchronously."""
    try:
        client = get_redis_sync()
        value = client.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        logger.debug(f"Redis get_cache_sync error for key {key}: {e}")
    return None


def set_cache_sync(key: str, value: Any, ttl: int | None = None):
    """Set a value in cache synchronously."""
    try:
        client = get_redis_sync()
        if ttl is None:
            ttl = settings.CACHE_TTL_SECONDS

        # Ensure value is JSON serializable
        serializable_value = jsonable_encoder(value)
        client.set(key, json.dumps(serializable_value), ex=ttl)
    except Exception as e:
        logger.debug(f"Redis set_cache_sync error for key {key}: {e}")


def delete_cache_sync(key: str):
    """Delete a value from cache synchronously."""
    try:
        client = get_redis_sync()
        client.delete(key)
    except Exception as e:
        logger.debug(f"Redis delete_cache_sync error for key {key}: {e}")


def clear_cache_pattern_sync(pattern: str):
    """Delete all keys matching a pattern synchronously."""
    try:
        client = get_redis_sync()
        keys = client.keys(pattern)
        if keys:
            client.delete(*keys)
            logger.debug(f"Cleared {len(keys)} keys matching pattern: {pattern}")
    except Exception as e:
        logger.error(f"Redis clear_cache_pattern_sync error for pattern {pattern}: {e}")


# --- Decorators & Helpers ---


def cache_response(ttl: int | None = None, user_specific: bool = True):
    """
    Decorator to cache FastAPI response (async).
    :param ttl: Cache TTL in seconds.
    :param user_specific: If True, includes current_user.id in the cache key.
    """

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Request | None = kwargs.get("request")
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if not request:
                return await func(*args, **kwargs)

            # Base key from URL
            cache_key = f"cache_resp:{request.url.path}:{request.query_params!s}"

            # Add user context if required
            if user_specific:
                current_user = kwargs.get("current_user")
                if current_user and hasattr(current_user, "id"):
                    cache_key = f"{cache_key}:u{current_user.id}"
                else:
                    # Fallback to authorization header if user not in kwargs
                    auth = request.headers.get("Authorization", "")
                    if auth:
                        auth_hash = hashlib.sha256(auth.encode()).hexdigest()
                        cache_key = f"{cache_key}:auth{auth_hash}"

            cached_val = await get_cache_async(cache_key)
            if cached_val is not None:
                logger.info(f"Cache hit for {cache_key}")
                return cached_val

            result = await func(*args, **kwargs)
            if result is not None:
                await set_cache_async(cache_key, result, ttl=ttl)
            return result

        return wrapper

    return decorator
