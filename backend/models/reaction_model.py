"""MODEL — Message reaction data access."""
from __future__ import annotations

import pyodbc

from database.singleton import DatabaseSingleton


class ReactionModel:
    def __init__(self) -> None:
        self._db = DatabaseSingleton.get_instance()

    def _conn(self) -> pyodbc.Connection:
        return self._db.get_connection()

    def list_for_chat(self, chat_id: int) -> dict[int, dict[str, list[int]]]:
        conn = self._conn()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT m.id, mr.emoji, mr.user_id
                FROM message_reactions mr
                INNER JOIN messages m ON m.id = mr.message_id
                WHERE m.chat_id = ?
                ORDER BY m.id, mr.emoji, mr.user_id
                """,
                chat_id,
            )
            result: dict[int, dict[str, list[int]]] = {}
            for message_id, emoji, user_id in cur.fetchall():
                mid = int(message_id)
                result.setdefault(mid, {}).setdefault(str(emoji), []).append(int(user_id))
            return result
        finally:
            conn.close()

    def list_for_message(self, message_id: int) -> dict[str, list[int]]:
        conn = self._conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT emoji, user_id FROM message_reactions WHERE message_id = ? ORDER BY emoji, user_id",
                message_id,
            )
            result: dict[str, list[int]] = {}
            for emoji, user_id in cur.fetchall():
                result.setdefault(str(emoji), []).append(int(user_id))
            return result
        finally:
            conn.close()

    def toggle(self, message_id: int, user_id: int, emoji: str) -> dict[str, list[int]]:
        conn = self._conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
                message_id,
                user_id,
                emoji,
            )
            if cur.fetchone():
                cur.execute(
                    "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
                    message_id,
                    user_id,
                    emoji,
                )
            else:
                cur.execute(
                    "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
                    message_id,
                    user_id,
                    emoji,
                )
            conn.commit()
            return self.list_for_message(message_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def message_in_chat(self, message_id: int, chat_id: int) -> bool:
        conn = self._conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM messages WHERE id = ? AND chat_id = ?",
                message_id,
                chat_id,
            )
            return cur.fetchone() is not None
        finally:
            conn.close()
