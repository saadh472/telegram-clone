"""SERVICE — In-memory rate limiting for auth and abuse-prone endpoints."""
from __future__ import annotations

import time
from collections import defaultdict
from functools import wraps
from typing import Callable

from flask import Response, jsonify, request

_buckets: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_calls: int, window_seconds: int) -> Callable:
    """Limit requests per client IP within a sliding time window."""

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            client = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown")
            client_ip = client.split(",")[0].strip()
            key = f"{fn.__name__}:{client_ip}"
            now = time.time()
            cutoff = now - window_seconds
            bucket = [t for t in _buckets[key] if t >= cutoff]
            if len(bucket) >= max_calls:
                resp: Response = jsonify({"error": "Too many requests. Try again later."})
                resp.status_code = 429
                resp.headers["Retry-After"] = str(window_seconds)
                return resp
            bucket.append(now)
            _buckets[key] = bucket
            return fn(*args, **kwargs)

        return wrapper

    return decorator
