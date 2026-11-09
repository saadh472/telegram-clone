"""VIEW — Chat and message JSON response formatting."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


def _iso(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat() + "Z"
    return str(dt)


def message_json(row: dict) -> dict[str, Any]:
    is_deleted = bool(row.get("is_deleted", False))
    content = row.get("content")
    if is_deleted:
        content = "[deleted]"
    dto: dict[str, Any] = {
        "id": row["id"],
        "content": content,
        "created_at": _iso(row["created_at"]),
        "sender_id": row["sender_id"],
        "sender_name": row.get("sender_name"),
        "sender_color": row.get("sender_color"),
        "is_read": bool(row.get("is_read", False)),
        "is_deleted": is_deleted,
    }
    if row.get("reply_to_id"):
        dto["reply_to_id"] = row["reply_to_id"]
        reply_deleted = bool(row.get("reply_to_deleted", False))
        reply_content = row.get("reply_to_content")
        if reply_deleted or reply_content == "[deleted]":
            dto["reply_to_content"] = "[deleted]"
        elif reply_content:
            dto["reply_to_content"] = reply_content
        if row.get("reply_to_sender"):
            dto["reply_to_sender"] = row["reply_to_sender"]
    if row.get("edited_at") and not is_deleted:
        dto["edited_at"] = _iso(row["edited_at"])
    if is_deleted and row.get("deleted_at"):
        dto["deleted_at"] = _iso(row["deleted_at"])
    return dto


def messages_json(rows: list[dict]) -> list[dict]:
    return [message_json(r) for r in rows]


def chat_summary_json(data: dict) -> dict[str, Any]:
    dto = {
        "id": data["id"],
        "name": data.get("name"),
        "type": data["type"],
        "last_message": data.get("last_message"),
        "last_message_time": _iso(data.get("last_message_time")),
        "last_message_deleted": bool(data.get("last_message_deleted", False)),
        "unread_count": int(data.get("unread_count") or 0),
        "display_name": data.get("display_name"),
        "avatar_color": data.get("avatar_color"),
    }
    if data.get("other_user_id"):
        dto["other_user_id"] = data["other_user_id"]
    if data.get("other_online") is not None:
        dto["other_online"] = bool(data["other_online"])
    if data.get("other_last_seen"):
        dto["other_last_seen"] = _iso(data["other_last_seen"])
    return dto


def chats_json(rows: list[dict]) -> list[dict]:
    return [chat_summary_json(r) for r in rows]


def chat_created_json(chat_id: int, chat_type: str, name: Optional[str] = None, existing: bool = False) -> dict:
    body: dict[str, Any] = {"id": chat_id, "type": chat_type}
    if name:
        body["name"] = name
    if existing:
        body["existing"] = True
    return body
