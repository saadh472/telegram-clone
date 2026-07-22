"""VIEW — Auth JSON response formatting (maps to FST contract)."""
from __future__ import annotations

from typing import Any

from views.user_view import user_json


def auth_json(token: str, user_row: dict) -> dict[str, Any]:
    return {"token": token, "user": user_json(user_row)}


def logout_json() -> dict[str, bool]:
    return {"success": True}


def error_json(message: str) -> dict[str, str]:
    return {"error": message}
