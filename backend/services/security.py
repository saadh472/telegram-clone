"""SERVICE — JWT security and auth helpers (maps to LST security)."""
from __future__ import annotations

import functools
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import jwt
from flask import Request, g, jsonify, request

import config


def create_token(user_id: int, username: str) -> str:
    payload = {
        "id": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=config.JWT_EXPIRATION_SECONDS),
    }
    token = jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")
    return token if isinstance(token, str) else token.decode("utf-8")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])


def get_bearer_token(req: Request) -> str | None:
    header = req.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def login_required(fn: Callable):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        token = get_bearer_token(request)
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        try:
            payload = decode_token(token)
            g.user_id = int(payload["id"])
            g.username = payload.get("username", "")
        except jwt.PyJWTError:
            return jsonify({"error": "Invalid token"}), 401
        return fn(*args, **kwargs)

    return wrapper
