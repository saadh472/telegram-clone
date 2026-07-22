"""In-memory TTL cache for hot read endpoints (users list, chat summaries)."""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_lock = threading.Lock()
_store: dict[str, tuple[float, Any]] = {}


def get(key: str) -> Any | None:
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        expires, value = item
        if expires <= time.monotonic():
            del _store[key]
            return None
        return value


def set(key: str, value: Any, ttl_seconds: float) -> None:
    with _lock:
        _store[key] = (time.monotonic() + ttl_seconds, value)


def invalidate_prefix(prefix: str) -> None:
    with _lock:
        for key in list(_store):
            if key.startswith(prefix):
                del _store[key]


def invalidate_user(user_id: int) -> None:
    invalidate_prefix(f"chats:{user_id}:")
    invalidate_prefix(f"users:{user_id}")


def get_or_set(key: str, ttl_seconds: float, factory: Callable[[], T]) -> T:
    cached = get(key)
    if cached is not None:
        return cached
    value = factory()
    set(key, value, ttl_seconds)
    return value
