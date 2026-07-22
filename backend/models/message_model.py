"""MODEL — Message data access."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pyodbc

from database.singleton import DatabaseSingleton
from models.db import row_to_dict

DELETED_CONTENT = "[deleted]"

_MSG_SELECT = """
  SELECT m.id, m.chat_id, m.content, m.created_at, m.sender_id, m.is_read, m.reply_to_id, m.edited_at,
         m.is_deleted, m.deleted_at,
         u.display_name AS sender_name, u.avatar_color AS sender_color,
         r.content AS reply_to_content, r.is_deleted AS reply_to_deleted,
         ru.display_name AS reply_to_sender
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  LEFT JOIN messages r ON r.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = r.sender_id
"""


class MessageModel:
  def __init__(self) -> None:
    self._db = DatabaseSingleton.get_instance()

  def _conn(self) -> pyodbc.Connection:
    return self._db.get_connection()

  def count_by_chat(self, chat_id: int, user_id: int | None = None) -> int:
    conn = self._conn()
    try:
      cur = conn.cursor()
      if user_id is not None:
        cur.execute(
          """
          SELECT COUNT(*)
          FROM messages m
          WHERE m.chat_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM message_hidden h
              WHERE h.message_id = m.id AND h.user_id = ?
            )
          """,
          chat_id,
          user_id,
        )
      else:
        cur.execute("SELECT COUNT(*) FROM messages WHERE chat_id = ?", chat_id)
      return int(cur.fetchone()[0])
    finally:
      conn.close()

  def list_for_chat(
    self, chat_id: int, offset: int, limit: int, user_id: int | None = None
  ) -> list[dict]:
    conn = self._conn()
    try:
      cur = conn.cursor()
      hidden_clause = ""
      params: list = [chat_id]
      if user_id is not None:
        hidden_clause = """
          AND NOT EXISTS (
            SELECT 1 FROM message_hidden h
            WHERE h.message_id = m.id AND h.user_id = ?
          )
        """
        params.append(user_id)
      params.extend([offset, limit])
      cur.execute(
        f"""
        {_MSG_SELECT}
        WHERE m.chat_id = ?
        {hidden_clause}
        ORDER BY m.created_at ASC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """,
        params,
      )
      return [row_to_dict(cur, row) for row in cur.fetchall()]
    finally:
      conn.close()

  def list_after_id(
    self, chat_id: int, since_id: int, limit: int, user_id: int | None = None
  ) -> list[dict]:
    conn = self._conn()
    try:
      cur = conn.cursor()
      hidden_clause = ""
      params: list = [chat_id, since_id]
      if user_id is not None:
        hidden_clause = """
          AND NOT EXISTS (
            SELECT 1 FROM message_hidden h
            WHERE h.message_id = m.id AND h.user_id = ?
          )
        """
        params.append(user_id)
      params.extend([0, limit])
      cur.execute(
        f"""
        {_MSG_SELECT}
        WHERE m.chat_id = ?
          AND m.id > ?
        {hidden_clause}
        ORDER BY m.created_at ASC, m.id ASC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """,
        params,
      )
      return [row_to_dict(cur, row) for row in cur.fetchall()]
    finally:
      conn.close()

  def get_by_id(self, message_id: int) -> dict | None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(f"{_MSG_SELECT} WHERE m.id = ?", message_id)
      row = cur.fetchone()
      return row_to_dict(cur, row) if row else None
    finally:
      conn.close()

  def create(self, chat_id: int, sender_id: int, content: str, reply_to_id: int | None = None) -> dict:
    conn = self._conn()
    try:
      cur = conn.cursor()
      if reply_to_id:
        cur.execute(
          "INSERT INTO messages (chat_id, sender_id, content, reply_to_id) OUTPUT INSERTED.id VALUES (?, ?, ?, ?)",
          chat_id,
          sender_id,
          content,
          reply_to_id,
        )
      else:
        cur.execute(
          "INSERT INTO messages (chat_id, sender_id, content) OUTPUT INSERTED.id VALUES (?, ?, ?)",
          chat_id,
          sender_id,
          content,
        )
      message_id = int(cur.fetchone()[0])
      cur.execute(f"{_MSG_SELECT} WHERE m.id = ?", message_id)
      row = cur.fetchone()
      conn.commit()
      return row_to_dict(cur, row)
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def update_content(self, message_id: int, sender_id: int, content: str) -> dict | None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        "SELECT sender_id, created_at, is_deleted FROM messages WHERE id = ?",
        message_id,
      )
      row = cur.fetchone()
      if not row or int(row[0]) != sender_id or bool(row[2]):
        return None
      created = row[1]
      if isinstance(created, datetime):
        age = datetime.now(timezone.utc).replace(tzinfo=None) - created
        if age > timedelta(hours=48):
          return None
      cur.execute(
        "UPDATE messages SET content = ?, edited_at = GETUTCDATE() WHERE id = ?",
        content,
        message_id,
      )
      conn.commit()
      return self.get_by_id(message_id)
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def hide_for_user(self, message_id: int, user_id: int, chat_id: int) -> bool:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        "SELECT id FROM messages WHERE id = ? AND chat_id = ?",
        message_id,
        chat_id,
      )
      if not cur.fetchone():
        return False
      cur.execute(
        """
        MERGE message_hidden AS t
        USING (SELECT ? AS user_id, ? AS message_id, ? AS chat_id) AS s
        ON t.user_id = s.user_id AND t.message_id = s.message_id
        WHEN NOT MATCHED THEN
          INSERT (user_id, message_id, chat_id) VALUES (s.user_id, s.message_id, s.chat_id);
        """,
        user_id,
        message_id,
        chat_id,
      )
      conn.commit()
      return True
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def soft_delete_for_everyone(
    self, message_id: int, sender_id: int, chat_id: int
  ) -> dict | None:
    """Mark message deleted for all chat members (Telegram-style placeholder)."""
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        UPDATE messages
        SET is_deleted = 1, content = ?, deleted_at = GETUTCDATE()
        WHERE id = ? AND sender_id = ? AND chat_id = ? AND is_deleted = 0
        """,
        DELETED_CONTENT,
        message_id,
        sender_id,
        chat_id,
      )
      if cur.rowcount <= 0:
        conn.commit()
        return None
      conn.commit()
      return self.get_by_id(message_id)
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def mark_read(self, chat_id: int, user_id: int) -> None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        UPDATE messages SET is_read = 1
        WHERE chat_id = ? AND sender_id <> ? AND is_read = 0
        """,
        chat_id,
        user_id,
      )
      conn.commit()
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()
