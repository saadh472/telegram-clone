"""VIEW — User JSON response formatting."""
from __future__ import annotations

from datetime import datetime
from typing import Any


def user_json(row: dict, public: bool = False) -> dict[str, Any]:
    dto = {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "avatar_color": row["avatar_color"],
    }
    if public:
        dto["online"] = bool(row.get("online", False))
        last = row.get("last_seen")
        if isinstance(last, datetime):
            dto["last_seen"] = last.isoformat() + "Z"
        elif last:
            dto["last_seen"] = str(last)
    return dto


def users_json(rows: list[dict], public: bool = True) -> list[dict]:
    return [user_json(r, public=public) for r in rows]
